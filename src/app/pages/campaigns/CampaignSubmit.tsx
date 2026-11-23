import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Lock, Plus, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Skeleton } from "../../components/ui/skeleton";
import type { PhotoDraft } from "../../components/campaigns/PhotoPicker";
import { PhotoSet, newPhotoUid } from "../../components/campaigns/PhotoSet";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { VOTING_LOCKED_MSG, votingLocked } from "../../components/campaigns/RecipeSheet";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { submissionsCount, submissionsMax } from "../../components/campaigns/campaignInfo";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, CampaignApiError, errMsg, uploadToSignedUrl } from "../../lib/campaigns/api";
import { DEFAULT_PHOTO_MB } from "../../lib/campaigns/media";
import { SUBMIT_TOUR } from "../../lib/campaigns/tours-collab";
import { cn } from "../../lib/utils";
import { MAX_PHOTOS_PER_RECIPE, MAX_RECIPE_TEXT, MAX_STORY_TEXT } from "../../lib/campaigns/types";
import type { MySubmission, MySubmissions, SubmissionStatus, UploadTicket } from "../../lib/campaigns/types";

type Phase = "idle" | "saving" | "uploading" | "finalizing" | "partial" | "done";
type CreateResp = { submission_id: string; status: string; uploads: UploadTicket[] };
type UpdateResp = { changed: boolean; status: string; uploads: UploadTicket[] };
type MediaKind = "main_photo" | "photo";

const BLOCKING_CODES = ["EDIT_LOCKED", "REGISTRATION_CLOSED", "REGISTRATION_PAUSED", "CAMPAIGN_UNAVAILABLE", "NOT_ELIGIBLE", "SUBMISSION_LIMIT", "VOTING_LOCKED"];
const TITLE_MIN = 3;
const TITLE_MAX = 120;
const STORY_MAX = MAX_STORY_TEXT; // "História e memória afetiva" (um único campo de texto, opcional)
const TEXT_MAX = MAX_RECIPE_TEXT; // ingredientes e modo de preparo: sem limite prático, só proteção técnica

type Fields = { dish_name: string; description: string; ingredients: string; preparation: string };
type FieldErrs = Partial<Record<keyof Fields, string>>;
const EMPTY: Fields = { dish_name: "", description: "", ingredients: "", preparation: "" };

function validate(f: Fields): FieldErrs {
  const out: FieldErrs = {};
  const n = f.dish_name.trim().length;
  if (n < TITLE_MIN) out.dish_name = `Escreva o título da receita (mínimo ${TITLE_MIN} letras).`;
  else if (n > TITLE_MAX) out.dish_name = `O título pode ter até ${TITLE_MAX} letras.`;
  if (f.description.trim().length > STORY_MAX) out.description = `A história pode ter até ${STORY_MAX} letras.`;
  if (!f.ingredients.trim()) out.ingredients = "Escreva os ingredientes da receita.";
  else if (f.ingredients.trim().length > TEXT_MAX) out.ingredients = `Os ingredientes passaram do limite de ${TEXT_MAX} letras.`;
  if (!f.preparation.trim()) out.preparation = "Escreva o modo de preparo.";
  else if (f.preparation.trim().length > TEXT_MAX) out.preparation = `O modo de preparo passou do limite de ${TEXT_MAX} letras.`;
  return out;
}

/** Mensagens por campo quando o servidor devolve INVALID_FIELDS com a lista (ex.: "ingredients,preparation"). */
const SERVER_FIELD_MSG: Record<string, string> = {
  dish_name: "Confira o título da receita.",
  description: "Confira a história (limite de tamanho).",
  ingredients: "Confira os ingredientes.",
  preparation: "Confira o modo de preparo.",
};

const LABEL = "text-xs font-bold uppercase tracking-wider text-muted-foreground";
const FIELD = "rounded-xl border-border focus:ring-primary/30";

/** Contador discreto: sempre na história; nos textos longos só quando já passou de 75% do limite. */
function Count({ n, max, always }: { n: number; max: number; always?: boolean }) {
  if (!always && n < max * 0.75) return null;
  return <span className={cn("shrink-0 text-[11px] tabular-nums text-muted-foreground", n > max && "font-bold text-destructive")} aria-live="off">{n}/{max}</span>;
}

