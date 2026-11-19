import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  ChevronDown, ChevronUp, LayoutGrid, List as ListIcon, Loader2, Megaphone, MoreHorizontal, Plus, Power, Search, Trash2,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../context/auth-context";
import { campaignsApi } from "../../../lib/campaigns/api";
import { AUDIT_ACTION, campaignDisplayState, fmtDateTime } from "../../../lib/campaigns/format";
import type { DisplayState } from "../../../lib/campaigns/format";
import type { AdminCampaignListItem, AdminOverview, PublishCheck } from "../../../lib/campaigns/types";
import { CampaignTour, TourButton, tourKey, useTour } from "../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_OVERVIEW } from "../../../lib/campaigns/tours-admin";
import { useCampaignPerms } from "./useCampaignPerms";
import { DuplicateDialog } from "./DuplicateDialog";
import { DeletedCampaigns } from "./DeletedCampaigns";
import { PublishDialog } from "./PublishDialog";
import { CampaignListCard, LIST_ROW_GRID } from "./CampaignListCard";
import type { ListView } from "./CampaignListCard";
import { ErrorBox, LoadingBox, ReasonDialog, RestrictedBox, stageState, useBusy, useLoader } from "./shared";
import { SectionNav } from "./SectionNav";

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

// ───────────────────────────── Cartões ou Lista ─────────────────────────────

const VIEW_KEY = "spacefood_campaigns_list_view";

/** Largura de tablet para cima (md = 768 px): lá a Lista vira linhas com colunas. */
function useIsWide(): boolean {
  const query = "(min-width: 768px)";
  const [wide, setWide] = useState(() => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : true));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const on = () => setWide(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return wide;
}

