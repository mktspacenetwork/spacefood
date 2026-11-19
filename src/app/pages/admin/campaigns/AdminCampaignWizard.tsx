import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, ChevronDown, Loader2, Megaphone, Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Checkbox } from "../../../components/ui/checkbox";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../components/ui/collapsible";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Progress } from "../../../components/ui/progress";
import { Switch } from "../../../components/ui/switch";
import { Textarea } from "../../../components/ui/textarea";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../context/auth-context";
import { CampaignApiError, campaignsApi, errMsg, uploadToSignedUrl } from "../../../lib/campaigns/api";
import { BANNER_MIN_SOURCE_WIDTH, BANNER_OBJECT_POSITION, prepareCover } from "../../../lib/campaigns/banner";
import { MAX_PHOTOS_PER_RECIPE, MAX_SUBMISSIONS_PER_USER } from "../../../lib/campaigns/types";
import type { AdminCampaign, AdminCampaignDetail, Audience, Features, MediaLimits, Visibility } from "../../../lib/campaigns/types";
import { CampaignTour, TourButton, tourKey, useTour } from "../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_WIZARD } from "../../../lib/campaigns/tours-admin";
import { useCampaignPerms } from "./useCampaignPerms";
import { ErrorBox, LoadingBox, Notice, RestrictedBox, SectionLabel, useBusy, useLoader } from "./shared";
import { PeriodFields } from "./PeriodFields";
import {
  EMPTY_SCHEDULE, periodPayload, sameSchedule, scheduleFromServer, validateSchedule,
} from "../../../lib/campaigns/schedule";
import type { SavedSchedule, ScheduleValues } from "../../../lib/campaigns/schedule";

// ─────────────────────────────── Modelo simples ───────────────────────────────
// O formulário só pergunta o essencial. O resto vai com valores fixos (o colaborador envia 1 foto, sem vídeo;
// toda receita passa por aprovação; ranking/resultado/divulgação só existem quando há votação).

/** Fotos: de 1 a 3 por receita (a 1ª é a principal, as outras são "extras"). Sem fotos, nada é exigido nem pedido. */
const mediaLimits = (hasPhotos: boolean): MediaLimits =>
  ({ max_photos: hasPhotos ? MAX_PHOTOS_PER_RECIPE - 1 : 0, max_photo_mb: 5, allow_video: false, max_video_mb: 1, require_main_photo: hasPhotos });
const SIMPLE_VISIBILITY: Visibility = { ranking_mode: "hidden_until_confirmed", gallery_visibility: "on_approval", show_podium: false, allow_preview: false };

/** `tour` entra só com `enabled`: o servidor mescla e preserva a versão da tour. */
type Options = { hasVoting: boolean; multiple: boolean; hasPhotos: boolean };
/** Votação e as funcionalidades que dependem dela (ranking, resultado, divulgação) ligam e desligam juntas. */
const votingFlags = (on: boolean) => ({ voting: on, ranking: on, results: on, announcement: on });
const simpleFeatures = (o: Options) => ({
  submission: true, photos: o.hasPhotos, video: false, approval: true, gallery: true,
  ...votingFlags(o.hasVoting),
  multiple_submissions: o.multiple,
  tour: { enabled: true },
}) as unknown as Features;

type Form = {
  name: string;
  description: string;
  instructions: string;
  coverPath: string | null;
  coverUrl: string | null;
  hasVoting: boolean;
  /** Permite mais de uma receita por colaborador (até 10). */
  multiple: boolean;
  /** Receita com fotos (de 1 a 3). Desligado: sem campo de foto. */
  hasPhotos: boolean;
  period: ScheduleValues;
  audienceMode: "all" | "users";
  users: string[];
};
type Snapshot = {
  version: number;
  status: string;
  /** Datas gravadas no servidor (valores do formulário + instantes originais + se é janela única antiga). */
  schedule: SavedSchedule;
  audienceKey: string;
  multiple: boolean;
  hasVoting: boolean;
  /** Votos já registrados (para pedir confirmação ao desligar a votação). */
  votesRegistered: number;
  /** Situação do resultado: confirmado/divulgado trava o desligamento da votação. */
  resultsStatus: string;
  /** Já há quem tenha enviado mais de uma receita (para o aviso ao desmarcar a opção). */
  hasMultipleSent: boolean;
  /** Campanha antiga filtrada por unidade/departamento: o modo é mantido como está. */
  legacyAudience: Audience | null;
};
type SiteUser = { id: string; name: string; department: string; unit: string };

