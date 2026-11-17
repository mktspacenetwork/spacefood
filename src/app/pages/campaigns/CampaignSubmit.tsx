import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, CheckCircle2, Loader2, Lock, RefreshCw, Send } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Skeleton } from "../../components/ui/skeleton";
import { PhotoPicker, type PhotoDraft } from "../../components/campaigns/PhotoPicker";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, CampaignApiError, errMsg, uploadToSignedUrl } from "../../lib/campaigns/api";
import { DEFAULT_PHOTO_MB } from "../../lib/campaigns/media";
import { SUBMIT_TOUR } from "../../lib/campaigns/tours-collab";
import { cn } from "../../lib/utils";
import type { MySubmission, UploadTicket } from "../../lib/campaigns/types";

type Phase = "idle" | "saving" | "uploading" | "finalizing" | "partial" | "done";
type CreateResp = { submission_id: string; status: string; uploads: UploadTicket[] };
type UpdateResp = { changed: boolean; status: string; uploads: UploadTicket[] };

const BLOCKING_CODES = ["EDIT_LOCKED", "REGISTRATION_CLOSED", "REGISTRATION_PAUSED", "CAMPAIGN_UNAVAILABLE", "NOT_ELIGIBLE"];
const NAME_MIN = 3;
const NAME_MAX = 120;
const DESC_SHOWN = 300; // limite exibido (o servidor aceita até 600)
const DESC_MAX = 600;

type Fields = { dish_name: string; description: string };

function validate(f: Fields): { dish_name?: string; description?: string } {
  const out: { dish_name?: string; description?: string } = {};
  const n = f.dish_name.trim().length;
  if (n < NAME_MIN) out.dish_name = `Escreva o nome da receita (mínimo ${NAME_MIN} letras).`;
  else if (n > NAME_MAX) out.dish_name = `O nome pode ter até ${NAME_MAX} letras.`;
  if (f.description.trim().length > DESC_MAX) out.description = `A descrição pode ter até ${DESC_MAX} letras.`;
  return out;
}

const LABEL = "text-xs font-bold uppercase tracking-wider text-muted-foreground";
const FIELD = "rounded-xl border-border focus:ring-primary/30";

