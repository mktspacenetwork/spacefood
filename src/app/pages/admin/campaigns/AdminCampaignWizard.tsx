import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ImagePlus, Loader2, Lock, Megaphone, Save, Sparkles, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Progress } from "../../../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Switch } from "../../../components/ui/switch";
import { Textarea } from "../../../components/ui/textarea";
import { cn } from "../../../lib/utils";
import { api } from "../../../lib/api";
import { compressImage } from "../../../lib/image-compress";
import { useAuth } from "../../../context/auth-context";
import { CampaignApiError, campaignsApi, errMsg, uploadToSignedUrl } from "../../../lib/campaigns/api";
import { fromInputValue, STAGE_LABEL, toInputValue } from "../../../lib/campaigns/format";
import {
  DEFAULT_FEATURES, DEFAULT_MEDIA_LIMITS, DEFAULT_VISIBILITY,
  type AdminCampaignDetail, type Audience, type Features, type MediaLimits, type StageKey, type Visibility,
} from "../../../lib/campaigns/types";
import { CampaignTour, TourButton, tourKey, useTour } from "../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_WIZARD } from "../../../lib/campaigns/tours-admin";
import { useCampaignPerms } from "./useCampaignPerms";
import { ErrorBox, LoadingBox, Notice, RestrictedBox, SectionLabel, slugify, useBusy, useLoader } from "./shared";

// ─────────────────────────────── Constantes ───────────────────────────────

const STEPS = [
  { key: "identity", label: "Identidade" },
  { key: "audience", label: "Público" },
  { key: "features", label: "Funcionalidades" },
  { key: "schedule", label: "Calendário" },
  { key: "review", label: "Revisão" },
] as const;

const STAGE_KEYS: StageKey[] = ["registration", "voting", "results", "announcement"];
const STAGE_HINT: Record<StageKey, string> = {
  registration: "Período em que os colaboradores podem enviar receitas.",
  voting: "Período de votação. Começa depois do fim das inscrições.",
  results: "Quando a apuração dos votos fica disponível para a gestão.",
  announcement: "Quando o resultado pode ser divulgado aos colaboradores.",
};

// Dependências exatamente como campaign_validate_features (banco): filho -> pais.
const PARENTS: Record<string, string[]> = {
  photos: ["submission"], video: ["submission"], approval: ["submission"],
  gallery: ["approval"], voting: ["approval"], ranking: ["voting"], results: ["voting"], announcement: ["results"],
};
const FEATURE_ROWS: { key: keyof Omit<Features, "tour">; label: string; hint: string }[] = [
  { key: "submission", label: "Formulário de participação", hint: "Colaboradores enviam receitas (prato, descrição, ingredientes e preparo)." },
  { key: "photos", label: "Fotos", hint: "Foto principal e fotos complementares na receita." },
  { key: "video", label: "Vídeo", hint: "Um vídeo opcional por receita." },
  { key: "approval", label: "Aprovação pela administração", hint: "A gestão aprova ou reprova cada receita antes da votação." },
  { key: "gallery", label: "Galeria de receitas", hint: "Colaboradores veem as receitas aprovadas." },
  { key: "voting", label: "Votação", hint: "Cada colaborador tem um único voto, definitivo." },
  { key: "ranking", label: "Ranking", hint: "Mostra a classificação conforme o modo escolhido." },
  { key: "results", label: "Resultado e vencedor", hint: "Apuração, desempate e confirmação do vencedor." },
  { key: "announcement", label: "Divulgação do resultado", hint: "Anúncio oficial do vencedor aos colaboradores." },
];
const FEATURE_LABEL: Record<string, string> = Object.fromEntries(FEATURE_ROWS.map((r) => [r.key, r.label]));

const PROTECTED_RULES = [
  "Cada colaborador envia no máximo 1 receita e dá no máximo 1 voto.",
  "Ninguém pode votar na própria receita.",
  "O voto é definitivo: depois de confirmado, não pode ser alterado pelo colaborador.",
  "Quando a votação começa, as receitas ficam bloqueadas para edição — para sempre, mesmo se a votação for pausada ou prorrogada.",
  "Aprovar, reprovar, invalidar um voto ou decidir um empate exige justificativa de pelo menos 10 caracteres.",
  "Reprovações e votos invalidados são preservados no histórico; nada é apagado.",
  "O resultado só é divulgado depois de a gestão confirmar o vencedor.",
];

const TEMPLATE = {
  name: "Café Especial | Memórias Afetivas",
  description:
    "Compartilhe a receita de um café especial que carrega uma memória afetiva: o café da avó, da roça, da manhã em família. Envie fotos (e, se quiser, um vídeo), conte a história por trás da receita e concorra com as receitas de todo o time.",
  objective:
    "Valorizar as memórias afetivas ligadas ao café e aproximar as pessoas do time por meio de receitas e histórias. As receitas aprovadas vão à votação e a mais votada é a vencedora.",
  instructions:
    "1. Envie uma receita por pessoa, com nome do prato, descrição, ingredientes e modo de preparo.\n2. Conte, na descrição, a memória afetiva por trás do café.\n3. Anexe uma foto principal (e, se quiser, outras fotos e um vídeo curto).\n4. A gestão analisa as receitas. Se uma receita for reprovada, você verá o motivo e poderá ajustá-la e reenviá-la.\n5. Na votação, cada pessoa tem um único voto, que não pode ser alterado e não vale para a própria receita.",
};

