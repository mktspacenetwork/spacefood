import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, CheckCircle2, Loader2, Lock, RefreshCw, Send, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Skeleton } from "../../components/ui/skeleton";
import { RecipeForm, EMPTY_RECIPE, validateRecipe, type RecipeFields, type RecipeFieldKey } from "../../components/campaigns/RecipeForm";
import { MediaUploader, makeDraftKey, type MediaDraft } from "../../components/campaigns/MediaUploader";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, CampaignApiError, errMsg, uploadToSignedUrl } from "../../lib/campaigns/api";
import { fmtDateTime, SUBMISSION_STATUS } from "../../lib/campaigns/format";
import { SUBMIT_TOUR } from "../../lib/campaigns/tours-collab";
import { cn } from "../../lib/utils";
import type { MySubmission, UploadTicket } from "../../lib/campaigns/types";

type Phase = "idle" | "saving" | "uploading" | "finalizing" | "partial" | "done";
type CreateResp = { submission_id: string; status: string; uploads: UploadTicket[] };
type UpdateResp = { changed: boolean; status: string; uploads: UploadTicket[] };

const BLOCKING_CODES = ["EDIT_LOCKED", "REGISTRATION_CLOSED", "REGISTRATION_PAUSED", "CAMPAIGN_UNAVAILABLE", "NOT_ELIGIBLE"];

