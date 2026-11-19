import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  ChevronDown, ChevronUp, History, LayoutGrid, List as ListIcon, Loader2, Megaphone, MoreHorizontal, Plus, Power, Search,
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
import type { AdminCampaignListItem, AdminOverview, PublishCheck } from "../../../lib/campaigns/types";
import { CampaignTour, TourButton, tourKey, useTour } from "../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_OVERVIEW } from "../../../lib/campaigns/tours-admin";
import { useCampaignPerms } from "./useCampaignPerms";
import { DuplicateDialog } from "./DuplicateDialog";
import { DeleteCampaignDialog, LiveCampaignDeleteNotice } from "./DeleteCampaignDialog";
import { PublishDialog } from "./PublishDialog";
import { CampaignListCard, LIST_ROW_GRID } from "./CampaignListCard";
import type { ListView } from "./CampaignListCard";
import { ErrorBox, LoadingBox, ReasonDialog, RestrictedBox, useBusy, useLoader } from "./shared";
import { SectionNav } from "./SectionNav";

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
  // A tela principal mostra SÓ campanhas ATIVAS; concluídas, desativadas e excluídas ficam em "Histórico de campanhas".
  const list = useLoader<AdminCampaignListItem[]>(() => campaignsApi.get("/admin/campaigns?scope=active"), []);
  // A tour só começa quando os alvos já estão na tela (senão os passos seriam pulados).
  const tour = useTour({
    // v2 (rodada 5b): a lista mostra só campanhas ativas e há o Histórico; a tour reabre UMA vez para quem já viu a antiga.
    storageKey: tourKey("admin", user?.id, "overview", undefined, 2),
    enabled: !permsLoading && isAdmin && !!overview.data && !!list.data,
  });
  const { busy, run } = useBusy();

  const [view, setView] = useListView();
  const [search, setSearch] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [moduleTarget, setModuleTarget] = useState<boolean | null>(null);
  const [dupTarget, setDupTarget] = useState<AdminCampaignListItem | null>(null);
  const [publishTarget, setPublishTarget] = useState<AdminCampaignListItem | null>(null);
  const [unpublishTarget, setUnpublishTarget] = useState<AdminCampaignListItem | null>(null);
  const [republishTarget, setRepublishTarget] = useState<AdminCampaignListItem | null>(null);
  // Excluir (menu "⋯" do cartão) é SEMPRE lógico (nunca apaga registros): no ar → aviso para desativar; demais, inclusive rascunho → ocultar (digitar o nome).
  const [liveDeleteTarget, setLiveDeleteTarget] = useState<AdminCampaignListItem | null>(null);
  const [softDeleteTarget, setSoftDeleteTarget] = useState<AdminCampaignListItem | null>(null);

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

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [list.data, search]);

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
      "Campanha desativada. Ela está em Histórico de campanhas › Desativadas.");
    if (r.ok) { setUnpublishTarget(null); reloadAll(); }
  };

  const askDelete = (c: AdminCampaignListItem) => {
    const st = campaignDisplayState(c);
    if (st === "published" || st === "scheduled") setLiveDeleteTarget(c);
    else setSoftDeleteTarget(c);
  };

  const doSoftDelete = async (confirmName: string) => {
    const target = softDeleteTarget;
    if (!target) return;
    const r = await run("softdelete", () => campaignsApi.post(`/admin/campaigns/${target.id}/soft-delete`, { confirm: confirmName }),
      "Campanha excluída. Ela está em Histórico de campanhas › Excluídas.");
    if (r.ok) { setSoftDeleteTarget(null); reloadAll(); }
  };

  const doRepublish = async () => {
    const target = republishTarget;
    setRepublishTarget(null);
    if (!target) return;
    const r = await run("republish", () => campaignsApi.post(`/admin/campaigns/${target.id}/resume`),
      "Campanha reativada: voltou a aparecer para os colaboradores.");
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
                <Button data-tutorial="camp-module-menu" variant="outline" size="icon" className="h-11 w-11 rounded-xl sm:h-10 sm:w-10" aria-label="Mais opções" disabled={busy !== null}>
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

        {/* Busca e forma de exibição (cartões ou lista). A tela mostra só campanhas ativas: o resto está no Histórico. */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 lg:max-w-xs lg:flex-none lg:basis-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome"
              className="pl-9 rounded-xl h-11 sm:h-10"
              aria-label="Buscar campanha"
            />
          </div>
          <div data-tutorial="camp-view-toggle" className="inline-flex h-12 shrink-0 items-center rounded-xl border bg-card p-0.5 sm:h-10" role="group" aria-label="Forma de exibição da lista">
              {([["cards", "Cartões", LayoutGrid], ["list", "Lista", ListIcon]] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={cn(
                    "inline-flex h-11 items-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:px-2.5",
                    view === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon size={14} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
        </div>

        {/* Lista */}
        <div data-tutorial="camp-list" className="space-y-3">
          {list.loading && !list.data ? (
            <LoadingBox />
          ) : list.error && !list.data ? (
            <ErrorBox message={list.error} onRetry={list.reload} />
          ) : total === 0 ? (
            <Card className="rounded-3xl border-dashed">
              <CardContent className="p-10 text-center">
                <Megaphone size={36} className="mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="font-medium text-foreground">Nenhuma campanha ativa no momento.</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Campanhas concluídas, desativadas e excluídas ficam em Histórico de campanhas.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  {perms.campaigns_create && (
                    <Button className="h-11 gap-2 rounded-xl" onClick={() => navigate("/admin/campaigns/new")}>
                      <Plus size={16} /> Nova campanha
                    </Button>
                  )}
                  <Button variant="outline" className="h-11 gap-2 rounded-xl" onClick={() => navigate("/admin/campaigns/historico")}>
                    <History size={16} /> Ver histórico
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="rounded-3xl border-dashed">
              <CardContent className="p-10 text-center">
                <Search size={32} className="mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="font-medium text-muted-foreground">Nenhuma campanha ativa encontrada com essa busca.</p>
                <Button
                  variant="outline"
                  className="mt-4 h-11 rounded-xl"
                  onClick={() => setSearch("")}
                >
                  Limpar busca
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
                  canDelete={canEdit}
                  busy={busy !== null}
                  onOpen={() => navigate(`/admin/campaigns/${c.id}`)}
                  onEdit={() => navigate(`/admin/campaigns/${c.id}/edit`)}
                  onHistory={() => navigate(`/admin/campaigns/${c.id}?tab=reports&section=history`)}
                  onPublish={() => setPublishTarget(c)}
                  onUnpublish={() => setUnpublishTarget(c)}
                  onRepublish={() => setRepublishTarget(c)}
                  onDuplicate={() => setDupTarget(c)}
                  onDelete={() => askDelete(c)}
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
        title="Desativar a campanha?"
        description="Ela sai da lista principal e some para os colaboradores: ninguém mais participa, vota ou vê. Receitas, votos e histórico ficam guardados. Você a encontra em Histórico de campanhas › Desativadas e pode reativá-la (isso não reabre períodos já encerrados)."
        placeholder="Motivo (opcional)"
        confirmLabel="Desativar"
        pending={busy === "unpublish"}
        onConfirm={doUnpublish}
      />

      <ConfirmDialog
        open={republishTarget !== null}
        onOpenChange={(o) => !o && setRepublishTarget(null)}
        title="Reativar a campanha?"
        description="A campanha volta a ficar visível. Períodos já encerrados NÃO são reabertos."
        confirmLabel="Reativar"
        onConfirm={doRepublish}
      />

      <LiveCampaignDeleteNotice
        open={liveDeleteTarget !== null}
        onOpenChange={(o) => !o && setLiveDeleteTarget(null)}
        canUnpublish={!!perms.campaigns_publish}
        onUnpublish={() => { const t = liveDeleteTarget; setLiveDeleteTarget(null); if (t) setUnpublishTarget(t); }}
      />

      <DeleteCampaignDialog
        open={softDeleteTarget !== null}
        onOpenChange={(o) => !o && setSoftDeleteTarget(null)}
        campaignName={softDeleteTarget?.name ?? ""}
        isDraft={!!softDeleteTarget && campaignDisplayState(softDeleteTarget) === "draft"}
        pending={busy === "softdelete"}
        onConfirm={doSoftDelete}
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
