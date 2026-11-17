import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  CheckCircle2, ChevronDown, ChevronUp, Copy, EyeOff, History as HistoryIcon, Loader2, Megaphone, MoreHorizontal,
  Pencil, Plus, Power, RotateCcw, Rocket, Search, Settings2, ShieldCheck,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/input";
import { Switch } from "../../../components/ui/switch";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../context/auth-context";
import { campaignsApi } from "../../../lib/campaigns/api";
import {
  AUDIT_ACTION, DISPLAY_STATE, PHASE_STATE, campaignDisplayState, fmtDateTime, fmtShort, plural,
} from "../../../lib/campaigns/format";
import type { DisplayState } from "../../../lib/campaigns/format";
import type { AdminCampaignListItem, AdminOverview, AdminStageRow, PublishCheck } from "../../../lib/campaigns/types";
import { CampaignTour, TourButton, tourKey, useTour } from "../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_OVERVIEW } from "../../../lib/campaigns/tours-admin";
import { useCampaignPerms } from "./useCampaignPerms";
import { AccessTab } from "./tabs/AccessTab";
import { DuplicateDialog } from "./DuplicateDialog";
import { PublishDialog } from "./PublishDialog";
import { ErrorBox, LoadingBox, ReasonDialog, RestrictedBox, stageState, useBusy, useLoader } from "./shared";

// ───────────────────────────── Filtros por situação ─────────────────────────────

type FilterKey = "all" | "draft" | "published" | "unpublished" | "closed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "draft", label: "Rascunhos" },
  { key: "published", label: "Publicadas" },
  { key: "unpublished", label: "Não publicadas" },
  { key: "closed", label: "Encerradas" },
];

/** Cada situação pertence a um filtro; "Todas" esconde as arquivadas (só aparecem em "Encerradas"). */
function matchesFilter(f: FilterKey, s: DisplayState): boolean {
  switch (f) {
    case "all": return s !== "archived";
    case "draft": return s === "draft";
    case "published": return s === "published" || s === "scheduled";
    case "unpublished": return s === "unpublished";
    case "closed": return s === "closed" || s === "archived";
  }
}

// ──────────────────────────── "O que falta" (rascunho) ────────────────────────────

const MISSING_WORDS: Record<string, string> = {
  basics: "nome e descrição",
  features: "formulário de participação",
  dependencies: "funcionalidades compatíveis",
  registration_dates: "datas das inscrições",
  voting_dates: "datas da votação",
  audience: "público",
};