/** Preferência guardada neste aparelho; sem escolha, Cartões em tela pequena e Lista de tablet para cima. */
function useListView(): [ListView, (v: ListView) => void] {
  const wide = useIsWide();
  const [pref, setPref] = useState<ListView | null>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === "cards" || v === "list" ? v : null;
    } catch {
      return null;
    }
  });
  const choose = (v: ListView) => {
    setPref(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* sem armazenamento: vale só nesta sessão */ }
  };
  return [pref ?? (wide ? "list" : "cards"), choose];
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

  const [view, setView] = useListView();
  const [filter, setFilter] = useState<FilterKey>("all");
  // "Excluídas" (campanhas ocultas): só carrega a lista quando a pessoa abre o filtro.
  const [showDeleted, setShowDeleted] = useState(false);
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
      (c) => matchesFilter(filter, campaignDisplayState(c)) && (!q || c.name.toLowerCase().includes(q)),
    );
  }, [list.data, filter, search]);

  const reloadAll = () => { list.reload(); overview.reload(); };

  const toggleModule = async () => {
    const next = moduleTarget;
    setModuleTarget(null);
    if (next === null) return;
    const r = await run("module", () => campaignsApi.put<{ enabled: boolean }>("/admin/module", { enabled: next }),
      next ? "Campanhas ligadas para todos." : "Campanhas desligadas para todos.");
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
  const hasPublished = (list.data ?? []).some((c) => {
    const st = campaignDisplayState(c);
    return st === "published" || st === "scheduled";
  });
  const unpublishOpenStages =
    unpublishTarget &&
    ["registration", "voting"].some((k) => stageState(unpublishTarget.stages.find((s) => s.stage_key === k)) === "open");
  const recent = overview.data?.recent.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      <SectionNav active="campaigns" showBook={!!(perms.campaigns_review || perms.campaigns_publish)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Megaphone size={24} className="text-primary" />
          Campanhas
        </h1>
        <div className="flex items-center gap-2">
          <TourButton onClick={tour.start} />
          {perms.campaigns_publish && moduleEnabled !== null && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-tutorial="camp-module-menu" variant="outline" size="icon" className="rounded-xl" aria-label="Mais opções" disabled={busy !== null}>
                  {busy === "module" ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem onSelect={() => setModuleTarget(!moduleEnabled)} className="cursor-pointer items-start gap-2">
                  <Power size={14} className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{moduleEnabled ? "Desligar campanhas para todos" : "Ligar campanhas para todos"}</span>
                    <span className="block text-[11px] text-muted-foreground">Chave geral de emergência. Para uma campanha só, use “Visível para colaboradores”.</span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {perms.campaigns_create && (
            <Button data-tutorial="camp-new" className="gap-2 rounded-xl" onClick={() => navigate("/admin/campaigns/new")}>
              <Plus size={16} /> Nova campanha
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* Aviso só quando faz falta: com a chave geral desligada, as campanhas publicadas ficam invisíveis. */}
        {moduleEnabled === false && hasPublished && (
          <div data-tutorial="camp-module-alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <Power size={18} className="shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <p className="min-w-0 flex-1 basis-56 text-[13px] leading-snug text-amber-800 dark:text-amber-200">
              <b>Campanhas desligadas para todos.</b> Nenhum colaborador vê as campanhas publicadas.
            </p>
            {perms.campaigns_publish && (
              <Button size="sm" variant="outline" className="rounded-xl" disabled={busy !== null} onClick={() => setModuleTarget(true)}>
                {busy === "module" ? <Loader2 size={14} className="animate-spin" /> : null} Ligar
              </Button>
            )}
          </div>
        )}

        {/* Filtros por situação (com contagem) e busca, na mesma linha em telas largas */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div data-tutorial="camp-kpis" className="flex flex-wrap gap-2" role="group" aria-label="Filtrar campanhas por situação">
            {FILTERS.map((f) => {
              const active = !showDeleted && filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setFilter(f.key); setShowDeleted(false); }}
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
            {canEdit && (
              <button
                type="button"
                aria-pressed={showDeleted}
                onClick={() => setShowDeleted((v) => !v)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                  showDeleted
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-dashed border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Trash2 size={14} aria-hidden="true" /> Excluídas
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome"
                className="pl-9 rounded-xl h-10"
                aria-label="Buscar campanha"
              />
            </div>
            <div data-tutorial="camp-view-toggle" className="inline-flex h-10 shrink-0 items-center rounded-xl border bg-card p-0.5" role="group" aria-label="Forma de exibição da lista">
              {([["cards", "Cartões", LayoutGrid], ["list", "Lista", ListIcon]] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    view === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon size={14} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lista */}
        <div data-tutorial="camp-list" className="space-y-3">
          {showDeleted ? (
            <DeletedCampaigns search={search} canRestore={canEdit} onRestored={reloadAll} />
          ) : list.loading && !list.data ? (
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
            <div className={view === "cards" ? "grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3" : "space-y-2"}>
              {/* Cabeçalho de colunas (só na Lista, de tablet para cima, onde cada campanha é uma linha) */}
              {view === "list" && (
                <div
                  className={cn("hidden px-5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground", LIST_ROW_GRID)}
                  aria-hidden="true"
                >
                  <span>Campanha</span>
                  <span>Situação</span>
                  <span>Período</span>
                  <span className="text-right">Ações</span>
                </div>
              )}
              {rows.map((c) => (
                <CampaignListCard
                  key={c.id}
                  c={c}
                  view={view}
                  moduleEnabled={moduleEnabled}
                  check={checks[c.id]}
                  canEdit={canEdit}
                  canPublish={!!perms.campaigns_publish}
                  canDuplicate={!!perms.campaigns_duplicate}
                  busy={busy !== null}
                  onOpen={() => navigate(`/admin/campaigns/${c.id}`)}
                  onEdit={() => navigate(`/admin/campaigns/${c.id}/edit`)}
                  onHistory={() => navigate(`/admin/campaigns/${c.id}?tab=reports&section=history`)}
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
      </div>

      <ConfirmDialog
        open={moduleTarget !== null}
        onOpenChange={(o) => !o && setModuleTarget(null)}
        title={moduleTarget ? "Ligar as campanhas para todos?" : "Desligar as campanhas para todos?"}
        description={
          moduleTarget
            ? "Colaboradores elegíveis passarão a ver o menu Campanhas se houver campanha publicada para eles."
            : "Nenhum colaborador verá o menu, as campanhas ou a tour. Os dados e as campanhas não são apagados e você pode religar quando quiser."
        }
        confirmLabel={moduleTarget ? "Ligar" : "Desligar"}
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