/** Rota `enviar` = nova receita; `enviar/:id` = editar uma das minhas receitas. Remonta ao trocar de uma para a outra. */
export function CampaignSubmit() {
  const { id } = useParams();
  return <SubmitForm key={id ?? "new"} editId={id ?? null} />;
}

/** Enviar (ou editar) uma receita: título, história (opcional), ingredientes, modo de preparo e até 3 fotos. */
function SubmitForm({ editId }: { editId: string | null }) {
  const { campaign, state, refresh, slug } = useCampaignCtx();
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = `/campanhas/${slug}`;
  const api = `/campaigns/${encodeURIComponent(slug)}`;

  const isEdit = !!editId;
  const max = submissionsMax(campaign, state);
  const multi = max > 1;
  const count = submissionsCount(state);
  const maxMb = campaign.media_limits?.max_photo_mb || DEFAULT_PHOTO_MB;
  const needPhoto = campaign.features.photos !== false;

  // Campanha de uma receita só: quem já tem uma cai direto na edição dela (links antigos para /enviar continuam valendo).
  const redirectId = useRef(!isEdit && !multi && state.my_submission_id ? state.my_submission_id : null).current;
  useEffect(() => {
    if (redirectId) navigate(`${base}/enviar/${redirectId}`, { replace: true });
  }, [redirectId, base, navigate]);

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [original, setOriginal] = useState<Fields | null>(null);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  // Linhas de foto que já existem no servidor (para saber o que remover ao trocar/tirar uma foto).
  const [serverPhotoIds, setServerPhotoIds] = useState<string[]>([]);
  const [submissionId, setSubmissionId] = useState<string | null>(editId);
  const [recipeStatus, setRecipeStatus] = useState<SubmissionStatus | null>(null);
  // A receita que está sendo editada foi enviada fora do prazo (só ela continua editável na janela de atraso).
  const [recipeLate, setRecipeLate] = useState(false);
  const [doneLate, setDoneLate] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showErrors, setShowErrors] = useState(false);
  const [srvErrs, setSrvErrs] = useState<FieldErrs>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [doneDish, setDoneDish] = useState("");
  const inflight = useRef(false);
  const photosRef = useRef<PhotoDraft[]>([]);
  photosRef.current = photos;

  const busy = phase === "saving" || phase === "uploading" || phase === "finalizing";

  // Libera as miniaturas locais (blob:) ao sair da tela.
  useEffect(() => () => {
    photosRef.current.forEach((p) => { if (p.previewUrl.startsWith("blob:")) URL.revokeObjectURL(p.previewUrl); });
  }, []);

  const patchPhoto = (uid: string | undefined, patch: Partial<PhotoDraft>) =>
    setPhotos((prev) => prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p)));

  // ── Carrega a receita existente (modo edição), uma única vez ──────────────
  const loadExisting = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      let s: MySubmission | undefined;
      try {
        const r = await campaignsApi.get<MySubmissions>(`${api}/my-submissions`);
        s = r.items.find((x) => x.id === editId);
      } catch (e) {
        // Plano B: servidor ainda sem a rota nova → rota de uma receita só.
        if (!(e instanceof CampaignApiError && e.status === 404 && e.code === "NOT_FOUND")) throw e;
        const r = await campaignsApi.get<{ submission: MySubmission | null }>(`${api}/my-submission`);
        s = r.submission && r.submission.id === editId ? r.submission : undefined;
      }
      if (!s) { setLoadError("Não encontramos esta receita."); return; }
      const f: Fields = {
        dish_name: s.dish_name,
        description: s.description ?? "",
        ingredients: s.ingredients ?? "",
        preparation: s.preparation ?? "",
      };
      setFields(f);
      setOriginal(f);
      setSubmissionId(s.id);
      setRecipeStatus(s.status);
      setRecipeLate(!!s.is_late);
      // Fotos que já estão no servidor, a principal primeiro.
      const rows = s.media
        .filter((m) => m.kind === "main_photo" || m.kind === "photo")
        .sort((a, b) => (a.kind === "main_photo" ? 0 : 1) - (b.kind === "main_photo" ? 0 : 1));
      const drafts: PhotoDraft[] = rows.map((m) => ({
        uid: newPhotoUid(), previewUrl: m.url, mime: m.mime, size: m.size, serverId: m.id, serverStatus: "ready", progress: 0, kind: m.kind as MediaKind,
        web: m.web ?? undefined,
      }));
      const ids = rows.map((m) => m.id);
      if (s.status === "pending_media") {
        // Envio interrompido: a(s) linha(s) existe(m) no servidor, mas o arquivo não chegou.
        try {
          const u = await campaignsApi.post<{ uploads: UploadTicket[] }>(`${api}/submission/${s.id}/uploads`);
          for (const t of u.uploads ?? []) {
            if (ids.includes(t.id)) continue;
            ids.push(t.id);
            drafts.push({ uid: newPhotoUid(), previewUrl: "", mime: t.mime, size: 0, serverId: t.id, serverStatus: "pending", progress: 0, kind: t.kind as MediaKind });
          }
        } catch { /* sem o ticket a pessoa ainda consegue escolher a foto de novo */ }
      }
      setPhotos(drafts);
      setServerPhotoIds(ids);
    } catch (e) {
      setLoadError(errMsg(e, "Não foi possível carregar a sua receita."));
    } finally {
      setLoading(false);
    }
  }, [api, editId]);

  useEffect(() => { if (isEdit) void loadExisting(); }, [isEdit, loadExisting]);

  // Avisa antes de fechar a aba no meio de um envio.
  useEffect(() => {
    if (!busy) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);

  // Janela de "fora do prazo": participação encerrada, mas o servidor ainda aceita envios (a receita não concorre à votação).
  // Servidor antigo não manda `late_window`: fica falso e a tela se comporta como sempre.
  const lateWindow = !!state.late_window;
  // A votação já começou e a participação não está aberta (nem em janela de atraso): nada de enviar nem editar.
  const lockedByVoting = votingLocked(state);

  const blockReason = (): string | null => {
    if (blockedMsg) return blockedMsg;
    if (isEdit) {
      if (recipeStatus === null) return null; // ainda carregando
      // Campanha de várias receitas: vale a regra da receita (não aprovada + participação aberta).
      const regOpen = !!state.released && state.registration === "open" && state.stage !== "closed";
      // Na janela de atraso, só a receita enviada fora do prazo (e ainda não aprovada) pode ser editada.
      const allowed = lateWindow
        ? recipeLate && recipeStatus !== "approved"
        : multi ? regOpen && state.can_edit !== false && recipeStatus !== "approved" : !!state.can_edit;
      if (allowed) return null;
      if (recipeStatus === "approved") return "Esta receita já foi aprovada e não pode mais ser alterada.";
      if (lockedByVoting) return VOTING_LOCKED_MSG;
      if (lateWindow) return "O prazo de participação terminou e esta receita não pode mais ser alterada.";
      return "Não dá para editar a receita agora.";
    }
    if (lockedByVoting) return VOTING_LOCKED_MSG;
    if (multi && count >= max) return `Você chegou ao limite de ${max} receitas nesta campanha.`;
    if (state.can_submit ?? state.registration === "open") return null;
    switch (state.registration) {
      case "upcoming": return "A participação ainda não abriu.";
      case "paused": return "A participação está em pausa.";
      case "closed": return lateWindow ? "Você não pode enviar novas receitas agora." : "A participação foi encerrada.";
      default: return "Esta campanha não está recebendo receitas agora.";
    }
  };
  const blocked = phase === "done" || redirectId ? null : blockReason();

  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "submit", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user && !blocked && !loading && !loadError && !redirectId,
  });

  const resetForm = () => {
    setFields(EMPTY);
    setOriginal(null);
    photosRef.current.forEach((p) => { if (p.previewUrl.startsWith("blob:")) URL.revokeObjectURL(p.previewUrl); });
    setPhotos([]);
    setServerPhotoIds([]);
    setSubmissionId(null);
    setRecipeStatus(null);
    setBanner(null);
    setSrvErrs({});
    setBlockedMsg(null);
    setShowErrors(false);
    setDoneDish("");
    setDoneLate(false);
    setPhase("idle");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Salvar / enviar ───────────────────────────────────────────────────────
  const persist = async () => {
    if (inflight.current) return;
    const cur = photosRef.current;
    const errs = validate(fields);
    const hasErr = Object.keys(errs).length > 0;
    // Só conta a foto que já tem arquivo ou já está no servidor (a "pendente" sem arquivo precisa ser escolhida de novo).
    const usable = cur.filter((p) => p.file || p.webImport || p.serverStatus === "ready");
    const photoMissing = needPhoto && usable.length === 0;
    const needRepick = needPhoto && cur.some((p) => p.serverStatus === "pending" && !p.file);
    if (hasErr || photoMissing || needRepick) {
      setShowErrors(true);
      toast.warning(needRepick && !hasErr && !photoMissing ? "Escolha de novo a foto que não chegou." : "Confira os campos destacados.");
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"], [role="alert"]')?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    if (cur.some((p) => p.invalid)) { toast.warning("Troque a foto marcada para continuar."); return; }

    inflight.current = true;
    setBanner(null);
    setSrvErrs({});
    let sid = submissionId;
    let createdNow = false;
    try {
      setPhase("saving");
      const f: Fields = {
        dish_name: fields.dish_name.trim(), description: fields.description.trim(),
        ingredients: fields.ingredients.trim(), preparation: fields.preparation.trim(),
      };
      // Fotos: as que continuam no servidor, as que saíram e as novas (com o tipo certo: 1ª principal, demais extras).
      const photoList = needPhoto ? cur : [];
      const keepIds = new Set(photoList.filter((p) => p.serverId).map((p) => p.serverId as string));
      const remove = needPhoto ? serverPhotoIds.filter((id) => !keepIds.has(id)) : [];
      // Novas: do aparelho (precisam de upload) e da internet (a mídia já está guardada no servidor, vai na lista como foi devolvida).
      const newOnes = photoList.filter((p) => (p.file || p.webImport) && !p.serverId);
      const fileNew = newOnes.filter((p) => !p.webImport);
      let mainTaken = photoList.some((p) => p.kind === "main_photo");
      const addMeta = newOnes.map((p) => {
        if (p.webImport) return { ...p.webImport };
        const kind: MediaKind = p.kind ?? (mainTaken ? "photo" : "main_photo");
        if (kind === "main_photo") mainTaken = true;
        return { kind, mime: p.mime, size: p.size };
      });
      let respStatus: string | undefined;
      let tickets: UploadTicket[] = [];
      let changed = false;

      if (!sid) {
        const r = await campaignsApi.post<CreateResp>(`${api}/submission`, { ...f, media: addMeta });
        sid = r.submission_id;
        createdNow = true;
        changed = true;
        tickets = r.uploads ?? [];
        respStatus = r.status;
        setSubmissionId(sid);
      } else {
        const textChanged = !original || (Object.keys(f) as (keyof Fields)[]).some((k) => f[k] !== original[k]);
        if (textChanged || remove.length > 0 || addMeta.length > 0) {
          const r = await campaignsApi.put<UpdateResp>(`${api}/submission/${sid}`, { ...f, remove, add: addMeta });
          tickets = r.uploads ?? [];
          changed = r.changed;
          respStatus = r.status;
        }
      }
      // Um ticket por foto DO APARELHO (a da internet não precisa de upload). Se o servidor mandar um por foto nova, aceita também.
      const ticketOwners = tickets.length === fileNew.length ? fileNew : newOnes;
      if (tickets.length !== ticketOwners.length) {
        throw new Error("O servidor não preparou o envio das fotos. Tente de novo.");
      }
      setOriginal(f);
      // Cada foto nova recebe o seu ticket (mesma ordem em que foram pedidos). A da internet fica pronta (sem upload).
      const ticketOf = new Map<string, UploadTicket>();
      const webIds: string[] = [];
      newOnes.forEach((p, i) => {
        const at = ticketOwners.indexOf(p);
        const t = at >= 0 ? tickets[at] : undefined;
        const kind = addMeta[i].kind as MediaKind;
        if (p.webImport) {
          const wid = t?.id ?? p.webImport.id;
          webIds.push(wid);
          patchPhoto(p.uid, { serverId: wid, serverStatus: "ready", kind });
          return;
        }
        ticketOf.set(p.uid as string, t as UploadTicket);
        patchPhoto(p.uid, { serverId: (t as UploadTicket).id, serverStatus: "pending", kind });
      });
      setServerPhotoIds([...keepIds, ...tickets.map((t) => t.id).filter((id) => !webIds.includes(id)), ...webIds]);

      // Quais fotos ainda precisam subir? (novas agora, ou falha de uma tentativa anterior)
      const toUpload = photoList.filter((p) => p.file && !p.uploaded && (!p.serverId || p.serverStatus === "pending"));
      let retryTickets: UploadTicket[] | null = null;
      if (toUpload.some((p) => !ticketOf.get(p.uid as string))) {
        const re = await campaignsApi.post<{ uploads: UploadTicket[] }>(`${api}/submission/${sid}/uploads`);
        retryTickets = re.uploads ?? [];
      }

      if (toUpload.length > 0) {
        setPhase("uploading");
        let failed = false;
        for (const p of toUpload) {
          const t = ticketOf.get(p.uid as string) ?? retryTickets?.find((x) => x.id === p.serverId);
          if (!t || !p.file) {
            patchPhoto(p.uid, { error: "Não foi possível preparar o envio da foto." });
            failed = true;
            continue;
          }
          patchPhoto(p.uid, { progress: 0.01, error: undefined });
          let last = 0;
          try {
            await uploadToSignedUrl(t.signedUrl, p.file, (frac) => {
              if (frac - last >= 0.03 || frac === 1) { last = frac; patchPhoto(p.uid, { progress: frac }); }
            });
            patchPhoto(p.uid, { progress: 1, uploaded: true, error: undefined });
          } catch (e) {
            patchPhoto(p.uid, { progress: 0, error: errMsg(e, "Falha no envio da foto.") });
            failed = true;
          }
        }
        if (failed) {
          const msg = "Sua receita foi registrada, mas alguma foto não foi enviada. Toque em “Tentar de novo”.";
          setPhase("partial");
          setBanner(msg);
          toast.error(msg);
          return;
        }
      }

      // Finaliza quando há foto do aparelho, foto pendente ou o servidor deixou a receita aguardando mídia (só da internet: depende dele).
      const needsFinalize = toUpload.length > 0 || fileNew.length > 0 || photoList.some((p) => p.serverStatus === "pending") || respStatus === "pending_media";
      if (needsFinalize) {
        setPhase("finalizing");
        try {
          await campaignsApi.post(`${api}/submission/${sid}/finalize`);
        } catch (e) {
          if (e instanceof CampaignApiError && (e.code === "MEDIA_NOT_VERIFIED" || e.code === "MEDIA_INVALID")) {
            const badId = (e.details as { id?: string } | undefined)?.id;
            const bad = photosRef.current.find((p) => p.serverId === badId);
            if (bad) {
              patchPhoto(bad.uid, e.code === "MEDIA_INVALID"
                ? { error: e.message, invalid: true, uploaded: false, progress: 0 }
                : { error: "A foto não chegou ao servidor. Tente enviar de novo.", uploaded: false, progress: 0 });
            }
            setPhase("partial");
            setBanner(e.message);
            toast.error(e.message);
            return;
          }
          throw e;
        }
        setPhotos((prev) => prev.map((p) => (p.serverId ? { ...p, serverStatus: "ready", error: undefined } : p)));
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
      setDoneLate(lateWindow);
      setPhase("done");
      void refresh();
    } catch (e) {
      const code = e instanceof CampaignApiError ? e.code : "";
      if (code === "ALREADY_SUBMITTED") {
        // Campanha de uma receita só e a pessoa já tem a dela: abre essa receita (retoma a foto se faltou).
        const existing = e instanceof CampaignApiError ? (e.details as { submission_id?: string } | undefined)?.submission_id : undefined;
        toast.info("Você já tem uma receita nesta campanha. Abrimos ela para você.");
        await refresh();
        navigate(existing ? `${base}/enviar/${existing}` : `${base}/participacao`, { replace: true });
        return;
      }
      if (code === "INVALID_FIELDS" && e instanceof CampaignApiError && typeof e.details === "string") {
        // O servidor apontou os campos (ex.: "ingredients,preparation"): marca cada um na tela.
        const marked: FieldErrs = {};
        for (const k of e.details.split(",")) {
          const key = k.trim() as keyof Fields;
          if (SERVER_FIELD_MSG[key]) marked[key] = SERVER_FIELD_MSG[key];
        }
        setSrvErrs(marked);
        setShowErrors(true);
      }
      const msg = code === "SUBMISSION_LIMIT" ? `Você chegou ao limite de ${max} receitas nesta campanha.` : code === "VOTING_LOCKED" ? VOTING_LOCKED_MSG : errMsg(e);
      if (BLOCKING_CODES.includes(code)) {
        setBlockedMsg(msg); // a tela já mostra o aviso de bloqueio; não repete em outra caixa
        void refresh();
      } else {
        setBanner(msg);
      }
      toast.error(msg);
      setPhase(sid ? "partial" : "idle");
    } finally {
      inflight.current = false;
    }
  };

  // ── Telas ─────────────────────────────────────────────────────────────────
  if (redirectId) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <span className="sr-only">Abrindo a sua receita…</span>
      </div>
    );
  }

  if (phase === "done") {
    const canSendAnother = multi && count < max;
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
          {doneLate && (
            <p className="mx-auto mt-2 max-w-xs text-sm font-medium text-orange-800 dark:text-orange-300">
              Enviada fora do prazo: ela aparece na campanha depois de aprovada, mas não concorre à votação.
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => navigate(`${base}/participacao`)} className="h-12 rounded-xl px-6">Ver minhas receitas</Button>
            {canSendAnother && (
              <Button variant="outline" onClick={resetForm} className="h-12 gap-2 rounded-xl px-6">
                <Plus size={16} aria-hidden="true" /> Cadastrar outra receita
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate(base)} className="h-12 rounded-xl px-6">Voltar à campanha</Button>
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
    : phase === "uploading" ? (photos.filter((p) => p.file && !p.uploaded).length > 1 ? "Enviando as fotos…" : "Enviando a foto…")
    : phase === "finalizing" ? "Finalizando…"
    : phase === "partial" ? "Tentar de novo"
    : isEdit ? "Salvar alterações" : "Enviar receita";
  const errs: FieldErrs = showErrors ? { ...validate(fields), ...srvErrs } : {};
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setFields((f) => ({ ...f, [k]: v }));
    if (srvErrs[k]) setSrvErrs((s) => ({ ...s, [k]: undefined }));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">
          {isEdit ? "Editar receita" : count > 0 ? "Cadastrar outra receita" : "Cadastrar receita"}
        </h2>
        <TourButton onClick={tour.start} />
      </div>

      {blocked && (
        <Card role="alert" className="rounded-3xl border-yellow-200 bg-yellow-50 p-4 hover:shadow-sm dark:border-yellow-900/50 dark:bg-yellow-950/20">
          <p className="flex items-start gap-2 text-sm font-medium text-yellow-900 dark:text-yellow-100">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{blocked}</span>
          </p>
          <Button variant="outline" size="sm" className="mt-3 h-11 rounded-xl px-4" onClick={() => navigate(isEdit || count > 0 ? `${base}/participacao` : base)}>
            {isEdit || count > 0 ? "Ver minhas receitas" : "Voltar à campanha"}
          </Button>
        </Card>
      )}

      {lateWindow && !blocked && (!isEdit || recipeLate) && (
        <Card role="status" className="rounded-3xl border-orange-200 bg-orange-50 p-4 hover:shadow-sm dark:border-orange-900/50 dark:bg-orange-950/20" data-tutorial="camp-late">
          <p className="flex items-start gap-2 text-sm font-medium text-orange-900 dark:text-orange-100">
            <Clock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>O prazo de participação terminou. Sua receita será aceita, mas não concorrerá à votação.</span>
          </p>
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
          <label htmlFor="camp-dish" className={LABEL}>Título da receita</label>
          <Input
            id="camp-dish"
            value={fields.dish_name}
            onChange={set("dish_name")}
            disabled={disabled}
            maxLength={TITLE_MAX}
            placeholder="Ex.: Bolo de fubá da vovó"
            autoComplete="off"
            aria-invalid={!!errs.dish_name}
            className={cn(FIELD, "h-12")}
          />
          {errs.dish_name && <p role="alert" className="text-sm font-medium text-destructive">{errs.dish_name}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="camp-story" className={LABEL}>
            História e memória afetiva <span className="font-medium normal-case tracking-normal">(opcional)</span>
          </label>
          <Textarea
            id="camp-story"
            value={fields.description}
            onChange={set("description")}
            disabled={disabled}
            maxLength={Math.max(STORY_MAX, fields.description.length)}
            rows={5}
            placeholder="Quem fazia, onde você provou pela primeira vez, que lembrança ela traz."
            aria-invalid={!!errs.description}
            className={cn(FIELD, "min-h-[120px]")}
          />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {errs.description && <p role="alert" className="text-sm font-medium text-destructive">{errs.description}</p>}
            </div>
            <Count n={fields.description.length} max={STORY_MAX} always />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="camp-ingredients" className={LABEL}>Ingredientes</label>
          <Textarea
            id="camp-ingredients"
            value={fields.ingredients}
            onChange={set("ingredients")}
            disabled={disabled}
            maxLength={Math.max(TEXT_MAX, fields.ingredients.length)}
            rows={6}
            placeholder={"Um ingrediente por linha. Ex.:\n2 xícaras de fubá\n3 ovos\n1 xícara de açúcar"}
            aria-invalid={!!errs.ingredients}
            className={cn(FIELD, "min-h-[150px]")}
          />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {errs.ingredients && <p role="alert" className="text-sm font-medium text-destructive">{errs.ingredients}</p>}
            </div>
            <Count n={fields.ingredients.length} max={TEXT_MAX} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="camp-preparation" className={LABEL}>Modo de preparo</label>
          <Textarea
            id="camp-preparation"
            value={fields.preparation}
            onChange={set("preparation")}
            disabled={disabled}
            maxLength={Math.max(TEXT_MAX, fields.preparation.length)}
            rows={8}
            placeholder={"Conte o passo a passo, um passo por linha. Ex.:\n1. Misture os secos.\n2. Junte os ovos e bata bem.\n3. Asse por 40 minutos."}
            aria-invalid={!!errs.preparation}
            className={cn(FIELD, "min-h-[190px]")}
          />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {errs.preparation && <p role="alert" className="text-sm font-medium text-destructive">{errs.preparation}</p>}
            </div>
            <Count n={fields.preparation.length} max={TEXT_MAX} />
          </div>
        </div>
      </Card>

      {needPhoto && (
        // No celular a barra de envio (abaixo) sobe 4,75rem sobre o fim deste bloco (o <main> da página é um contêiner de rolagem e o
        // "sticky" não prende na tela): a folga evita que ela cubra "Pesquisar na internet" e os botões das fotos.
        <div data-tutorial="camp-photo" className="space-y-2 max-md:pb-16">
          <p className={LABEL}>Fotos da receita <span className="font-medium normal-case tracking-normal">(1 a {MAX_PHOTOS_PER_RECIPE})</span></p>
          <PhotoSet
            photos={photos}
            setPhotos={setPhotos}
            max={MAX_PHOTOS_PER_RECIPE}
            maxMb={maxMb}
            disabled={disabled}
            showError={showErrors}
            searchSlug={slug}
          />
        </div>
      )}

      {!blocked && (
        <div className="sticky bottom-[4.75rem] z-10 -mx-4 space-y-2 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-2 pt-4 md:bottom-4 md:mx-0 md:px-0">
          {lateWindow && (!isEdit || recipeLate) && (
            <p className="text-[11px] font-medium leading-snug text-orange-800 dark:text-orange-300">Esta receita não concorrerá à votação.</p>
          )}
          {!isEdit && (
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
              <ShieldCheck size={13} className="mt-px shrink-0" aria-hidden="true" />
              Ao enviar, você autoriza a divulgação da sua receita, com seu nome, na campanha e no Livro de Receitas.
            </p>
          )}
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
          {busy && <p className="text-center text-xs text-muted-foreground" aria-live="polite">Não feche esta tela até terminar.</p>}
        </div>
      )}

      <CampaignTour steps={SUBMIT_TOUR} tour={tour} />
    </motion.div>
  );
}