/** Resume os itens pendentes do checklist de publicação em uma frase curta. */
function missingText(check: PublishCheck): string {
  const words = check.items.filter((i) => !i.ok).map((i) => MISSING_WORDS[i.key] ?? i.message);
  if (words.length === 0) return "";
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} e ${words[words.length - 1]}`;
  return `Faltam: ${list}`;
}

// ─────────────────────────────────── Cartão ───────────────────────────────────

function PhaseLine({ label, stage }: { label: string; stage?: AdminStageRow }) {
  const p = PHASE_STATE[stageState(stage)];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <b className="text-foreground/80">{label}</b>
      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", p.className)}>{p.label}</span>
      {stage?.starts_at && (
        <span>{fmtShort(stage.starts_at)} → {fmtShort(stage.ends_at)}</span>
      )}
    </span>
  );
}

type CardProps = {
  c: AdminCampaignListItem;
  moduleEnabled: boolean | null;
  /** undefined = ainda verificando; null = indisponível (sem permissão/erro) */
  check: PublishCheck | null | undefined;
  canEdit: boolean;
  canPublish: boolean;
  canDuplicate: boolean;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onHistory: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onRepublish: () => void;
  onDuplicate: () => void;
};

function CampaignListCard(p: CardProps) {
  const { c } = p;
  const state = campaignDisplayState(c);
  const st = DISPLAY_STATE[state];
  const editable = state !== "closed" && state !== "archived";
  const stage = (k: "registration" | "voting") => c.stages.find((s) => s.stage_key === k);

  // Frase única de "situação / o que falta"
  let hint: { tone: "ok" | "warn" | "muted"; text: React.ReactNode } = { tone: "muted", text: st.hint };
  if (state === "draft") {
    if (p.check === undefined && p.canEdit) hint = { tone: "muted", text: "Verificando o que falta para publicar…" };
    else if (p.check && p.check.ok) hint = { tone: "ok", text: "Pronta para publicar" };
    else if (p.check) hint = { tone: "warn", text: missingText(p.check) };
  } else if (state === "scheduled") {
    hint = { tone: "muted", text: `Vai aparecer para os colaboradores em ${fmtDateTime(c.visible_from)}.` };
  } else if (state === "unpublished") {
    hint = { tone: "warn", text: "Retirada de exibição. Tudo continua salvo — republique quando quiser." };
  }
  const moduleOff = (state === "published" || state === "scheduled") && p.moduleEnabled === false;

  const main: { label: string; icon: React.ReactNode; onClick: () => void } | null =
    !p.canPublish ? null
      : state === "draft" ? { label: "Publicar", icon: <Rocket size={14} />, onClick: p.onPublish }
      : state === "published" || state === "scheduled" ? { label: "Despublicar", icon: <EyeOff size={14} />, onClick: p.onUnpublish }
      : state === "unpublished" ? { label: "Republicar", icon: <RotateCcw size={14} />, onClick: p.onRepublish }
      : null;
  // O botão de maior destaque é a ação que faz a campanha avançar; senão, Gerenciar.
  const mainIsPrimary = main !== null && (state === "draft" || state === "unpublished");

  return (
    <Card className="rounded-3xl border">
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              className="text-left font-bold text-base text-foreground hover:text-primary transition-colors break-words"
              onClick={p.onOpen}
            >
              {c.name}
            </button>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5 break-all">/campanhas/{c.slug}</p>
          </div>
          <Badge className={cn("border text-xs font-bold px-3 py-1 gap-1.5 shrink-0", st.className)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {st.label}
          </Badge>
        </div>

        <p
          className={cn(
            "text-sm flex items-start gap-1.5",
            hint.tone === "ok" && "text-green-700 dark:text-green-300 font-medium",
            hint.tone === "warn" && "text-amber-700 dark:text-amber-300 font-medium",
            hint.tone === "muted" && "text-muted-foreground",
          )}
        >
          {hint.tone === "ok" && <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          <span>{hint.text}</span>
        </p>
        {moduleOff && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            O módulo de campanhas está desligado: ninguém vê esta campanha até você ligá-lo.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <PhaseLine label="Inscrições" stage={stage("registration")} />
          <PhaseLine label="Votação" stage={stage("voting")} />
          <span className="text-xs text-muted-foreground">
            <b className="text-foreground/80">Receitas</b> {plural(c.submissions, "enviada", "enviadas")}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {mainIsPrimary && main && (
            <Button className="h-10 gap-1.5 rounded-xl" size="sm" onClick={main.onClick} disabled={p.busy}>
              {main.icon} {main.label}
            </Button>
          )}
          <Button
            className="h-10 gap-1.5 rounded-xl"
            size="sm"
            variant={mainIsPrimary ? "outline" : "primary"}
            onClick={p.onOpen}
          >
            <Settings2 size={13} /> Gerenciar
          </Button>
          {p.canEdit && editable && (
            <Button className="h-10 gap-1.5 rounded-xl" size="sm" variant="outline" onClick={p.onEdit}>
              <Pencil size={13} /> Editar
            </Button>
          )}
          {!mainIsPrimary && main && (
            <Button className="h-10 gap-1.5 rounded-xl" size="sm" variant="outline" onClick={main.onClick} disabled={p.busy}>
              {main.icon} {main.label}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-10 w-10 rounded-xl" size="icon" variant="ghost" aria-label={`Mais ações de ${c.name}`}>
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {p.canDuplicate && (
                <DropdownMenuItem onSelect={p.onDuplicate} className="gap-2 cursor-pointer">
                  <Copy size={14} /> Duplicar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={p.onHistory} className="gap-2 cursor-pointer">
                <HistoryIcon size={14} /> Histórico
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────── Página ───────────────────────────────────

export function AdminCampaigns() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { perms, loading: permsLoading, isAdmin } = useCampaignPerms();

  const overview = useLoader<AdminOverview>(() => campaignsApi.get("/admin/overview"), []);
  const list = useLoader<AdminCampaignListItem[]>(() => campaignsApi.get("/admin/campaigns"), []);
  // A tour só começa quando os alvos já estão na tela (senão os passos seriam pulados).
  const tour = useTour({
    storageKey: tourKey("admin", user?.id, "overview"),
    enabled: !permsLoading && isAdmin && !!overview.data && !!list.data,
  });
  const { busy, run } = useBusy();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [moduleTarget, setModuleTarget] = useState<boolean | null>(null);
  const [dupTarget, setDupTarget] = useState<AdminCampaignListItem | null>(null);
  const [publishTarget, setPublishTarget] = useState<AdminCampaignListItem | null>(null);
  const [unpublishTarget, setUnpublishTarget] = useState<AdminCampaignListItem | null>(null);
  const [republishTarget, setRepublishTarget] = useState<AdminCampaignListItem | null>(null);

  // "O que falta": mesmo checklist do diálogo Publicar, buscado só para rascunhos, uma vez a cada carga.
  const [checks, setChecks] = useState<Record<string, PublishCheck | null>>({});
  const canEdit = !!perms.campaigns_edit;
  useEffect(() => {
    const drafts = (list.data ?? []).filter((c) => campaignDisplayState(c) === "draft");
    setChecks({});
    if (!canEdit || drafts.length === 0) return;
    let cancelled = false;
    Promise.all(
      drafts.map((c) =>
        campaignsApi
          .get<PublishCheck>(`/admin/campaigns/${c.id}/publish-check`)
          .then((r) => [c.id, r] as const)
          .catch(() => [c.id, null] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setChecks(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [list.data, canEdit]);

  const counts = useMemo(() => {
    const out: Record<FilterKey, number> = { all: 0, draft: 0, published: 0, unpublished: 0, closed: 0 };
    for (const c of list.data ?? []) {
      const s = campaignDisplayState(c);
      (Object.keys(out) as FilterKey[]).forEach((k) => { if (matchesFilter(k, s)) out[k]++; });
    }
    return out;
  }, [list.data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter(
      (c) => matchesFilter(filter, campaignDisplayState(c)) && (!q || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)),
    );
  }, [list.data, filter, search]);

  const reloadAll = () => { list.reload(); overview.reload(); };

  const toggleModule = async () => {
    const next = moduleTarget;
    setModuleTarget(null);
    if (next === null) return;
    const r = await run("module", () => campaignsApi.put<{ enabled: boolean }>("/admin/module", { enabled: next }),
      next ? "Módulo ligado." : "Módulo desligado.");
    if (r.ok) overview.setData((o) => (o ? { ...o, enabled: r.value.enabled } : o));
  };

  const doUnpublish = async (reason: string) => {
    const target = unpublishTarget;
    if (!target) return;
    const r = await run("unpublish", () => campaignsApi.post(`/admin/campaigns/${target.id}/suspend`, { reason: reason || null }),
      "Campanha despublicada: os colaboradores não a veem mais. Nada foi apagado.");
    if (r.ok) { setUnpublishTarget(null); reloadAll(); }
  };

  const doRepublish = async () => {
    const target = republishTarget;
    setRepublishTarget(null);
    if (!target) return;
    const r = await run("republish", () => campaignsApi.post(`/admin/campaigns/${target.id}/resume`),
      "Campanha republicada: voltou a aparecer para os colaboradores.");
    if (r.ok) reloadAll();
  };

  if (permsLoading) return <LoadingBox />;
  if (!isAdmin) return <RestrictedBox />;

  const moduleEnabled = overview.data ? overview.data.enabled : null;
  const total = (list.data ?? []).length;
  const unpublishOpenStages =
    unpublishTarget &&
    ["registration", "voting"].some((k) => stageState(unpublishTarget.stages.find((s) => s.stage_key === k)) === "open");
  const recent = overview.data?.recent.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone size={24} className="text-primary" />
            Campanhas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie e acompanhe campanhas internas, como o concurso de receitas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TourButton onClick={tour.start} />
          {perms.campaigns_create && (
            <Button data-tutorial="camp-new" className="gap-2 rounded-xl" onClick={() => navigate("/admin/campaigns/new")}>
              <Plus size={16} /> Nova campanha
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="campanhas" className="gap-4">
        {perms.campaigns_access && (
          <TabsList className="h-10 w-full sm:w-fit">
            <TabsTrigger value="campanhas" className="px-4"><Megaphone size={14} /> Campanhas</TabsTrigger>
            <TabsTrigger value="acesso" className="px-4"><ShieldCheck size={14} /> Acesso</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="campanhas" className="space-y-5">
          {/* Chave do módulo — uma linha */}
          {overview.data ? (
            <div
              data-tutorial="camp-module-switch"
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-4 py-3",
                moduleEnabled
                  ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
                  : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
              )}
            >
              <Power
                size={18}
                className={cn("shrink-0", moduleEnabled ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300")}
                aria-hidden="true"
              />
              <p className={cn("min-w-0 flex-1 text-[13px] leading-snug", moduleEnabled ? "text-green-800 dark:text-green-200" : "text-amber-800 dark:text-amber-200")}>
                {moduleEnabled ? (
                  <><b>Módulo ligado</b> — colaboradores veem as campanhas publicadas.</>
                ) : (
                  <><b>Módulo desligado</b> — nenhum colaborador vê o menu nem as campanhas, mesmo as publicadas.</>
                )}
              </p>
              {busy === "module" ? (
                <Loader2 size={18} className="animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  checked={!!moduleEnabled}
                  disabled={!perms.campaigns_publish || busy !== null}
                  onCheckedChange={(v) => setModuleTarget(v)}
                  aria-label="Ligar ou desligar o módulo de campanhas"
                />
              )}
            </div>
          ) : overview.error ? (
            <div data-tutorial="camp-module-switch" className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
              <span>Não foi possível verificar se o módulo está ligado.</span>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={overview.reload}>Tentar de novo</Button>
            </div>
          ) : (
            <div data-tutorial="camp-module-switch" className="flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Verificando o módulo…
            </div>
          )}

          {/* Filtros por situação, com contagem */}
          <div data-tutorial="camp-kpis" className="flex flex-wrap gap-2" role="group" aria-label="Filtrar campanhas por situação">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      "min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums",
                      active ? "bg-primary-foreground/20 text-primary-foreground" : counts[f.key] > 0 ? "bg-muted text-foreground" : "bg-muted text-muted-foreground/60",
                    )}
                  >
                    {list.data ? counts[f.key] : "–"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Lista */}
          <div data-tutorial="camp-list" className="space-y-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou endereço"
                className="pl-9 rounded-xl h-10"
                aria-label="Buscar campanha"
              />
            </div>

            {list.loading && !list.data ? (
              <LoadingBox />
            ) : list.error && !list.data ? (
              <ErrorBox message={list.error} onRetry={list.reload} />
            ) : total === 0 ? (
              <Card className="rounded-3xl border-dashed">
                <CardContent className="p-10 text-center">
                  <Megaphone size={36} className="mx-auto mb-3 text-muted-foreground opacity-40" />
                  <p className="font-medium text-foreground">Ainda não há campanhas.</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                    O assistente leva você passo a passo (identidade, público, funcionalidades e datas) e salva como
                    rascunho: ninguém além da gestão vê a campanha até você publicar.
                  </p>
                  {perms.campaigns_create && (
                    <Button className="mt-5 gap-2 rounded-xl" onClick={() => navigate("/admin/campaigns/new")}>
                      <Plus size={16} /> Nova campanha
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : rows.length === 0 ? (
              <Card className="rounded-3xl border-dashed">
                <CardContent className="p-10 text-center">
                  <Search size={32} className="mx-auto mb-3 text-muted-foreground opacity-40" />
                  <p className="font-medium text-muted-foreground">Nenhuma campanha encontrada com esses filtros.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-xl"
                    onClick={() => { setFilter("all"); setSearch(""); }}
                  >
                    Limpar filtros
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {rows.map((c) => (
                  <CampaignListCard
                    key={c.id}
                    c={c}
                    moduleEnabled={moduleEnabled}
                    check={checks[c.id]}
                    canEdit={canEdit}
                    canPublish={!!perms.campaigns_publish}
                    canDuplicate={!!perms.campaigns_duplicate}
                    busy={busy !== null}
                    onOpen={() => navigate(`/admin/campaigns/${c.id}`)}
                    onEdit={() => navigate(`/admin/campaigns/${c.id}/edit`)}
                    onHistory={() => navigate(`/admin/campaigns/${c.id}?tab=settings&section=history`)}
                    onPublish={() => setPublishTarget(c)}
                    onUnpublish={() => setUnpublishTarget(c)}
                    onRepublish={() => setRepublishTarget(c)}
                    onDuplicate={() => setDupTarget(c)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Atividade recente — compacta, recolhida por padrão */}
          {recent.length > 0 && (
            <Card className="rounded-3xl border">
              <CardContent className="p-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                  aria-expanded={showActivity}
                  onClick={() => setShowActivity((v) => !v)}
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Atividade recente
                  </span>
                  {showActivity ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                </button>
                {showActivity && (
                  <ul className="divide-y divide-border px-5 pb-3">
                    {recent.map((r, i) => {
                      const body = (
                        <>
                          <span className="min-w-0 truncate">
                            <b className="font-medium">{AUDIT_ACTION[r.action] ?? r.action}</b>
                            <span className="text-muted-foreground"> · {r.actor_name || "Sistema"}</span>
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDateTime(r.occurred_at)}</span>
                        </>
                      );
                      return (
                        <li key={`${r.occurred_at}-${i}`}>
                          {r.campaign_id ? (
                            <button
                              type="button"
                              className="flex min-h-10 w-full items-center justify-between gap-3 py-2 text-left text-sm hover:text-primary transition-colors"
                              onClick={() => navigate(`/admin/campaigns/${r.campaign_id}`)}
                            >
                              {body}
                            </button>
                          ) : (
                            <div className="flex min-h-10 items-center justify-between gap-3 py-2 text-sm">{body}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {perms.campaigns_access && (
          <TabsContent value="acesso">
            <AccessTab currentUserId={user?.id} />
          </TabsContent>
        )}
      </Tabs>

      <ConfirmDialog
        open={moduleTarget !== null}
        onOpenChange={(o) => !o && setModuleTarget(null)}
        title={moduleTarget ? "Ligar o módulo de campanhas?" : "Desligar o módulo de campanhas?"}
        description={
          moduleTarget
            ? "Colaboradores elegíveis passarão a ver o menu Campanhas se houver campanha publicada para eles."
            : "Nenhum colaborador verá o menu, as campanhas ou a tour. Os dados e as campanhas não são apagados e você pode religar quando quiser."
        }
        confirmLabel={moduleTarget ? "Ligar módulo" : "Desligar módulo"}
        variant={moduleTarget ? "default" : "destructive"}
        onConfirm={toggleModule}
      />

      {publishTarget && (
        <PublishDialog
          campaignId={publishTarget.id}
          campaignName={publishTarget.name}
          open
          onOpenChange={(o) => !o && setPublishTarget(null)}
          onPublished={(r) => {
            reloadAll();
            if (r.module_enabled_now) toast.info("O módulo de campanhas foi ligado ao publicar.");
          }}
        />
      )}

      <ReasonDialog
        open={unpublishTarget !== null}
        onOpenChange={(o) => !o && setUnpublishTarget(null)}
        title="Despublicar a campanha?"
        description={
          "A campanha some para os colaboradores até você republicá-la. Nada é apagado: receitas, votos e histórico continuam salvos." +
          (unpublishOpenStages ? " Enquanto estiver não publicada, ninguém consegue enviar receitas nem votar." : "")
        }
        placeholder="Motivo (opcional)"
        confirmLabel="Despublicar"
        pending={busy === "unpublish"}
        onConfirm={doUnpublish}
      />

      <ConfirmDialog
        open={republishTarget !== null}
        onOpenChange={(o) => !o && setRepublishTarget(null)}
        title="Republicar a campanha?"
        description="Ela volta a aparecer para os colaboradores elegíveis, com tudo o que já estava salvo."
        confirmLabel="Republicar"
        onConfirm={doRepublish}
      />

      {dupTarget && (
        <DuplicateDialog
          open
          onOpenChange={(o) => !o && setDupTarget(null)}
          campaignId={dupTarget.id}
          campaignName={dupTarget.name}
          onDuplicated={(id) => navigate(`/admin/campaigns/${id}`)}
        />
      )}

      <CampaignTour steps={ADMIN_TOUR_OVERVIEW} tour={tour} />
    </div>
  );
}