// ───────────────────────────────── Tipos ──────────────────────────────────

type StageForm = { starts: string; ends: string };
type StagesForm = Record<StageKey, StageForm>;
type Form = {
  name: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  objective: string;
  instructions: string;
  coverPath: string | null;
  coverUrl: string | null;
  audience: Audience;
  users: string[];
  features: Features;
  visibility: Visibility;
  limits: MediaLimits;
  stages: StagesForm;
};
type SiteUser = { id: string; name: string; department: string; unit: string };

const emptyStages = (): StagesForm => ({
  registration: { starts: "", ends: "" }, voting: { starts: "", ends: "" },
  results: { starts: "", ends: "" }, announcement: { starts: "", ends: "" },
});

const initialForm = (): Form => ({
  name: "", slug: "", slugTouched: false, description: "", objective: "", instructions: "",
  coverPath: null, coverUrl: null,
  audience: { mode: "all" }, users: [],
  features: { ...DEFAULT_FEATURES, tour: { ...DEFAULT_FEATURES.tour } },
  visibility: { ...DEFAULT_VISIBILITY },
  limits: { ...DEFAULT_MEDIA_LIMITS },
  stages: emptyStages(),
});

type Snapshot = {
  features: Features;
  limits: MediaLimits;
  audience: string;
  stages: Record<StageKey, { starts: string | null; ends: string | null }>;
  version: number;
  status: string;
  locked: boolean;
};

function setFeatureWithDeps(f: Features, key: keyof Omit<Features, "tour">, on: boolean): Features {
  const next: Features = { ...f, [key]: on };
  if (on) {
    for (const p of PARENTS[key] ?? []) {
      if (!next[p as keyof Omit<Features, "tour">]) Object.assign(next, setFeatureWithDeps(next, p as keyof Omit<Features, "tour">, true));
    }
  } else {
    for (const [child, parents] of Object.entries(PARENTS)) {
      if (parents.includes(key) && next[child as keyof Omit<Features, "tour">]) {
        Object.assign(next, setFeatureWithDeps(next, child as keyof Omit<Features, "tour">, false));
      }
    }
  }
  return next;
}

/** Só envia as chaves de `features` que mudaram: o servidor bloqueia mexer em funcionalidades de campanha publicada com receitas. */
function diffFeatures(orig: Features, cur: Features): Partial<Features> | null {
  const out: Partial<Features> = {};
  for (const k of Object.keys(cur) as (keyof Features)[]) {
    if (JSON.stringify(orig[k]) !== JSON.stringify(cur[k])) (out as Record<string, unknown>)[k] = cur[k];
  }
  return Object.keys(out).length ? out : null;
}

const parseUnits = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map((u) => (typeof u === "string" ? u : (u as { name?: string })?.name)).filter((x): x is string => !!x) : [];

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

// ─────────────────────────────── Componentes ──────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  title, hint, checked, onChange, disabled,
}: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center justify-between gap-4 px-3 py-2.5", disabled ? "opacity-60" : "cursor-pointer")}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={title} />
    </label>
  );
}

// ───────────────────────────────── Página ─────────────────────────────────

