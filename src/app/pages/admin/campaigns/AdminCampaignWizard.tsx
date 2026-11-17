import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, ChevronDown, ImagePlus, Loader2, Megaphone, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Checkbox } from "../../../components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../components/ui/collapsible";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Progress } from "../../../components/ui/progress";
import { Switch } from "../../../components/ui/switch";
import { Textarea } from "../../../components/ui/textarea";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../context/auth-context";
import { CampaignApiError, campaignsApi, errMsg, uploadToSignedUrl } from "../../../lib/campaigns/api";
import { BANNER_MIN_SOURCE_WIDTH, cropToBanner } from "../../../lib/campaigns/banner";
import { fromInputValue, toInputValue } from "../../../lib/campaigns/format";
import type { AdminCampaign, AdminCampaignDetail, Audience, Features, MediaLimits, Visibility } from "../../../lib/campaigns/types";
import { CampaignTour, TourButton, tourKey, useTour } from "../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_WIZARD } from "../../../lib/campaigns/tours-admin";
import { useCampaignPerms } from "./useCampaignPerms";
import { ErrorBox, LoadingBox, Notice, RestrictedBox, SectionLabel, useBusy, useLoader } from "./shared";

// ─────────────────────────────── Modelo simples ───────────────────────────────
// O formulário só pergunta o essencial. O resto vai com valores fixos (o colaborador envia 1 foto, sem vídeo;
// toda receita passa por aprovação; ranking/resultado/divulgação só existem quando há votação).

const SIMPLE_MEDIA_LIMITS: MediaLimits = { max_photos: 0, max_photo_mb: 5, allow_video: false, max_video_mb: 1, require_main_photo: true };
const SIMPLE_VISIBILITY: Visibility = { ranking_mode: "hidden_until_confirmed", gallery_visibility: "on_approval", show_podium: false, allow_preview: false };

/** `tour` entra só com `enabled`: o servidor mescla e preserva a versão da tour. */
const simpleFeatures = (hasVoting: boolean) => ({
  submission: true, photos: true, video: false, approval: true, gallery: true,
  voting: hasVoting, ranking: hasVoting, results: hasVoting, announcement: hasVoting,
  tour: { enabled: true },
}) as unknown as Features;

type Form = {
  name: string;
  description: string;
  instructions: string;
  coverPath: string | null;
  coverUrl: string | null;
  hasVoting: boolean;
  start: string; // yyyy-MM-dd
  end: string; // yyyy-MM-dd
  audienceMode: "all" | "users";
  users: string[];
};
type Snapshot = {
  version: number;
  status: string;
  startsIso: string | null;
  endsIso: string | null;
  audienceKey: string;
  /** Campanha antiga filtrada por unidade/departamento: o modo é mantido como está. */
  legacyAudience: Audience | null;
};
type SiteUser = { id: string; name: string; department: string; unit: string };

const initialForm = (): Form => ({
  name: "", description: "", instructions: "", coverPath: null, coverUrl: null,
  hasVoting: false, start: "", end: "", audienceMode: "all", users: [],
});

const dateOf = (iso: string | null | undefined) => (iso ? toInputValue(iso).slice(0, 10) : "");
const startIso = (d: string) => fromInputValue(d ? `${d}T00:00` : "");
const endIso = (d: string) => fromInputValue(d ? `${d}T23:59:59` : "");

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