const initialForm = (): Form => ({
  name: "", description: "", instructions: "", coverPath: null, coverUrl: null,
  hasVoting: false, multiple: false, hasPhotos: true,
  period: EMPTY_SCHEDULE, audienceMode: "all", users: [],
});

// ─────────────────────────────── Componentes ──────────────────────────────

function Field({ label, hint, children, tutorial }: { label: string; hint?: string; children: React.ReactNode; tutorial?: string }) {
  return (
    <div className="space-y-1.5" data-tutorial={tutorial}>
      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Prévia da capa como o carrossel da Home a mostra (mesmo `object-cover` e mesma posição dos banners comuns).
 * É UMA imagem para todos os aparelhos: o seletor só muda o tamanho da caixa para conferir o enquadramento.
 */
function BannerPreview({ url, title }: { url: string | null; title: string }) {
  const [size, setSize] = useState<"mobile" | "desktop">(() => (typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop"));
  return (
    <div className="space-y-2" aria-label="Como a capa aparece no banner da Home">
      <div className="inline-flex h-8 items-center rounded-lg border bg-card p-0.5" role="group" aria-label="Tamanho da prévia">
        {([["mobile", "Celular"], ["desktop", "Computador"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={size === k}
            onClick={() => setSize(k)}
            className={cn("h-7 rounded-md px-2.5 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={cn("relative w-full overflow-hidden rounded-3xl bg-[#FF5A1F] shadow-sm", size === "mobile" ? "aspect-[2/1] max-w-sm" : "aspect-[3.5/1]")}>
        {url ? (
          <img src={url} alt="" className="absolute inset-0 h-full w-full select-none object-cover" style={{ objectPosition: BANNER_OBJECT_POSITION }} draggable={false} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm font-bold text-white">{title.trim() || "Nome da campanha"}</span>
        )}
      </div>
    </div>
  );
}

/** Uma funcionalidade da campanha: título, explicação curta e o interruptor Sim/Não. */
function Option({
  title, hint, note, checked, onChange, disabled, tutorial, children,
}: {
  title: string;
  hint: string;
  note?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  tutorial?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5 py-3.5 first:pt-0 last:pb-0" data-tutorial={tutorial}>
      <label className={cn("flex items-center justify-between gap-4", disabled ? "opacity-70" : "cursor-pointer")}>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="mt-0.5 block text-[12px] text-muted-foreground">{hint}</span>
          {note && <span className="mt-1 block text-[11px] text-muted-foreground">{note}</span>}
        </span>
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={title} />
      </label>
      {children}
    </div>
  );
}

// ───────────────────────────────── Página ─────────────────────────────────

export function AdminCampaignWizard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { perms, loading: permsLoading, isAdmin } = useCampaignPerms();
  const { busy, run } = useBusy();
  const isEdit = !!id;

  const [form, setForm] = useState<Form>(initialForm);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [conflict, setConflict] = useState(false);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [votingOffOpen, setVotingOffOpen] = useState(false);

  const [siteUsers, setSiteUsers] = useState<SiteUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userQuery, setUserQuery] = useState("");

  const [coverBusy, setCoverBusy] = useState(false);
  const [coverProgress, setCoverProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // ── Carregamento (edição) ──
  const detail = useLoader<AdminCampaignDetail | null>(
    () => (id ? campaignsApi.get<AdminCampaignDetail>(`/admin/campaigns/${id}`) : Promise.resolve(null)),
    [id],
  );

  const canUse = !permsLoading && isAdmin && (isEdit ? !!perms.campaigns_edit : !!perms.campaigns_create);
  const tour = useTour({
    storageKey: tourKey("admin", user?.id, "wizard2"),
    enabled: canUse && (!isEdit || !!detail.data),
  });

  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    const c: AdminCampaign = d.campaign;
    const schedule = scheduleFromServer(d.stages, c.features?.voting ? d.results?.announce_at : null, !!c.features?.voting);
    const audience: Audience = c.audience ?? { mode: "all" };
    const legacy = audience.mode === "units" || audience.mode === "departments" ? audience : null;
    const mode: Form["audienceMode"] = audience.mode === "users" ? "users" : "all";
    const users = d.eligible_user_ids ?? [];
    setForm({
      name: c.name, description: c.description ?? "", instructions: c.instructions ?? "",
      coverPath: c.cover_path, coverUrl: c.cover_url,
      hasVoting: !!c.features?.voting,
      multiple: !!c.features?.multiple_submissions,
      hasPhotos: c.features?.photos !== false,
      period: schedule.values, audienceMode: mode, users,
    });
    setSnap({
      version: c.version, status: c.status, schedule,
      audienceKey: JSON.stringify({ m: mode, u: [...users].sort() }),
      multiple: !!c.features?.multiple_submissions, hasMultipleSent: false,
      hasVoting: !!c.features?.voting, votesRegistered: 0, resultsStatus: d.results?.status ?? "none",
      legacyAudience: legacy,
    });
    setDetailsOpen(!!(c.instructions ?? "").trim());
    setConflict(false);
    campaignsApi.get<{ eligible: number; submissions: number; participants: number; votes_registered?: number; votes_valid?: number; results?: { status?: string } | null }>(`/admin/campaigns/${c.id}/dashboard`)
      .then((r) => {
        setEligibleCount(r.eligible);
        // Mais receitas do que pessoas = alguém já enviou mais de uma.
        setSnap((s) => (s ? {
          ...s,
          hasMultipleSent: r.submissions > r.participants,
          votesRegistered: r.votes_registered ?? r.votes_valid ?? 0,
          resultsStatus: r.results?.status ?? s.resultsStatus,
        } : s));
      })
      .catch(() => {});
  }, [detail.data]);

  // Lista de pessoas só quando "Pessoas específicas" é escolhido.
  useEffect(() => {
    if (form.audienceMode !== "users" || siteUsers || usersLoading) return;
    setUsersLoading(true);
    setUsersError(null);
    campaignsApi.get<SiteUser[]>("/admin/users")
      .then(setSiteUsers)
      .catch((e) => setUsersError(
        e instanceof CampaignApiError && e.status === 403
          ? "Para escolher pessoas você precisa da permissão \"Editar campanhas\"."
          : errMsg(e)))
      .finally(() => setUsersLoading(false));
  }, [form.audienceMode, siteUsers, usersLoading]);

  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  const closed = snap?.status === "closed" || snap?.status === "archived";
  const published = snap?.status === "authorized";

  // ── Capa: uma imagem só (como nos Banners), reduzida e comprimida; o enquadramento é feito pelo carrossel ──
  const pickCover = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use uma imagem JPG, PNG ou WebP.");
      return;
    }
    setCoverBusy(true);
    setCoverProgress(0);
    try {
      const { file: banner, srcWidth } = await prepareCover(file);
      const t = await campaignsApi.post<{ path: string; signedUrl: string }>("/admin/media/upload-url", { mime: banner.type });
      await uploadToSignedUrl(t.signedUrl, banner, setCoverProgress);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(banner);
      setForm((f) => ({ ...f, coverPath: t.path, coverUrl: previewUrl.current }));
      if (srcWidth < BANNER_MIN_SOURCE_WIDTH) toast.warning("A imagem é pequena e pode ficar sem nitidez no banner. Prefira uma foto mais larga.");
      else toast.success("Capa pronta. Salve a campanha para aplicá-la.");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCoverBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Validação ──
  // Sequência participação → votação → divulgação; só avalia o que mudou em relação ao gravado. Roda ANTES de enviar
  // qualquer requisição (nada é criado nem alterado se as datas estiverem fora de ordem).
  const scheduleCheck = validateSchedule(form.period, form.hasVoting, snap?.schedule ?? null);
  const validate = (): string | null => {
    const name = form.name.trim();
    if (name.length < 3 || name.length > 120) return "Informe um nome com 3 a 120 caracteres.";
    const scheduleProblem = scheduleCheck.issue;
    if (scheduleProblem) return scheduleProblem.message;
    if (form.audienceMode === "users" && form.users.length === 0) return "Escolha pelo menos uma pessoa ou volte para \"Todos\".";
    return null;
  };

  // Votação: ligar/desligar vale mesmo com a campanha publicada. Desligar com votos registrados pede confirmação
  // (os votos ficam guardados e escondidos); com o resultado já confirmado/divulgado o servidor não permite.
  const votesAtRisk = isEdit && !!snap?.hasVoting && !form.hasVoting && (snap?.votesRegistered ?? 0) > 0;
  const votingLocked = !!snap?.hasVoting && (snap.resultsStatus === "confirmed" || snap.resultsStatus === "announced");

  // ── Salvar ──
  const save = () => {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    if (votesAtRisk) { setVotingOffOpen(true); return; }
    void doSave();
  };

  const doSave = async () => {
    setVotingOffOpen(false);
    const r = await run("save", async () => {
      let cid = id ?? null;
      let phase = "criar a campanha";
      const wrap = (e: unknown) => {
        if (e instanceof CampaignApiError && e.code === "VERSION_CONFLICT") setConflict(true);
        return new Error(cid && !isEdit ? `A campanha foi criada, mas não foi possível ${phase}: ${errMsg(e)}` : errMsg(e));
      };
      try {
        if (!cid) {
          const created = await campaignsApi.post<{ id: string; slug: string }>("/admin/campaigns", {
            name: form.name.trim(), description: form.description.trim(), instructions: form.instructions.trim(),
            cover_path: form.coverPath,
            features: simpleFeatures(form), media_limits: mediaLimits(form.hasPhotos), visibility: SIMPLE_VISIBILITY,
            audience: { mode: form.audienceMode },
          });
          cid = created.id;
        } else {
          phase = "salvar os dados";
          const body: Record<string, unknown> = {
            name: form.name.trim(), description: form.description.trim(), instructions: form.instructions.trim(),
            cover_path: form.coverPath, version: snap?.version,
          };
          // Rascunho: normaliza para o modelo simples (inclui o rascunho antigo). Publicada: o servidor trava
          // fotos/outras funcionalidades; só "várias receitas" e a votação (com ranking/resultado/divulgação) mudam.
          if (!snap || snap.status === "draft" || snap.status === "in_review") {
            body.features = simpleFeatures(form);
            body.media_limits = mediaLimits(form.hasPhotos);
            body.visibility = SIMPLE_VISIBILITY;
          } else {
            const changed: Record<string, unknown> = {};
            if (snap.multiple !== form.multiple) changed.multiple_submissions = form.multiple;
            if (snap.hasVoting !== form.hasVoting) Object.assign(changed, votingFlags(form.hasVoting));
            if (Object.keys(changed).length > 0) body.features = changed;
          }
          await campaignsApi.put(`/admin/campaigns/${cid}`, body);
        }
      } catch (e) {
        throw wrap(e);
      }

      // Quem participa
      phase = "salvar quem participa";
      try {
        const key = JSON.stringify({ m: form.audienceMode, u: [...form.users].sort() });
        const keep = snap?.legacyAudience; // filtro antigo por unidade/departamento: não mexe
        if (!keep && (!isEdit ? form.audienceMode === "users" : snap?.audienceKey !== key)) {
          const res = await campaignsApi.put<{ eligible_count: number }>(`/admin/campaigns/${cid}/audience`, {
            audience: { mode: form.audienceMode }, users: form.audienceMode === "users" ? form.users : [],
          });
          setEligibleCount(res.eligible_count);
        }
      } catch (e) {
        throw wrap(e);
      }

      // Datas: participação, votação (datas próprias; campanha antiga de janela única não envia `voting_*`) e divulgação
      phase = "salvar as datas";
      try {
        const base = periodPayload(form.period, form.hasVoting, snap?.schedule ?? null);
        const votingOff = !!snap?.hasVoting && !form.hasVoting; // desligou a votação: limpa a data de divulgação
        const payload = base && votingOff ? { ...base, announce_at: null } : base;
        // Também regrava quando a votação foi ligada agora (a votação precisa de datas próprias).
        const votingOn = form.hasVoting && !!snap && !snap.hasVoting;
        if (payload && (!isEdit || !snap || votingOn || votingOff || !sameSchedule(snap.schedule.values, form.period, form.hasVoting))) {
          await campaignsApi.put(`/admin/campaigns/${cid}/period`, payload);
        }
      } catch (e) {
        throw wrap(e);
      }
      return cid as string;
    }, isEdit ? "Alterações salvas." : "Rascunho salvo.");

    if (r.ok) navigate(`/admin/campaigns/${r.value}`);
  };

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return (siteUsers ?? []).filter((u) => !q || u.name.toLowerCase().includes(q) || u.department.toLowerCase().includes(q)).slice(0, 80);
  }, [siteUsers, userQuery]);

  if (permsLoading) return <LoadingBox />;
  if (!isAdmin) return <RestrictedBox />;
  if (isEdit ? !perms.campaigns_edit : !perms.campaigns_create) {
    return <RestrictedBox message="Você não tem permissão para esta ação no módulo de Campanhas." />;
  }
  if (isEdit && detail.loading && !detail.data) return <LoadingBox />;
  if (isEdit && detail.error && !detail.data) return <ErrorBox message={detail.error} onRetry={detail.reload} />;

  const saving = busy === "save";
  const saveLabel = isEdit && published ? "Salvar alterações" : "Salvar rascunho";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Cabeçalho */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/admin/campaigns/${id}` : "/admin/campaigns")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={12} /> Voltar
          </button>
          <TourButton className="h-8 px-2.5 text-[11px]" onClick={tour.start} />
        </div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
          <Megaphone className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
          {isEdit ? "Editar campanha" : "Nova campanha"}
        </h1>
        {!isEdit && <p className="text-sm text-muted-foreground">Nasce como rascunho: só a gestão vê até você publicar.</p>}
      </div>

      {closed && <Notice tone="warn" title="Campanha encerrada ou arquivada">Ela não pode mais ser editada.</Notice>}
      {conflict && (
        <Notice tone="danger" title="A campanha foi alterada por outra pessoa">
          <div className="flex flex-wrap items-center gap-3">
            <span>Recarregue para ver a versão mais recente antes de salvar.</span>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => detail.reload()}>Recarregar dados</Button>
          </div>
        </Notice>
      )}

      {/* Sobre a campanha */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-wiz-about">
        <CardContent className="space-y-4 p-5">
          <Field label="Nome da campanha">
            <Input
              value={form.name}
              maxLength={120}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ex.: Café Especial | Memórias Afetivas"
              className="h-11 rounded-xl"
              disabled={closed}
            />
          </Field>
          <Field label="Descrição" hint="Aparece no cartão da campanha e no banner da Home.">
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              maxLength={600}
              className="rounded-xl"
              disabled={closed}
            />
            <p className="text-right text-[11px] tabular-nums text-muted-foreground">{form.description.length}/600</p>
          </Field>

          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary focus:outline-none focus-visible:underline">
              Mais detalhes (opcional)
              <ChevronDown size={15} aria-hidden="true" className="transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <Field label="Regras e orientações" hint="Mostradas em “Ver detalhes”, na página da campanha. Uma instrução por linha.">
                <Textarea
                  value={form.instructions}
                  onChange={(e) => set("instructions", e.target.value)}
                  rows={6}
                  maxLength={3000}
                  className="rounded-xl"
                  disabled={closed}
                />
              </Field>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Capa = banner da Home */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-wiz-cover">
        <CardContent className="space-y-4 p-5">
          <div>
            <SectionLabel>Imagem do banner</SectionLabel>
            <p className="mt-1 text-[12px] text-muted-foreground">É a capa da campanha e o banner da Home — uma imagem só.</p>
          </div>
          <BannerPreview url={form.coverUrl} title={form.name} />
          <input ref={fileRef} id="campaign-cover-upload" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={coverBusy || closed} onChange={(e) => pickCover(e.target.files?.[0])} />
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="campaign-cover-upload"
              className={cn(
                "flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80",
                coverBusy || closed ? "pointer-events-none opacity-50" : "cursor-pointer",
              )}
            >
              {coverBusy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {form.coverUrl ? "Trocar imagem" : "Upload"}
            </label>
            {form.coverUrl && !coverBusy && !closed && (
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 rounded-xl text-muted-foreground" onClick={() => setForm((f) => ({ ...f, coverPath: null, coverUrl: null }))}>
                <X size={13} /> Remover
              </Button>
            )}
            {coverBusy && <Progress value={coverProgress * 100} className="w-32" />}
          </div>
          <p className="text-[11px] text-muted-foreground">
            JPG, PNG ou WebP, como nos Banners; as bordas podem ser cortadas conforme a tela. Sem imagem, o banner usa o fundo laranja com o nome.
          </p>
        </CardContent>
      </Card>

      {/* Funcionalidades */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-wiz-features">
        <CardContent className="divide-y divide-border p-5">
          <Option
            tutorial="camp-wiz-voting"
            title="Esta campanha terá votação?"
            hint={form.hasVoting ? "Cada pessoa tem um voto." : "Sem votação: nada sobre votos aparece."}
            note={
              votingLocked
                ? "Ganhador já confirmado: a votação não pode mais ser desligada."
                : published
                ? "Pode ligar ou desligar a qualquer momento. Votos já registrados ficam guardados."
                : undefined
            }
            checked={form.hasVoting}
            onChange={(v) => set("hasVoting", v)}
            disabled={closed || votingLocked}
          />
          <Option
            tutorial="camp-wiz-photos"
            title="Permitir envio de fotos?"
            hint={form.hasPhotos ? `A receita leva de 1 a ${MAX_PHOTOS_PER_RECIPE} fotos.` : "Sem fotos: o envio não tem campo de foto."}
            note={published ? "Não dá para mudar depois de publicada." : undefined}
            checked={form.hasPhotos}
            onChange={(v) => set("hasPhotos", v)}
            disabled={published || closed}
          />
          <Option
            tutorial="camp-wiz-multiple"
            title="Permitir mais de uma receita por colaborador?"
            hint={form.multiple ? `Cada pessoa pode enviar até ${MAX_SUBMISSIONS_PER_USER} receitas.` : "Cada pessoa envia uma receita só."}
            note={published ? "Vale também com a campanha publicada. As receitas já enviadas continuam como estão." : undefined}
            checked={form.multiple}
            onChange={(v) => set("multiple", v)}
            disabled={closed}
          >
            {snap?.hasMultipleSent && !form.multiple && (
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Algumas pessoas já enviaram mais de uma receita. Todas continuam salvas; só não dá para enviar outra.
              </p>
            )}
          </Option>
        </CardContent>
      </Card>

      {/* Período */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-wiz-period">
        <CardContent className="space-y-3 p-5">
          <SectionLabel>{form.hasVoting ? "Datas" : "Período"}</SectionLabel>
          <PeriodFields
            values={form.period} onChange={(p) => set("period", p)} hasVoting={form.hasVoting} check={scheduleCheck}
            disabled={closed} datesDisabled={snap?.resultsStatus === "confirmed" || snap?.resultsStatus === "announced"}
            legacyWindow={snap?.schedule.legacy}
          />
          <p className="text-[11px] text-muted-foreground">
            Cada etapa abre às 00:00 do início e fecha no fim do dia do encerramento (horário de Brasília).
            {form.hasVoting ? " A votação só começa depois da participação e a divulgação, depois da votação." : ""}
          </p>
        </CardContent>
      </Card>

      {/* Quem participa */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-wiz-audience">
        <CardContent className="space-y-3 p-5">
          <SectionLabel>Quem participa</SectionLabel>
          {snap?.legacyAudience ? (
            <Notice tone="info">
              Esta campanha usa um filtro antigo por {snap.legacyAudience.mode === "units" ? "unidade" : "departamento"}. Ele é mantido como está.
            </Notice>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Quem participa">
                {([
                  ["all", "Todos", "Qualquer colaborador com cadastro concluído."],
                  ["users", "Pessoas específicas", "Você escolhe uma a uma (bom para testes)."],
                ] as const).map(([mode, title, hint]) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={form.audienceMode === mode}
                    disabled={closed}
                    onClick={() => set("audienceMode", mode)}
                    className={cn("rounded-2xl border p-3 text-left transition-colors", form.audienceMode === mode ? "border-primary bg-primary/10" : "hover:bg-accent")}
                  >
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>

              {form.audienceMode === "users" && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{form.users.length} {form.users.length === 1 ? "pessoa selecionada" : "pessoas selecionadas"}</p>
                  {usersLoading ? (
                    <LoadingBox label="Carregando pessoas..." />
                  ) : usersError ? (
                    <Notice tone="warn">{usersError}</Notice>
                  ) : (
                    <>
                      <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Buscar pelo nome ou departamento" className="h-10 rounded-xl" aria-label="Buscar pessoa" />
                      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-2xl border">
                        {filteredUsers.map((u) => {
                          const on = form.users.includes(u.id);
                          return (
                            <li key={u.id}>
                              <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                                <Checkbox checked={on} onCheckedChange={(v) => set("users", v === true ? [...form.users, u.id] : form.users.filter((x) => x !== u.id))} aria-label={u.name} />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">{u.name}</span>
                                  <span className="block truncate text-[11px] text-muted-foreground">{[u.department, u.unit].filter(Boolean).join(" · ") || "—"}</span>
                                </span>
                              </label>
                            </li>
                          );
                        })}
                        {filteredUsers.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Nenhuma pessoa encontrada.</li>}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {eligibleCount !== null && (
            <p className="text-[12px] text-muted-foreground"><b className="text-foreground">{eligibleCount}</b> {eligibleCount === 1 ? "colaborador elegível" : "colaboradores elegíveis"} hoje.</p>
          )}

        </CardContent>
      </Card>

      {/* Salvar */}
      <div className="flex flex-col-reverse gap-2 pb-2 sm:flex-row sm:justify-end">
        <Button variant="outline" className="rounded-xl" onClick={() => navigate(isEdit ? `/admin/campaigns/${id}` : "/admin/campaigns")} disabled={saving}>
          Cancelar
        </Button>
        <Button className="gap-2 rounded-xl" onClick={save} disabled={saving || closed || coverBusy}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saveLabel}
        </Button>
      </div>

      <ConfirmDialog
        open={votingOffOpen}
        onOpenChange={setVotingOffOpen}
        title="Desligar a votação?"
        description={`Os ${snap?.votesRegistered ?? 0} votos registrados ficam guardados, mas a votação e o ranking somem para todos. Se você ligar de novo, eles voltam.`}
        confirmLabel="Desligar e salvar"
        variant="destructive"
        onConfirm={() => void doSave()}
      />

      <CampaignTour steps={ADMIN_TOUR_WIZARD} tour={tour} />
    </div>
  );
}