export function AdminCampaignWizard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { perms, loading: permsLoading, isAdmin } = useCampaignPerms();
  const { busy, run } = useBusy();

  const [savedId, setSavedId] = useState<string | null>(null);
  const campaignId = id ?? savedId;
  const isEdit = !!id;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initialForm);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [conflict, setConflict] = useState(false);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);

  const [units, setUnits] = useState<string[]>([]);
  const [siteUsers, setSiteUsers] = useState<SiteUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [deptDraft, setDeptDraft] = useState("");

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
    storageKey: tourKey("admin", user?.id, "wizard"),
    enabled: canUse && (!isEdit || !!detail.data),
  });

  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    const c = d.campaign;
    const stages = emptyStages();
    const origStages = {} as Snapshot["stages"];
    for (const k of STAGE_KEYS) {
      const s = d.stages.find((x) => x.stage_key === k);
      stages[k] = { starts: toInputValue(s?.starts_at), ends: toInputValue(s?.ends_at) };
      origStages[k] = { starts: s?.starts_at ?? null, ends: s?.ends_at ?? null };
    }
    const audience: Audience = c.audience ?? { mode: "all" };
    setForm({
      name: c.name, slug: c.slug, slugTouched: true,
      description: c.description ?? "", objective: c.objective ?? "", instructions: c.instructions ?? "",
      coverPath: c.cover_path, coverUrl: c.cover_url,
      audience, users: d.eligible_user_ids ?? [],
      features: { ...DEFAULT_FEATURES, ...c.features, tour: { ...DEFAULT_FEATURES.tour, ...(c.features?.tour ?? {}) } },
      visibility: { ...DEFAULT_VISIBILITY, ...c.visibility },
      limits: { ...DEFAULT_MEDIA_LIMITS, ...c.media_limits },
      stages,
    });
    setSnap({
      features: { ...DEFAULT_FEATURES, ...c.features, tour: { ...DEFAULT_FEATURES.tour, ...(c.features?.tour ?? {}) } },
      limits: { ...DEFAULT_MEDIA_LIMITS, ...c.media_limits },
      audience: JSON.stringify({ a: audience, u: [...(d.eligible_user_ids ?? [])].sort() }),
      stages: origStages,
      version: c.version,
      status: c.status,
      locked: !!c.edit_locked_at,
    });
    setConflict(false);
    campaignsApi.get<{ eligible: number }>(`/admin/campaigns/${c.id}/dashboard`).then((r) => setEligibleCount(r.eligible)).catch(() => {});
  }, [detail.data]);

  useEffect(() => {
    api.get("/admin/settings").then((s) => setUnits(parseUnits(s?.units))).catch(() => {});
  }, []);

  // Lista de pessoas só quando o público "pessoas específicas" é escolhido.
  useEffect(() => {
    if (form.audience.mode !== "users" || siteUsers || usersLoading) return;
    setUsersLoading(true);
    setUsersError(null);
    campaignsApi.get<SiteUser[]>("/admin/users")
      .then(setSiteUsers)
      .catch((e) => setUsersError(
        e instanceof CampaignApiError && e.status === 403
          ? "Para escolher pessoas você precisa da permissão \"Editar campanhas\"."
          : errMsg(e)))
      .finally(() => setUsersLoading(false));
  }, [form.audience.mode, siteUsers, usersLoading]);

  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  const closed = snap?.status === "closed" || snap?.status === "archived";
  const published = snap?.status === "authorized";
  const locked = !!snap?.locked;

  // ── Capa ──
  const pickCover = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use uma imagem JPG, PNG ou WebP.");
      return;
    }
    setCoverBusy(true);
    setCoverProgress(0);
    try {
      const compressed = await compressImage(file, { maxSize: 1600, quality: 0.85, outputType: "image/jpeg" });
      const t = await campaignsApi.post<{ path: string; signedUrl: string }>("/admin/media/upload-url", { mime: compressed.type || file.type });
      await uploadToSignedUrl(t.signedUrl, compressed, setCoverProgress);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(compressed);
      setForm((f) => ({ ...f, coverPath: t.path, coverUrl: previewUrl.current }));
      toast.success("Capa enviada. Salve a campanha para aplicá-la.");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCoverBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Validação ──
  const validate = (): { ok: true } | { ok: false; step: number; message: string } => {
    const name = form.name.trim();
    if (name.length < 3 || name.length > 120) return { ok: false, step: 0, message: "Informe um nome com 3 a 120 caracteres." };
    if (!isEdit && !campaignId) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug) || form.slug.length < 3 || form.slug.length > 60) {
        return { ok: false, step: 0, message: "O endereço deve ter 3 a 60 caracteres, só letras minúsculas, números e hífens." };
      }
    }
    const t = (s: StageKey) => ({ s: fromInputValue(form.stages[s].starts), e: fromInputValue(form.stages[s].ends) });
    for (const k of STAGE_KEYS) {
      const { s, e } = t(k);
      if (s && e && new Date(e) <= new Date(s)) return { ok: false, step: 3, message: `${STAGE_LABEL[k]}: o fim precisa ser depois do início.` };
    }
    const reg = t("registration"), vot = t("voting"), res = t("results");
    if (reg.e && vot.s && new Date(reg.e) > new Date(vot.s)) return { ok: false, step: 3, message: "As inscrições precisam terminar antes de a votação começar." };
    if (vot.e && res.s && new Date(vot.e) > new Date(res.s)) return { ok: false, step: 3, message: "A votação precisa terminar antes de a apuração começar." };
    return { ok: true };
  };

  // ── Salvar ──
  const save = async () => {
    const v = validate();
    if (!v.ok) {
      toast.error(v.message);
      setStep(v.step);
      return;
    }
    const orig = isEdit ? snap : null;
    const r = await run("save", async () => {
      let cid = campaignId;
      let phase = "salvar a campanha";
      const wrap = (e: unknown) => {
        if (e instanceof CampaignApiError && e.code === "VERSION_CONFLICT") setConflict(true);
        return new Error(cid && !isEdit && phase !== "criar a campanha"
          ? `A campanha foi criada, mas não foi possível ${phase}: ${errMsg(e)}`
          : errMsg(e));
      };
      try {
        phase = cid ? "salvar os dados" : "criar a campanha";
        if (!cid) {
          const created = await campaignsApi.post<{ id: string; slug: string }>("/admin/campaigns", {
            name: form.name.trim(), slug: form.slug,
            description: form.description, objective: form.objective, instructions: form.instructions,
            cover_path: form.coverPath, features: form.features, visibility: form.visibility, media_limits: form.limits,
          });
          cid = created.id;
          setSavedId(cid);
        } else {
          const body: Record<string, unknown> = {
            name: form.name.trim(), description: form.description, objective: form.objective,
            instructions: form.instructions, cover_path: form.coverPath, visibility: form.visibility,
          };
          if (orig) {
            body.version = orig.version;
            const fd = diffFeatures(orig.features, form.features);
            if (fd) body.features = fd;
            if (JSON.stringify(orig.limits) !== JSON.stringify(form.limits)) body.media_limits = form.limits;
          } else {
            body.features = form.features;
            body.media_limits = form.limits;
          }
          await campaignsApi.put(`/admin/campaigns/${cid}`, body);
        }
      } catch (e) {
        throw wrap(e);
      }

      // Público
      phase = "salvar o público";
      try {
        const audienceKey = JSON.stringify({ a: form.audience, u: [...form.users].sort() });
        if (!orig || orig.audience !== audienceKey) {
          const res = await campaignsApi.put<{ eligible_count: number }>(`/admin/campaigns/${cid}/audience`, {
            audience: form.audience, users: form.users,
          });
          setEligibleCount(res.eligible_count);
        }
      } catch (e) {
        throw wrap(e);
      }

      // Etapas — só as que mudaram; se a ordem temporária der conflito, tenta de novo depois das demais.
      phase = "salvar as datas";
      try {
        let pending = STAGE_KEYS
          .map((k) => ({ key: k, starts: fromInputValue(form.stages[k].starts), ends: fromInputValue(form.stages[k].ends) }))
          .filter((s) => {
            const o = orig?.stages[s.key];
            return o ? (o.starts !== s.starts || o.ends !== s.ends) : !!(s.starts || s.ends);
          });
        for (let pass = 0; pass < 4 && pending.length > 0; pass++) {
          const failed: typeof pending = [];
          let lastErr: unknown;
          for (const s of pending) {
            try {
              await campaignsApi.put(`/admin/campaigns/${cid}/stages/${s.key}`, { starts_at: s.starts, ends_at: s.ends });
            } catch (e) {
              if (e instanceof CampaignApiError && e.code === "INVALID_DATES") { failed.push(s); lastErr = e; } else throw e;
            }
          }
          if (failed.length === pending.length) throw lastErr;
          pending = failed;
        }
        if (pending.length > 0) throw new Error("As datas ficaram incoerentes entre as etapas. Revise o calendário.");
      } catch (e) {
        throw wrap(e);
      }
      return cid as string;
    }, isEdit ? "Alterações salvas." : "Rascunho salvo.");

    if (r.ok) navigate(`/admin/campaigns/${r.value}`);
  };

  // ── Público: pessoas ──
  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return (siteUsers ?? []).filter((u) => !q || u.name.toLowerCase().includes(q) || u.department.toLowerCase().includes(q)).slice(0, 80);
  }, [siteUsers, userQuery]);

  const addDepartment = () => {
    const d = deptDraft.trim();
    if (!d) return;
    const cur = form.audience.departments ?? [];
    if (!cur.some((x) => x.toLowerCase() === d.toLowerCase())) set("audience", { ...form.audience, departments: [...cur, d] });
    setDeptDraft("");
  };

  // ── Revisão ──
  const hints = useMemo(() => {
    const out: { ok: boolean; text: string }[] = [];
    out.push({ ok: form.name.trim().length >= 3, text: "Nome da campanha preenchido" });
    out.push({ ok: form.description.trim().length >= 10, text: "Descrição com pelo menos 10 caracteres (exigida para publicar)" });
    out.push({ ok: form.features.submission, text: "Formulário de participação habilitado (exigido para publicar)" });
    const reg = form.stages.registration, vot = form.stages.voting;
    if (form.features.submission) out.push({ ok: !!(reg.starts && reg.ends), text: "Período de inscrições definido" });
    if (form.features.voting) out.push({ ok: !!(vot.starts && vot.ends), text: "Período de votação definido" });
    const aud = form.audience;
    const audOk = aud.mode === "all" || (aud.mode === "units" && (aud.units?.length ?? 0) > 0) ||
      (aud.mode === "departments" && (aud.departments?.length ?? 0) > 0) || (aud.mode === "users" && form.users.length > 0);
    out.push({ ok: audOk, text: "Público com pelo menos um critério escolhido" });
    return out;
  }, [form]);

  const audienceSummary = (() => {
    const a = form.audience;
    if (a.mode === "all") return "Todos os colaboradores";
    if (a.mode === "units") return `Unidades: ${(a.units ?? []).join(", ") || "nenhuma escolhida"}`;
    if (a.mode === "departments") return `Departamentos: ${(a.departments ?? []).join(", ") || "nenhum informado"}`;
    return `${form.users.length} pessoa(s) específica(s)`;
  })();

  if (permsLoading) return <LoadingBox />;
  if (!isAdmin) return <RestrictedBox />;
  if (isEdit ? !perms.campaigns_edit : !perms.campaigns_create) {
    return <RestrictedBox message="Você não tem permissão para esta ação no módulo de Campanhas." />;
  }
  if (isEdit && detail.loading && !detail.data) return <LoadingBox />;
  if (isEdit && detail.error && !detail.data) return <ErrorBox message={detail.error} onRetry={detail.reload} />;

  const last = step === STEPS.length - 1;
  const saving = busy === "save";

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/admin/campaigns/${id}` : "/admin/campaigns")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft size={12} /> Voltar
          </button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone size={24} className="text-primary" />
            {isEdit ? "Editar campanha" : "Nova campanha"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isEdit ? form.name : "A campanha nasce como rascunho: ninguém além da gestão a vê até você publicar."}
          </p>
        </div>
        <TourButton onClick={tour.start} />
      </div>

      {/* Etapas */}
      <nav aria-label="Etapas do assistente" className="flex gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <button
              key={s.key}
              type="button"
              data-tutorial={`camp-wiz-step-${s.key}`}
              onClick={() => setStep(i)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 shrink-0 rounded-xl border px-3 h-10 text-sm font-medium transition-colors",
                active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent text-muted-foreground",
              )}
            >
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold", active ? "bg-primary text-primary-foreground" : done ? "bg-green-500 text-white" : "bg-muted")}>
                {done ? <Check size={11} /> : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
      </nav>

      {closed && <Notice tone="warn" title="Campanha encerrada ou arquivada">Ela não pode mais ser editada.</Notice>}
      {published && (
        <Notice tone="info" title="Esta campanha já está publicada">
          Funcionalidades e limites de mídia não podem mudar se já houver receitas enviadas — o sistema avisará caso você tente.
        </Notice>
      )}
      {conflict && (
        <Notice tone="danger" title="A campanha foi alterada por outra pessoa">
          <div className="flex flex-wrap items-center gap-3">
            <span>Recarregue para ver a versão mais recente antes de salvar.</span>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => detail.reload()}>Recarregar dados</Button>
          </div>
        </Notice>
      )}

      {/* ── 1. Identidade ── */}
      {step === 0 && (
        <Card className="rounded-3xl border">
          <CardContent className="p-5 space-y-5">
            {!isEdit && !campaignId && (
              <div className="rounded-2xl border border-dashed p-4 flex flex-wrap items-center justify-between gap-3" data-tutorial="camp-wiz-template">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Começar por um modelo</p>
                  <p className="text-[12px] text-muted-foreground">Preenche nome, descrição, objetivo e orientações do concurso Café Especial.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-xl"
                  onClick={() => setForm((f) => ({ ...f, name: TEMPLATE.name, slug: slugify(TEMPLATE.name), slugTouched: true, description: TEMPLATE.description, objective: TEMPLATE.objective, instructions: TEMPLATE.instructions }))}
                >
                  <Sparkles size={14} /> Usar modelo: Concurso de receitas — Café Especial | Memórias Afetivas
                </Button>
              </div>
            )}

            <Field label="Nome da campanha">
              <Input
                value={form.name}
                maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: f.slugTouched || isEdit ? f.slug : slugify(e.target.value) }))}
                placeholder="Ex.: Café Especial | Memórias Afetivas"
                className="rounded-xl h-11"
                disabled={closed}
              />
            </Field>

            <Field label="Endereço da campanha" hint={isEdit || campaignId ? "O endereço não pode ser alterado depois de criada." : "Parte final do link que os colaboradores acessam. Só letras minúsculas, números e hífens."}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">/campanhas/</span>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value), slugTouched: true }))}
                  readOnly={isEdit || !!campaignId}
                  className="rounded-xl h-11 font-mono text-sm"
                  maxLength={60}
                />
              </div>
            </Field>

            <Field label="Descrição" hint="Aparece no cartão e no início da campanha. Mínimo de 10 caracteres para publicar.">
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} maxLength={2000} className="rounded-xl" disabled={closed} />
            </Field>
            <Field label="Objetivo">
              <Textarea value={form.objective} onChange={(e) => set("objective", e.target.value)} rows={3} maxLength={1000} className="rounded-xl" disabled={closed} />
            </Field>
            <Field label="Orientações para os participantes" hint="Passo a passo e regras de participação. Uma instrução por linha.">
              <Textarea value={form.instructions} onChange={(e) => set("instructions", e.target.value)} rows={6} maxLength={3000} className="rounded-xl" disabled={closed} />
            </Field>

            <Field label="Imagem de capa" hint="JPG, PNG ou WebP. É reduzida automaticamente antes do envio.">
              <div className="space-y-3">
                {form.coverUrl ? (
                  <div className="relative overflow-hidden rounded-2xl border bg-muted aspect-video max-w-md">
                    <img src={form.coverUrl} alt="Capa da campanha" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label="Remover capa"
                      onClick={() => { setForm((f) => ({ ...f, coverPath: null, coverUrl: null })); }}
                      className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed aspect-video max-w-md flex flex-col items-center justify-center text-muted-foreground gap-1 bg-gradient-to-br from-orange-500/10 to-amber-500/10">
                    <ImagePlus size={28} className="opacity-50" />
                    <span className="text-xs">Sem capa — será usado um fundo laranja</span>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickCover(e.target.files?.[0])} />
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => fileRef.current?.click()} disabled={coverBusy || closed}>
                    {coverBusy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                    {form.coverUrl ? "Trocar capa" : "Enviar capa"}
                  </Button>
                  {coverBusy && <Progress value={coverProgress * 100} className="w-32" />}
                </div>
              </div>
            </Field>
          </CardContent>
        </Card>
      )}

      {/* ── 2. Público ── */}
      {step === 1 && (
        <Card className="rounded-3xl border">
          <CardContent className="p-5 space-y-5">
            <div className="space-y-2">
              <SectionLabel>Quem pode participar</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Público da campanha">
                {([
                  ["all", "Todos os colaboradores", "Qualquer pessoa com cadastro concluído."],
                  ["units", "Unidades específicas", "Por exemplo, só a Sede Damasceno."],
                  ["departments", "Departamentos específicos", "Pelo departamento informado no cadastro."],
                  ["users", "Pessoas específicas", "Você escolhe uma a uma (bom para pilotos)."],
                ] as const).map(([mode, title, hint]) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={form.audience.mode === mode}
                    disabled={closed}
                    onClick={() => set("audience", { ...form.audience, mode })}
                    className={cn(
                      "text-left rounded-2xl border p-3 transition-colors",
                      form.audience.mode === mode ? "border-primary bg-primary/10" : "hover:bg-accent",
                    )}
                  >
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">{hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {form.audience.mode === "units" && (
              <div className="space-y-2">
                <SectionLabel>Unidades</SectionLabel>
                {units.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada em Configurações.</p>
                ) : (
                  <div className="divide-y divide-border rounded-2xl border">
                    {units.map((u) => {
                      const on = (form.audience.units ?? []).includes(u);
                      return (
                        <label key={u} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer text-sm">
                          <Checkbox
                            checked={on}
                            onCheckedChange={(v) => {
                              const cur = form.audience.units ?? [];
                              set("audience", { ...form.audience, units: v === true ? [...cur, u] : cur.filter((x) => x !== u) });
                            }}
                            aria-label={u}
                          />
                          {u}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {form.audience.mode === "departments" && (
              <div className="space-y-2">
                <SectionLabel>Departamentos</SectionLabel>
                <div className="flex gap-2">
                  <Input
                    value={deptDraft}
                    onChange={(e) => setDeptDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDepartment(); } }}
                    placeholder="Digite o departamento e pressione Enter"
                    className="rounded-xl h-10"
                    aria-label="Adicionar departamento"
                  />
                  <Button type="button" variant="outline" className="rounded-xl h-10" onClick={addDepartment}>Adicionar</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(form.audience.departments ?? []).map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-xs">
                      {d}
                      <button type="button" aria-label={`Remover ${d}`} onClick={() => set("audience", { ...form.audience, departments: (form.audience.departments ?? []).filter((x) => x !== d) })}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">O departamento é o texto informado pela própria pessoa no cadastro — use grafias iguais às dele.</p>
              </div>
            )}

            {form.audience.mode === "users" && (
              <div className="space-y-2">
                <SectionLabel>Pessoas ({form.users.length} selecionadas)</SectionLabel>
                {usersLoading ? (
                  <LoadingBox label="Carregando pessoas..." />
                ) : usersError ? (
                  <Notice tone="warn">{usersError}</Notice>
                ) : (
                  <>
                    <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Buscar pelo nome ou departamento" className="rounded-xl h-10" aria-label="Buscar pessoa" />
                    <ul className="max-h-72 overflow-y-auto divide-y divide-border rounded-2xl border">
                      {filteredUsers.map((u) => {
                        const on = form.users.includes(u.id);
                        return (
                          <li key={u.id}>
                            <label className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                              <Checkbox checked={on} onCheckedChange={(v) => set("users", v === true ? [...form.users, u.id] : form.users.filter((x) => x !== u.id))} aria-label={u.name} />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium truncate">{u.name}</span>
                                <span className="block text-[11px] text-muted-foreground truncate">{[u.department, u.unit].filter(Boolean).join(" · ") || "—"}</span>
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

            <div className="rounded-2xl bg-muted/50 p-3 text-sm">
              <b>Elegíveis hoje:</b>{" "}
              {eligibleCount === null ? <span className="text-muted-foreground">calculado ao salvar</span> : <span>{eligibleCount} colaborador(es)</span>}
              <p className="text-[11px] text-muted-foreground mt-1">
                Só entram pessoas com cadastro concluído. Unidade e departamento são informados pelo próprio colaborador — servem como filtro, não como barreira de segurança.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 3. Funcionalidades ── */}
      {step === 2 && (
        <div className="space-y-5">
          <Card className="rounded-3xl border">
            <CardContent className="p-5 space-y-3">
              <SectionLabel>Funcionalidades</SectionLabel>
              <div className="divide-y divide-border rounded-2xl border">
                {FEATURE_ROWS.map((r) => {
                  const parents = PARENTS[r.key] ?? [];
                  return (
                    <ToggleRow
                      key={r.key}
                      title={r.label}
                      hint={`${r.hint}${parents.length ? ` Requer: ${parents.map((p) => FEATURE_LABEL[p]).join(", ")}.` : ""}`}
                      checked={form.features[r.key]}
                      onChange={(v) => set("features", setFeatureWithDeps(form.features, r.key, v))}
                      disabled={closed}
                    />
                  );
                })}
                <ToggleRow
                  title="Tour de boas-vindas aos colaboradores"
                  hint="Mostra uma tour curta na primeira vez que cada pessoa abre a campanha."
                  checked={form.features.tour.enabled}
                  onChange={(v) => set("features", { ...form.features, tour: { ...form.features.tour, enabled: v } })}
                  disabled={closed}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Ao desligar uma funcionalidade, as que dependem dela são desligadas junto; ao ligar uma, as que ela exige são ligadas.</p>
            </CardContent>
          </Card>

          {(form.features.photos || form.features.video) && (
            <Card className="rounded-3xl border">
              <CardContent className="p-5 space-y-4">
                <SectionLabel>Limites de mídia</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {form.features.photos && (
                    <>
                      <Field label="Fotos complementares (0 a 6)">
                        <Input type="number" min={0} max={6} value={form.limits.max_photos} onChange={(e) => set("limits", { ...form.limits, max_photos: clamp(parseInt(e.target.value || "0", 10), 0, 6) })} className="rounded-xl h-10" />
                      </Field>
                      <Field label="Tamanho máx. por foto (MB, 1 a 5)">
                        <Input type="number" min={1} max={5} value={form.limits.max_photo_mb} onChange={(e) => set("limits", { ...form.limits, max_photo_mb: clamp(parseInt(e.target.value || "1", 10), 1, 5) })} className="rounded-xl h-10" />
                      </Field>
                    </>
                  )}
                  {form.features.video && (
                    <Field label="Tamanho máx. do vídeo (MB, 1 a 50)">
                      <Input type="number" min={1} max={50} value={form.limits.max_video_mb} onChange={(e) => set("limits", { ...form.limits, max_video_mb: clamp(parseInt(e.target.value || "1", 10), 1, 50) })} className="rounded-xl h-10" />
                    </Field>
                  )}
                </div>
                <div className="divide-y divide-border rounded-2xl border">
                  {form.features.video && (
                    <ToggleRow title="Permitir vídeo" hint="Desligue para aceitar só fotos." checked={form.limits.allow_video} onChange={(v) => set("limits", { ...form.limits, allow_video: v })} />
                  )}
                  {form.features.photos && (
                    <ToggleRow title="Foto principal obrigatória" hint="Sem ela, a receita não pode ser enviada." checked={form.limits.require_main_photo} onChange={(v) => set("limits", { ...form.limits, require_main_photo: v })} />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-3xl border">
            <CardContent className="p-5 space-y-4">
              <SectionLabel>Visibilidade</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {form.features.ranking && (
                  <Field label="Quando o ranking aparece">
                    <Select value={form.visibility.ranking_mode} onValueChange={(v) => set("visibility", { ...form.visibility, ranking_mode: v as Visibility["ranking_mode"] })}>
                      <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hidden_until_confirmed">Só após confirmar o vencedor</SelectItem>
                        <SelectItem value="after_close">Após encerrar a votação</SelectItem>
                        <SelectItem value="live">Ao vivo, durante a votação</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {form.features.gallery && (
                  <Field label="Quando a galeria aparece">
                    <Select value={form.visibility.gallery_visibility} onValueChange={(v) => set("visibility", { ...form.visibility, gallery_visibility: v as Visibility["gallery_visibility"] })}>
                      <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on_approval">Assim que a receita é aprovada</SelectItem>
                        <SelectItem value="on_voting_start">Quando a votação começa</SelectItem>
                        <SelectItem value="on_results">Quando o resultado é divulgado</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>
              <div className="divide-y divide-border rounded-2xl border">
                {form.features.results && (
                  <ToggleRow title="Mostrar pódio na divulgação" hint="Exibe também o 2º e o 3º lugares." checked={form.visibility.show_podium} onChange={(v) => set("visibility", { ...form.visibility, show_podium: v })} />
                )}
                <ToggleRow title="Consulta antecipada" hint='Antes do início, os colaboradores veem a campanha como "Em breve".' checked={form.visibility.allow_preview} onChange={(v) => set("visibility", { ...form.visibility, allow_preview: v })} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border bg-muted/40" data-tutorial="camp-wiz-rules">
            <CardContent className="p-5 space-y-3">
              <p className="flex items-center gap-2 text-sm font-bold"><Lock size={15} /> Regras protegidas</p>
              <p className="text-[12px] text-muted-foreground">Valem para toda campanha e são garantidas pelo banco de dados. Não podem ser desligadas.</p>
              <ul className="space-y-1.5">
                {PROTECTED_RULES.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-[13px]">
                    <Lock size={12} className="mt-1 shrink-0 text-muted-foreground" /> <span>{r}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 4. Calendário ── */}
      {step === 3 && (
        <Card className="rounded-3xl border">
          <CardContent className="p-5 space-y-5">
            <p className="text-sm text-muted-foreground">Datas e horários no fuso de Brasília. Etapas sem data ficam "em breve" até você definir.</p>
            {locked && (
              <Notice tone="warn" title="A votação já começou">
                As datas das inscrições e o início da votação não podem mais ser alterados. Para estender prazos, use a aba Calendário da campanha.
              </Notice>
            )}
            {STAGE_KEYS.filter((k) => {
              if (k === "registration") return form.features.submission;
              if (k === "voting") return form.features.voting;
              if (k === "results") return form.features.voting;
              return form.features.announcement;
            }).map((k) => {
              const lockedStage = locked && (k === "registration" || k === "voting");
              return (
                <div key={k} className="space-y-2 rounded-2xl border p-4">
                  <div>
                    <p className="text-sm font-semibold">{STAGE_LABEL[k]}</p>
                    <p className="text-[11px] text-muted-foreground">{STAGE_HINT[k]}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Início">
                      <Input type="datetime-local" value={form.stages[k].starts} onChange={(e) => set("stages", { ...form.stages, [k]: { ...form.stages[k], starts: e.target.value } })} className="rounded-xl h-10" disabled={lockedStage || closed} />
                    </Field>
                    <Field label="Fim">
                      <Input type="datetime-local" value={form.stages[k].ends} onChange={(e) => set("stages", { ...form.stages, [k]: { ...form.stages[k], ends: e.target.value } })} className="rounded-xl h-10" disabled={(locked && k === "registration") || closed} />
                    </Field>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── 5. Revisão ── */}
      {step === 4 && (
        <div className="space-y-5">
          <Card className="rounded-3xl border">
            <CardContent className="p-5 space-y-4">
              <SectionLabel>Resumo</SectionLabel>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><dt className="text-[11px] text-muted-foreground">Nome</dt><dd className="font-medium">{form.name || "—"}</dd></div>
                <div><dt className="text-[11px] text-muted-foreground">Endereço</dt><dd className="font-mono text-[13px]">/campanhas/{form.slug || "—"}</dd></div>
                <div><dt className="text-[11px] text-muted-foreground">Público</dt><dd>{audienceSummary}</dd></div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Funcionalidades</dt>
                  <dd>{FEATURE_ROWS.filter((r) => form.features[r.key]).map((r) => r.label).join(", ") || "Nenhuma"}</dd>
                </div>
                {STAGE_KEYS.filter((k) => form.stages[k].starts || form.stages[k].ends).map((k) => (
                  <div key={k}>
                    <dt className="text-[11px] text-muted-foreground">{STAGE_LABEL[k]}</dt>
                    <dd>{form.stages[k].starts ? form.stages[k].starts.replace("T", " ") : "—"} → {form.stages[k].ends ? form.stages[k].ends.replace("T", " ") : "—"}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border">
            <CardContent className="p-5 space-y-3">
              <SectionLabel>Prontidão para publicar</SectionLabel>
              <ul className="space-y-2">
                {hints.map((h) => (
                  <li key={h.text} className="flex items-start gap-2 text-sm">
                    {h.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600 dark:text-green-400" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />}
                    <span className={cn(!h.ok && "text-muted-foreground")}>{h.text}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">Esses itens não impedem salvar o rascunho; apenas o botão Publicar exige tudo em ordem.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rodapé de navegação */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <Button variant="outline" className="gap-2 rounded-xl" disabled={step === 0 || saving} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          <ArrowLeft size={14} /> Voltar
        </Button>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant={last ? "primary" : "outline"} className="gap-2 rounded-xl" onClick={save} disabled={saving || closed}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit && !(snap?.status === "draft" || snap?.status === "in_review") ? "Salvar alterações" : "Salvar rascunho"}
          </Button>
          {!last && (
            <Button className="gap-2 rounded-xl" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={saving}>
              Próximo <ArrowRight size={14} />
            </Button>
          )}
        </div>
      </div>

      <CampaignTour steps={ADMIN_TOUR_WIZARD} tour={tour} />
    </div>
  );
}