/** Prévia da capa nas duas proporções do banner da Home (celular 2:1, computador 3,5:1), com o mesmo recorte `object-cover`. */
function BannerPreview({ url, title }: { url: string | null; title: string }) {
  const box = (cls: string, label: string, extra?: string) => (
    <div className={cn("space-y-1.5", extra)}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className={cn("relative w-full overflow-hidden rounded-3xl border bg-gradient-to-br from-orange-500 to-amber-500", cls)}>
        {url ? (
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm font-bold text-white">{title.trim() || "Nome da campanha"}</span>
        )}
      </div>
    </div>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-end" aria-label="Como a capa aparece no banner da Home">
      {box("aspect-[2/1]", "No celular")}
      {box("aspect-[3.5/1]", "No computador")}
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
    const reg = d.stages.find((s) => s.stage_key === "registration");
    const audience: Audience = c.audience ?? { mode: "all" };
    const legacy = audience.mode === "units" || audience.mode === "departments" ? audience : null;
    const mode: Form["audienceMode"] = audience.mode === "users" ? "users" : "all";
    const users = d.eligible_user_ids ?? [];
    setForm({
      name: c.name, description: c.description ?? "", instructions: c.instructions ?? "",
      coverPath: c.cover_path, coverUrl: c.cover_url,
      hasVoting: !!c.features?.voting,
      start: dateOf(reg?.starts_at), end: dateOf(reg?.ends_at),
      audienceMode: mode, users,
    });
    setSnap({
      version: c.version, status: c.status,
      startsIso: reg?.starts_at ?? null, endsIso: reg?.ends_at ?? null,
      audienceKey: JSON.stringify({ m: mode, u: [...users].sort() }),
      legacyAudience: legacy,
    });
    setDetailsOpen(!!(c.instructions ?? "").trim());
    setConflict(false);
    campaignsApi.get<{ eligible: number }>(`/admin/campaigns/${c.id}/dashboard`).then((r) => setEligibleCount(r.eligible)).catch(() => {});
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

  // ── Capa: recorta na proporção do banner da Home e envia ──
  const pickCover = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use uma imagem JPG, PNG ou WebP.");
      return;
    }
    setCoverBusy(true);
    setCoverProgress(0);
    try {
      const { file: banner, srcWidth } = await cropToBanner(file);
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
  const validate = (): string | null => {
    const name = form.name.trim();
    if (name.length < 3 || name.length > 120) return "Informe um nome com 3 a 120 caracteres.";
    if (!!form.start !== !!form.end) return "Informe o início e o encerramento (ou deixe os dois em branco por enquanto).";
    const s = startIso(form.start);
    const e = endIso(form.end);
    if (form.start && form.end && (!s || !e || new Date(e) <= new Date(s))) return "O encerramento precisa ser depois do início.";
    if (form.audienceMode === "users" && form.users.length === 0) return "Escolha pelo menos uma pessoa ou volte para \"Todos\".";
    return null;
  };

  // ── Salvar ──
  const save = async () => {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
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
            features: simpleFeatures(form.hasVoting), media_limits: SIMPLE_MEDIA_LIMITS, visibility: SIMPLE_VISIBILITY,
            audience: { mode: form.audienceMode },
          });
          cid = created.id;
        } else {
          phase = "salvar os dados";
          const body: Record<string, unknown> = {
            name: form.name.trim(), description: form.description.trim(), instructions: form.instructions.trim(),
            cover_path: form.coverPath, version: snap?.version,
          };
          // Rascunho: normaliza para o modelo simples (inclui o rascunho antigo). Publicada: o servidor trava funcionalidades.
          if (!snap || snap.status === "draft" || snap.status === "in_review") {
            body.features = simpleFeatures(form.hasVoting);
            body.media_limits = SIMPLE_MEDIA_LIMITS;
            body.visibility = SIMPLE_VISIBILITY;
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

      // Período (início e encerramento valem para participação e votação)
      phase = "salvar o período";
      try {
        const s = startIso(form.start);
        const e = endIso(form.end);
        if (s && e && (!isEdit || snap?.startsIso !== s || snap?.endsIso !== e)) {
          await campaignsApi.put(`/admin/campaigns/${cid}/period`, { starts_at: s, ends_at: e });
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
            <SectionLabel>Capa</SectionLabel>
            <p className="mt-1 text-[12px] text-muted-foreground">Esta imagem também é o banner da Home — não precisa cadastrar outra.</p>
          </div>
          <BannerPreview url={form.coverUrl} title={form.name} />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickCover(e.target.files?.[0])} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => fileRef.current?.click()} disabled={coverBusy || closed}>
              {coverBusy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
              {form.coverUrl ? "Trocar imagem" : "Enviar imagem"}
            </Button>
            {form.coverUrl && !coverBusy && !closed && (
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 rounded-xl text-muted-foreground" onClick={() => setForm((f) => ({ ...f, coverPath: null, coverUrl: null }))}>
                <X size={13} /> Remover
              </Button>
            )}
            {coverBusy && <Progress value={coverProgress * 100} className="w-32" />}
          </div>
          <p className="text-[11px] text-muted-foreground">
            JPG, PNG ou WebP. A imagem é cortada ao centro na proporção do banner (3:1) e reduzida automaticamente. Sem imagem, o banner usa o fundo laranja com o nome da campanha.
          </p>
        </CardContent>
      </Card>

      {/* Votação */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-wiz-voting">
        <CardContent className="p-5">
          <label className={cn("flex items-center justify-between gap-4", published || closed ? "opacity-70" : "cursor-pointer")}>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Esta campanha tem votação?</span>
              <span className="mt-0.5 block text-[12px] text-muted-foreground">
                {form.hasVoting
                  ? "Os colaboradores votam nas receitas aprovadas. Cada pessoa tem um voto."
                  : "Sem votação: a campanha só recebe participações."}
              </span>
              {published && <span className="mt-1 block text-[11px] text-muted-foreground">Não dá para mudar depois de publicada.</span>}
            </span>
            <Switch
              checked={form.hasVoting}
              onCheckedChange={(v) => set("hasVoting", v)}
              disabled={published || closed}
              aria-label="Esta campanha tem votação"
            />
          </label>
        </CardContent>
      </Card>

      {/* Período */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-wiz-period">
        <CardContent className="space-y-3 p-5">
          <SectionLabel>Período</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início">
              <Input type="date" value={form.start} onChange={(e) => set("start", e.target.value)} className="h-11 rounded-xl" disabled={closed} aria-label="Data de início" />
            </Field>
            <Field label="Encerramento">
              <Input type="date" value={form.end} min={form.start || undefined} onChange={(e) => set("end", e.target.value)} className="h-11 rounded-xl" disabled={closed} aria-label="Data de encerramento" />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {form.hasVoting ? "A participação e a votação abrem no início e fecham sozinhas no encerramento." : "A participação abre no início e fecha sozinha no encerramento."}
            {" "}Horário de Brasília (do início às 00:00 até o fim do dia do encerramento).
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

      <CampaignTour steps={ADMIN_TOUR_WIZARD} tour={tour} />
    </div>
  );
}