/** Participar (ou editar a própria receita): nome, descrição breve opcional e UMA foto. */
export function CampaignSubmit() {
  const { campaign, state, refresh, slug } = useCampaignCtx();
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = `/campanhas/${slug}`;
  const api = `/campaigns/${encodeURIComponent(slug)}`;

  // Modo definido na entrada da tela: quem já tem receita edita; os demais criam.
  const isEdit = useRef(Boolean(state.my_submission_id)).current;
  const maxMb = campaign.media_limits?.max_photo_mb || DEFAULT_PHOTO_MB;
  const needPhoto = campaign.features.photos !== false;

  const [fields, setFields] = useState<Fields>({ dish_name: "", description: "" });
  const [original, setOriginal] = useState<Fields | null>(null);
  const [photo, setPhoto] = useState<PhotoDraft | null>(null);
  // Linhas de foto principal que já existem no servidor (para saber o que remover ao trocar a foto).
  const [serverMainIds, setServerMainIds] = useState<string[]>([]);
  const [submissionId, setSubmissionId] = useState<string | null>(state.my_submission_id ?? null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showErrors, setShowErrors] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [doneDish, setDoneDish] = useState("");
  const inflight = useRef(false);
  const photoRef = useRef<PhotoDraft | null>(null);
  photoRef.current = photo;

  const busy = phase === "saving" || phase === "uploading" || phase === "finalizing";

  // ── Carrega a receita existente (modo edição), uma única vez ──────────────
  const loadExisting = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await campaignsApi.get<{ submission: MySubmission | null }>(`${api}/my-submission`);
      const s = r.submission;
      if (!s) { setLoadError("Não encontramos a sua receita."); return; }
      const f: Fields = { dish_name: s.dish_name, description: s.description ?? "" };
      setFields(f);
      setOriginal(f);
      setSubmissionId(s.id);
      const main = s.media.find((m) => m.kind === "main_photo") ?? s.media.find((m) => m.kind === "photo");
      const ids: string[] = main ? [main.id] : [];
      if (main) {
        setPhoto({ previewUrl: main.url, mime: main.mime, size: main.size, serverId: main.id, serverStatus: "ready", progress: 0 });
      } else if (s.status === "pending_media") {
        // Envio interrompido: a linha existe no servidor, mas o arquivo não chegou.
        try {
          const u = await campaignsApi.post<{ uploads: UploadTicket[] }>(`${api}/submission/${s.id}/uploads`);
          const t = (u.uploads ?? []).find((x) => x.kind === "main_photo") ?? (u.uploads ?? [])[0];
          if (t) {
            ids.push(t.id);
            setPhoto({ previewUrl: "", mime: t.mime, size: 0, serverId: t.id, serverStatus: "pending", progress: 0 });
          }
        } catch { /* sem o ticket a pessoa ainda consegue escolher a foto de novo */ }
      }
      setServerMainIds(ids);
    } catch (e) {
      setLoadError(errMsg(e, "Não foi possível carregar a sua receita."));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { if (isEdit) void loadExisting(); }, [isEdit, loadExisting]);

  // Avisa antes de fechar a aba no meio de um envio.
  useEffect(() => {
    if (!busy) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);

  const blockReason = (): string | null => {
    if (blockedMsg) return blockedMsg;
    if (isEdit) {
      if (state.can_edit) return null;
      return state.my_submission_status === "approved"
        ? "Sua receita já foi aprovada e não pode mais ser alterada."
        : "Não dá para editar a receita agora.";
    }
    if (state.can_submit) return null;
    switch (state.registration) {
      case "upcoming": return "As inscrições ainda não abriram.";
      case "paused": return "As inscrições estão em pausa.";
      case "closed": return "As inscrições foram encerradas.";
      default: return "Esta campanha não está recebendo receitas agora.";
    }
  };
  const blocked = phase === "done" ? null : blockReason();

  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "submit", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user && !blocked && !loading && !loadError,
  });

  // ── Salvar / enviar ───────────────────────────────────────────────────────
  const persist = async () => {
    if (inflight.current) return;
    const cur = photoRef.current;
    const errs = validate(fields);
    const photoMissing = needPhoto && !(cur && (cur.file || cur.serverStatus === "ready"));
    if (errs.dish_name || errs.description || photoMissing) {
      setShowErrors(true);
      toast.warning("Confira os campos destacados.");
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"], [role="alert"]')?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    if (cur?.invalid) { toast.warning("Troque a foto para continuar."); return; }

    inflight.current = true;
    setBanner(null);
    let sid = submissionId;
    let createdNow = false;
    try {
      setPhase("saving");
      const f: Fields = { dish_name: fields.dish_name.trim(), description: fields.description.trim() };
      const keepId = cur?.serverId; // linha existente (pronta ou pendente) que continua valendo
      const isNewFile = !!cur?.file && !cur.serverId; // foto nova: precisa de uma nova intenção de envio
      const remove = serverMainIds.filter((id) => id !== keepId);
      const addMeta = isNewFile && cur ? [{ kind: "main_photo" as const, mime: cur.mime, size: cur.size }] : [];
      let tickets: UploadTicket[] = [];
      let changed = false;

      if (!sid) {
        const r = await campaignsApi.post<CreateResp>(`${api}/submission`, { ...f, ingredients: "", preparation: "", media: addMeta });
        sid = r.submission_id;
        createdNow = true;
        changed = true;
        tickets = r.uploads ?? [];
        setSubmissionId(sid);
      } else {
        const textChanged = !original || f.dish_name !== original.dish_name || f.description !== original.description;
        if (textChanged || remove.length > 0 || addMeta.length > 0) {
          const r = await campaignsApi.put<UpdateResp>(`${api}/submission/${sid}`, { ...f, remove, add: addMeta });
          tickets = r.uploads ?? [];
          changed = r.changed;
        }
      }
      if (addMeta.length > 0 && tickets.length !== addMeta.length) {
        throw new Error("O servidor não preparou o envio da foto. Tente de novo.");
      }
      setOriginal(f);
      let ticket: UploadTicket | undefined = tickets[0];
      const serverId = keepId ?? ticket?.id;
      setServerMainIds(serverId ? [serverId] : []);
      if (isNewFile && ticket) setPhoto((p) => (p ? { ...p, serverId: ticket!.id, serverStatus: "pending" } : p));

      // Falta subir o arquivo? (foto nova agora, ou falha de uma tentativa anterior)
      const needsUpload = !!cur?.file && !cur.uploaded && (isNewFile || cur.serverStatus === "pending");
      if (needsUpload && !ticket) {
        const re = await campaignsApi.post<{ uploads: UploadTicket[] }>(`${api}/submission/${sid}/uploads`);
        ticket = (re.uploads ?? []).find((t) => t.id === keepId) ?? (re.uploads ?? [])[0];
      }

      if (needsUpload) {
        setPhase("uploading");
        if (!ticket || !cur?.file) {
          setPhoto((p) => (p ? { ...p, error: "Não foi possível preparar o envio da foto." } : p));
          setPhase("partial");
          setBanner("Sua receita foi registrada, mas a foto não foi enviada. Toque em “Tentar de novo”.");
          return;
        }
        setPhoto((p) => (p ? { ...p, progress: 0.01, error: undefined } : p));
        let last = 0;
        try {
          await uploadToSignedUrl(ticket.signedUrl, cur.file, (p) => {
            if (p - last >= 0.03 || p === 1) { last = p; setPhoto((d) => (d ? { ...d, progress: p } : d)); }
          });
          setPhoto((d) => (d ? { ...d, progress: 1, uploaded: true, error: undefined } : d));
        } catch (e) {
          const msg = "Sua receita foi registrada, mas a foto não foi enviada. Toque em “Tentar de novo”.";
          setPhoto((d) => (d ? { ...d, progress: 0, error: errMsg(e, "Falha no envio da foto.") } : d));
          setPhase("partial");
          setBanner(msg);
          toast.error(msg);
          return;
        }
      }

      const needsFinalize = !!photoRef.current && (needsUpload || photoRef.current.serverStatus === "pending" || isNewFile);
      if (needsFinalize) {
        setPhase("finalizing");
        try {
          await campaignsApi.post(`${api}/submission/${sid}/finalize`);
        } catch (e) {
          if (e instanceof CampaignApiError && (e.code === "MEDIA_NOT_VERIFIED" || e.code === "MEDIA_INVALID")) {
            setPhoto((d) => (d
              ? (e.code === "MEDIA_INVALID"
                  ? { ...d, error: e.message, invalid: true, uploaded: false, progress: 0 }
                  : { ...d, error: "A foto não chegou ao servidor. Tente enviar de novo.", uploaded: false, progress: 0 })
              : d));
            setPhase("partial");
            setBanner(e.message);
            toast.error(e.message);
            return;
          }
          throw e;
        }
        setPhoto((d) => (d ? { ...d, serverStatus: "ready", error: undefined } : d));
      }

      const touched = createdNow || changed || remove.length > 0 || addMeta.length > 0 || needsFinalize;
      if (!createdNow && isEdit) {
        setPhase("idle");
        if (!touched) { toast.info("Nenhuma alteração para salvar."); return; }
        toast.success("Salvo! Sua receita voltou para análise.");
        await refresh();
        navigate(`${base}/participacao`);
        return;
      }

      setDoneDish(f.dish_name);
      setPhase("done");
      void refresh();
    } catch (e) {
      const code = e instanceof CampaignApiError ? e.code : "";
      if (code === "ALREADY_SUBMITTED") {
        toast.info("Você já enviou uma receita nesta campanha.");
        await refresh();
        navigate(`${base}/participacao`, { replace: true });
        return;
      }
      if (BLOCKING_CODES.includes(code)) { setBlockedMsg(errMsg(e)); void refresh(); }
      setBanner(errMsg(e));
      toast.error(errMsg(e));
      setPhase(sid ? "partial" : "idle");
    } finally {
      inflight.current = false;
    }
  };

  // ── Telas ─────────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
        <Card className="rounded-3xl p-8 text-center hover:shadow-sm" role="status">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400">
            <CheckCircle2 size={36} aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Receita enviada!</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            {doneDish ? <>“{doneDish}” </> : null}Ela será analisada pela equipe.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => navigate(`${base}/participacao`)} className="h-12 rounded-xl px-6">Ver minha receita</Button>
            <Button variant="outline" onClick={() => navigate(base)} className="h-12 rounded-xl px-6">Voltar à campanha</Button>
          </div>
        </Card>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
        <span className="sr-only">Carregando a sua receita…</span>
      </div>
    );
  }
  if (loadError) return <ErrorState message={loadError} onRetry={() => void loadExisting()} />;

  const disabled = busy || !!blocked;
  const label =
    phase === "saving" ? "Salvando…"
    : phase === "uploading" ? "Enviando a foto…"
    : phase === "finalizing" ? "Finalizando…"
    : phase === "partial" ? "Tentar de novo"
    : isEdit ? "Salvar alterações" : "Enviar receita";
  const errs = showErrors ? validate(fields) : {};
  const descLen = fields.description.length;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">{isEdit ? "Editar minha receita" : "Participar"}</h2>
        <TourButton onClick={tour.start} />
      </div>

      {blocked && (
        <Card role="alert" className="rounded-3xl border-yellow-200 bg-yellow-50 p-4 hover:shadow-sm dark:border-yellow-900/50 dark:bg-yellow-950/20">
          <p className="flex items-start gap-2 text-sm font-medium text-yellow-900 dark:text-yellow-100">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{blocked}</span>
          </p>
          <Button variant="outline" size="sm" className="mt-3 h-11 rounded-xl px-4" onClick={() => navigate(isEdit ? `${base}/participacao` : base)}>
            {isEdit ? "Ver minha receita" : "Voltar à campanha"}
          </Button>
        </Card>
      )}

      {isEdit && !blocked && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="note">
          <AlertTriangle size={13} className="shrink-0" aria-hidden="true" /> Ao salvar, a receita volta para análise.
        </p>
      )}

      {banner && (
        <Card role="alert" className="rounded-3xl border-red-200 bg-red-50 p-4 hover:shadow-sm dark:border-red-900/50 dark:bg-red-950/20">
          <p className="flex items-start gap-2 text-sm font-medium text-red-900 dark:text-red-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{banner}</span>
          </p>
        </Card>
      )}

      <Card className="space-y-4 rounded-3xl p-5 hover:shadow-sm" data-tutorial="camp-fields">
        <div className="space-y-1.5">
          <label htmlFor="camp-dish" className={LABEL}>Nome da receita</label>
          <Input
            id="camp-dish"
            value={fields.dish_name}
            onChange={(e) => setFields((f) => ({ ...f, dish_name: e.target.value }))}
            disabled={disabled}
            maxLength={NAME_MAX}
            placeholder="Ex.: Bolo de fubá da vovó"
            autoComplete="off"
            aria-invalid={!!errs.dish_name}
            className={cn(FIELD, "h-12")}
          />
          {errs.dish_name && <p role="alert" className="text-sm font-medium text-destructive">{errs.dish_name}</p>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="camp-desc" className={LABEL}>Descrição <span className="font-medium normal-case tracking-normal">(opcional)</span></label>
            <span className="text-[11px] tabular-nums text-muted-foreground">{descLen}/{DESC_SHOWN}</span>
          </div>
          <Textarea
            id="camp-desc"
            value={fields.description}
            onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
            disabled={disabled}
            maxLength={Math.max(DESC_SHOWN, descLen)}
            rows={3}
            placeholder="Uma frase sobre a receita ou a lembrança dela"
            aria-invalid={!!errs.description}
            className={cn(FIELD, "min-h-[88px]")}
          />
          {errs.description && <p role="alert" className="text-sm font-medium text-destructive">{errs.description}</p>}
        </div>
      </Card>

      {needPhoto && (
        <div data-tutorial="camp-photo" className="space-y-2">
          <p className={LABEL}>Foto da receita</p>
          <PhotoPicker draft={photo} setDraft={setPhoto} maxMb={maxMb} disabled={disabled} showError={showErrors} />
        </div>
      )}

      {!blocked && (
        <div className="sticky bottom-[4.75rem] z-10 -mx-4 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-2 pt-4 md:bottom-4 md:mx-0 md:px-0">
          <Button
            size="lg"
            data-tutorial="camp-send"
            onClick={() => void persist()}
            disabled={disabled}
            className="h-14 w-full gap-2 rounded-2xl text-base font-bold"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : phase === "partial" ? <RefreshCw size={18} /> : <Send size={18} />}
            {label}
          </Button>
          {busy && <p className="mt-2 text-center text-xs text-muted-foreground" aria-live="polite">Não feche esta tela até terminar.</p>}
        </div>
      )}

      <CampaignTour steps={SUBMIT_TOUR} tour={tour} />
    </motion.div>
  );
}