/** Cria (ou edita) a receita do colaborador, envia as mídias direto ao Storage e finaliza. */
export function CampaignSubmit() {
  const { campaign, state, refresh, slug } = useCampaignCtx();
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = `/campanhas/${slug}`;
  const api = `/campaigns/${encodeURIComponent(slug)}`;

  // Modo definido na entrada da tela: quem já tem receita edita; os demais criam.
  const isEdit = useRef(Boolean(state.my_submission_id)).current;
  const limits = campaign.media_limits;
  const allowPhotos = !!campaign.features.photos;
  const allowVideo = !!campaign.features.video && !!limits.allow_video;
  const needMain = allowPhotos && !!limits.require_main_photo;

  const [fields, setFields] = useState<RecipeFields>(EMPTY_RECIPE);
  const [original, setOriginal] = useState<RecipeFields | null>(null);
  const [drafts, setDrafts] = useState<MediaDraft[]>([]);
  const [serverMedia, setServerMedia] = useState<string[]>([]);
  const [submissionId, setSubmissionId] = useState<string | null>(state.my_submission_id ?? null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showErrors, setShowErrors] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const [doneDish, setDoneDish] = useState("");
  const inflight = useRef(false);
  const draftsRef = useRef<MediaDraft[]>([]);
  draftsRef.current = drafts;

  const busy = phase === "saving" || phase === "uploading" || phase === "finalizing";

  // ── Carrega a receita existente (modo edição), uma única vez ──────────────
  const loadExisting = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await campaignsApi.get<{ submission: MySubmission | null }>(`${api}/my-submission`);
      const s = r.submission;
      if (!s) { setLoadError("Não encontramos a sua receita."); return; }
      const f: RecipeFields = { dish_name: s.dish_name, description: s.description, ingredients: s.ingredients, preparation: s.preparation };
      setFields(f);
      setOriginal(f);
      setSubmissionId(s.id);
      const ready: MediaDraft[] = s.media.map((m) => ({
        key: makeDraftKey(), kind: m.kind, previewUrl: m.url, mime: m.mime, size: m.size,
        serverId: m.id, serverStatus: "ready", progress: 0,
      }));
      // Envio interrompido antes: as linhas "pendentes" existem no servidor, mas o arquivo não chegou.
      let pending: MediaDraft[] = [];
      if (s.status === "pending_media") {
        try {
          const u = await campaignsApi.post<{ uploads: UploadTicket[] }>(`${api}/submission/${s.id}/uploads`);
          pending = (u.uploads ?? []).map((t) => ({
            key: makeDraftKey(), kind: t.kind, previewUrl: "", mime: t.mime, size: 0,
            serverId: t.id, serverStatus: "pending", progress: 0,
            error: "Arquivo não enviado. Escolha-o de novo ou remova.",
          }));
        } catch { /* sem a lista de pendentes a pessoa ainda consegue editar o texto */ }
      }
      setDrafts([...ready, ...pending]);
      setServerMedia([...ready, ...pending].map((d) => d.serverId as string));
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
      return state.locked ? "A votação já começou: as receitas não podem mais ser alteradas." : "A edição da sua receita não está disponível agora.";
    }
    if (state.can_submit) return null;
    if (state.locked) return "A votação já começou: não é mais possível enviar receitas.";
    switch (state.registration) {
      case "upcoming": return "As inscrições ainda não abriram.";
      case "paused": return "As inscrições estão pausadas no momento.";
      case "closed": return "As inscrições foram encerradas.";
      default: return "Esta campanha não está recebendo receitas agora.";
    }
  };
  const blocked = phase === "done" ? null : blockReason();

  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "submit", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user && !blocked && !loading && !loadError,
  });

  const updateDraft = useCallback((key: string, patch: Partial<MediaDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }, []);

  // ── Salvar / enviar ───────────────────────────────────────────────────────
  const persist = async () => {
    if (inflight.current) return;
    const current = draftsRef.current;
    const errs = validateRecipe(fields);
    if (Object.keys(errs).length > 0 || (needMain && !current.some((d) => d.kind === "main_photo"))) {
      setShowErrors(true);
      toast.warning("Confira os campos destacados antes de enviar.");
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"], [role="alert"]')?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    if (current.some((d) => d.invalid)) { toast.warning("Remova o arquivo com problema antes de continuar."); return; }
    if (current.some((d) => d.serverStatus === "pending" && !d.file)) {
      toast.warning("Escolha de novo (ou remova) os arquivos marcados como não enviados.");
      return;
    }

    inflight.current = true;
    setBanner(null);
    let sid = submissionId;
    let createdNow = false;
    try {
      setPhase("saving");
      const f: RecipeFields = {
        dish_name: fields.dish_name.trim(), description: fields.description.trim(),
        ingredients: fields.ingredients.trim(), preparation: fields.preparation.trim(),
      };
      const keepIds = new Set(current.filter((d) => d.serverId).map((d) => d.serverId as string));
      const remove = serverMedia.filter((id) => !keepIds.has(id));
      const toAdd = current.filter((d) => !d.serverId && d.file);
      const addMeta = toAdd.map((d) => ({ kind: d.kind, mime: d.mime, size: d.size }));
      let tickets: UploadTicket[] = [];
      let changed = false;

      if (!sid) {
        const r = await campaignsApi.post<CreateResp>(`${api}/submission`, { ...f, media: addMeta });
        sid = r.submission_id;
        createdNow = true;
        changed = true;
        tickets = r.uploads ?? [];
        setSubmissionId(sid);
      } else {
        const textChanged = !original || (Object.keys(f) as RecipeFieldKey[]).some((k) => f[k] !== original[k]);
        if (textChanged || remove.length > 0 || addMeta.length > 0) {
          const r = await campaignsApi.put<UpdateResp>(`${api}/submission/${sid}`, { ...f, remove, add: addMeta });
          tickets = r.uploads ?? [];
          changed = r.changed;
        }
      }
      if (addMeta.length > 0 && tickets.length !== addMeta.length) {
        throw new Error("O servidor não preparou todos os arquivos. Tente de novo.");
      }
      setOriginal(f);
      setServerMedia([...keepIds, ...tickets.map((t) => t.id)]);

      const assigned = new Map<string, UploadTicket>();
      toAdd.forEach((d, i) => { if (tickets[i]) assigned.set(d.key, tickets[i]); });
      const merged: MediaDraft[] = current.map((d) =>
        assigned.has(d.key) ? { ...d, serverId: assigned.get(d.key)!.id, serverStatus: "pending" as const } : d,
      );
      setDrafts((prev) =>
        prev.map((d) => (assigned.has(d.key) ? { ...d, serverId: assigned.get(d.key)!.id, serverStatus: "pending" as const } : d)),
      );

      // Arquivos que ainda precisam subir (novos agora ou falhas de uma tentativa anterior).
      const toUpload = merged.filter((d) => d.serverStatus === "pending" && d.file && !d.uploaded);
      const ticketsById = new Map<string, UploadTicket>(tickets.map((t) => [t.id, t]));
      if (toUpload.some((d) => !ticketsById.has(d.serverId as string))) {
        const re = await campaignsApi.post<{ uploads: UploadTicket[] }>(`${api}/submission/${sid}/uploads`);
        (re.uploads ?? []).forEach((t) => ticketsById.set(t.id, t));
      }

      setPhase("uploading");
      let failed = 0;
      for (const d of toUpload) {
        const t = ticketsById.get(d.serverId as string);
        if (!t) {
          failed++;
          updateDraft(d.key, { error: "Não foi possível preparar o envio deste arquivo." });
          continue;
        }
        updateDraft(d.key, { progress: 0.01, error: undefined });
        let last = 0;
        try {
          await uploadToSignedUrl(t.signedUrl, d.file as File, (p) => {
            if (p - last >= 0.03 || p === 1) { last = p; updateDraft(d.key, { progress: p }); }
          });
          updateDraft(d.key, { progress: 1, uploaded: true, error: undefined });
        } catch (e) {
          failed++;
          updateDraft(d.key, { progress: 0, error: errMsg(e, "Falha no envio deste arquivo.") });
        }
      }
      if (failed > 0) {
        const msg = `${failed === 1 ? "1 arquivo não foi enviado" : `${failed} arquivos não foram enviados`}. Sua receita já está registrada: toque em “Tentar de novo” para reenviar só ${failed === 1 ? "ele" : "eles"}.`;
        setPhase("partial");
        setBanner(msg);
        toast.error(msg);
        return;
      }

      const needsFinalize = merged.some((d) => d.serverStatus === "pending");
      if (needsFinalize) {
        setPhase("finalizing");
        try {
          await campaignsApi.post(`${api}/submission/${sid}/finalize`);
        } catch (e) {
          if (e instanceof CampaignApiError && (e.code === "MEDIA_NOT_VERIFIED" || e.code === "MEDIA_INVALID")) {
            const bad = merged.find((d) => d.serverId && d.serverId === e.details?.id);
            if (bad) {
              updateDraft(bad.key, e.code === "MEDIA_INVALID"
                ? { error: e.message, invalid: true, uploaded: false, progress: 0 }
                : { error: "Este arquivo não chegou ao servidor. Tente enviar de novo.", uploaded: false, progress: 0 });
            }
            setPhase("partial");
            setBanner(e.message);
            toast.error(e.message);
            return;
          }
          throw e;
        }
        setDrafts((prev) => prev.map((d) => (d.serverStatus === "pending" ? { ...d, serverStatus: "ready" as const, error: undefined } : d)));
      }

      const touched = createdNow || changed || remove.length > 0 || addMeta.length > 0 || needsFinalize;
      if (!createdNow && isEdit) {
        setPhase("idle");
        if (!touched) { toast.info("Nenhuma alteração para salvar."); return; }
        toast.success("Alterações salvas. Sua receita voltou para análise.");
        await refresh();
        navigate(`${base}/participacao`);
        return;
      }

      // Criação concluída: busca a data oficial de envio no servidor.
      let when: string | null = null;
      try {
        const r = await campaignsApi.get<{ submission: MySubmission | null }>(`${api}/my-submission`);
        when = r.submission?.submitted_at ?? null;
      } catch { /* usa a hora local abaixo */ }
      setDoneDish(f.dish_name);
      setDoneAt(when ?? new Date().toISOString());
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
            Recebemos {doneDish ? <>a sua receita <strong className="text-foreground">“{doneDish}”</strong></> : "a sua receita"} em {fmtDateTime(doneAt)}.
          </p>
          <Badge className={cn("mt-3 border text-[11px] font-semibold", SUBMISSION_STATUS.submitted.className)}>Enviada — em análise</Badge>
          <p className="mx-auto mt-3 max-w-xs text-xs text-muted-foreground">
            Você pode acompanhar a análise e, até a votação começar, editar a receita em Minha participação.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate(`${base}/participacao`)} className="h-12 rounded-xl px-6">Ver minha participação</Button>
            <Button variant="outline" onClick={() => navigate(base)} className="h-12 rounded-xl px-6">Voltar à campanha</Button>
          </div>
        </Card>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-16 w-full rounded-3xl" />
        <Skeleton className="h-72 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <span className="sr-only">Carregando a sua receita…</span>
      </div>
    );
  }
  if (loadError) return <ErrorState message={loadError} onRetry={() => void loadExisting()} />;

  const disabled = busy || !!blocked;
  const label =
    phase === "saving" ? "Salvando…"
    : phase === "uploading" ? "Enviando arquivos…"
    : phase === "finalizing" ? "Finalizando…"
    : phase === "partial" ? "Tentar de novo"
    : isEdit ? "Salvar alterações" : "Enviar receita";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">{isEdit ? "Editar minha receita" : "Enviar minha receita"}</h2>
        <TourButton onClick={tour.start} />
      </div>

      {blocked && (
        <Card role="alert" className="rounded-3xl border-yellow-200 bg-yellow-50 p-4 hover:shadow-sm dark:border-yellow-900/50 dark:bg-yellow-950/20">
          <p className="flex items-start gap-2 text-sm font-medium text-yellow-900 dark:text-yellow-100">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{blocked}</span>
          </p>
          <div className="mt-3">
            <Button variant="outline" size="sm" className="h-11 rounded-xl px-4" onClick={() => navigate(isEdit ? `${base}/participacao` : base)}>
              {isEdit ? "Ver minha participação" : "Voltar à campanha"}
            </Button>
          </div>
        </Card>
      )}

      {isEdit && !blocked && (
        <Card role="note" className="rounded-3xl border-yellow-200 bg-yellow-50 p-4 hover:shadow-sm dark:border-yellow-900/50 dark:bg-yellow-950/20">
          <p className="flex items-start gap-2 text-sm text-yellow-900 dark:text-yellow-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>Ao salvar alterações, sua receita <strong>volta para análise</strong> e precisa ser aprovada de novo.</span>
          </p>
        </Card>
      )}

      {banner && (
        <Card role="alert" className="rounded-3xl border-red-200 bg-red-50 p-4 hover:shadow-sm dark:border-red-900/50 dark:bg-red-950/20">
          <p className="flex items-start gap-2 text-sm font-medium text-red-900 dark:text-red-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{banner}</span>
          </p>
        </Card>
      )}

      <Card className="rounded-3xl p-4 hover:shadow-sm" data-tutorial="camp-author">
        <p className="flex items-center gap-2 text-sm text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound size={18} aria-hidden="true" />
          </span>
          <span>
            Enviando como <strong>{user?.name ?? "você"}</strong>
          </span>
        </p>
      </Card>

      <Card className="rounded-3xl p-5 hover:shadow-sm" data-tutorial="camp-fields">
        <RecipeForm values={fields} onChange={setFields} disabled={disabled} showErrors={showErrors} />
      </Card>

      {(allowPhotos || allowVideo) && (
        <Card className="rounded-3xl p-5 hover:shadow-sm" data-tutorial="camp-media">
          <MediaUploader
            items={drafts}
            setItems={setDrafts}
            limits={limits}
            allowPhotos={allowPhotos}
            allowVideo={allowVideo}
            disabled={disabled}
            mainRequiredError={showErrors && needMain}
          />
        </Card>
      )}

      {!blocked && (
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
      )}
      {busy && <p className="text-center text-xs text-muted-foreground" aria-live="polite">Não feche esta tela até terminar.</p>}

      <CampaignTour steps={SUBMIT_TOUR} tour={tour} />
    </motion.div>
  );
}
