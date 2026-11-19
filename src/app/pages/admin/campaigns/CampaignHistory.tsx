import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { History as HistoryIcon, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/input";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../context/auth-context";
import { campaignsApi } from "../../../lib/campaigns/api";
import { plural } from "../../../lib/campaigns/format";
import type { AdminHistoryItem } from "../../../lib/campaigns/types";
import { CampaignTour, TourButton, tourKey, useTour } from "../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_HISTORY } from "../../../lib/campaigns/tours-admin";
import { useCampaignPerms } from "./useCampaignPerms";
import { DuplicateDialog } from "./DuplicateDialog";
import { HistoryItemCard } from "./HistoryItemCard";
import { EmptyBox, ErrorBox, LoadingBox, RestrictedBox, useBusy, useLoader } from "./shared";
import { SectionNav } from "./SectionNav";
import {
  CATEGORIES, EMPTY_FILTERS, PERIOD_OPTIONS, RESULT_OPTIONS, VOTING_OPTIONS,
  activeFilterCount, applyFilters, categoryFromParam, categoryToParam, countByCategory, periodError, sortRecentFirst,
} from "./historyFilters";
import type { CategoryFilter, HistoryFilters, PeriodPreset, ResultFilter, VotingFilter } from "./historyFilters";

const FIELD =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block min-w-0 space-y-1.5", className)}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

type Confirm = { kind: "reactivate" | "restore"; item: AdminHistoryItem };

/**
 * Histórico de campanhas: tudo o que saiu da lista principal, por situação (Concluídas · Desativadas · Excluídas).
 * Nada é apagado: receitas, participantes, votos, resultados e auditoria seguem consultáveis ("Abrir" e "Relatórios").
 * Reativar/Restaurar devolvem a campanha à lista principal SEM reabrir períodos já encerrados (a regra é do servidor).
 */
/** Restaurar devolve a campanha à situação de antes: nem sempre é a lista principal (desativada e concluída ficam no Histórico). */
function restoredMsg(prior: string | null | undefined): string {
  if (prior === "suspended") return "Campanha restaurada. Ela voltou como desativada: Histórico de campanhas › Desativadas.";
  if (prior === "closed" || prior === "archived" || prior === "ended") return "Campanha restaurada. Ela voltou como concluída: Histórico de campanhas › Concluídas.";
  return "Campanha restaurada. Ela voltou para a lista principal.";
}

export function CampaignHistory() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { perms, loading: permsLoading, isAdmin } = useCampaignPerms();
  const list = useLoader<AdminHistoryItem[]>(() => campaignsApi.get("/admin/campaigns/history"), []);
  const { busy, run } = useBusy();
  // Tour desta tela (abre sozinha UMA vez; "Ver tour" fica sempre visível). Só começa com a lista carregada, para os alvos existirem.
  const tour = useTour({
    storageKey: tourKey("admin", user?.id, "history"),
    enabled: !permsLoading && isAdmin && !!list.data,
  });

  const category = categoryFromParam(params.get("categoria"));
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [dupTarget, setDupTarget] = useState<AdminHistoryItem | null>(null);

  const setCategory = (k: CategoryFilter) => {
    const next = new URLSearchParams(params);
    const v = categoryToParam(k);
    if (v) next.set("categoria", v); else next.delete("categoria");
    setParams(next, { replace: true });
  };
  const patch = (p: Partial<HistoryFilters>) => setFilters((f) => ({ ...f, ...p }));

  const all = list.data ?? [];
  // As contagens dos botões de categoria respeitam os outros filtros (o número bate com o que a lista mostraria).
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);
  const counts = useMemo(() => countByCategory(filtered), [filtered]);
  const shown = useMemo(
    () => sortRecentFirst(category === "all" ? filtered : filtered.filter((c) => c.category === category)),
    [filtered, category],
  );
  const nActive = activeFilterCount(filters);
  const rangeError = periodError(filters);
  const hasAny = nActive > 0 || category !== "all";

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setCategory("all");
  };

  const canReactivate = !!perms.campaigns_publish;
  const canRestore = !!perms.campaigns_edit;
  const canDuplicate = !!perms.campaigns_duplicate;

  const doConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    const reactivate = c.kind === "reactivate";
    const r = await run(
      `${reactivate ? "reactivate" : "restore"}:${c.item.id}`,
      () => campaignsApi.post(`/admin/campaigns/${c.item.id}/${reactivate ? "resume" : "restore"}`),
      reactivate ? "Campanha reativada. Ela voltou para a lista principal." : restoredMsg(c.item.prior),
    );
    if (r.ok) {
      list.setData((d) => (d ? d.filter((x) => x.id !== c.item.id) : d)); // some do histórico já; a recarga confirma
      void list.reload();
    }
  };

  if (permsLoading) return <LoadingBox />;
  if (!isAdmin) return <RestrictedBox />;

  const showBook = !!(perms.campaigns_review || perms.campaigns_publish);
  const initialLoading = list.loading && !list.data;

  return (
    <div className="space-y-5">
      <SectionNav active="history" showBook={showBook} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <HistoryIcon size={24} className="text-primary" aria-hidden="true" />
          Histórico de campanhas
        </h1>
        <TourButton onClick={tour.start} />
      </div>

      {/* Categoria (vai na URL: ?categoria=concluidas|desativadas|excluidas) */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por situação" data-tutorial="camp-history-categories">
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(c.key)}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {c.label}
              <span
                className={cn(
                  "min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums",
                  active ? "bg-primary-foreground/20 text-primary-foreground" : counts[c.key] > 0 ? "bg-muted text-foreground" : "bg-muted text-muted-foreground/60",
                )}
              >
                {list.data ? counts[c.key] : "–"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Busca e filtros (no celular, os filtros ficam recolhidos atrás do botão "Filtros") */}
      <Card className="rounded-3xl border" data-tutorial="camp-history-filters">
        <CardContent className="space-y-4 p-4">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={filters.query}
                onChange={(e) => patch({ query: e.target.value })}
                placeholder="Buscar campanha pelo nome"
                aria-label="Buscar campanha pelo nome"
                className="h-11 rounded-xl pl-10 pr-10"
                autoComplete="off"
              />
              {filters.query && (
                <button
                  type="button"
                  aria-label="Limpar a busca"
                  onClick={() => patch({ query: "" })}
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 gap-2 rounded-xl px-3.5 sm:hidden"
              aria-expanded={filtersOpen}
              aria-controls="history-filters"
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <SlidersHorizontal size={16} aria-hidden="true" /> Filtros
              {nActive - (filters.query.trim() ? 1 : 0) > 0 && (
                <span className="min-w-[1.25rem] rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {nActive - (filters.query.trim() ? 1 : 0)}
                </span>
              )}
            </Button>
          </div>

          <div id="history-filters" className={cn("gap-3 sm:grid sm:grid-cols-3", filtersOpen ? "grid grid-cols-1" : "hidden")}>
            <Field label="Situação em">
              <select className={FIELD} value={filters.period} onChange={(e) => patch({ period: e.target.value as PeriodPreset })}>
                {PERIOD_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Votação">
              <select className={FIELD} value={filters.voting} onChange={(e) => patch({ voting: e.target.value as VotingFilter })}>
                {VOTING_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Resultado">
              <select className={FIELD} value={filters.result} onChange={(e) => patch({ result: e.target.value as ResultFilter })}>
                {RESULT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            {filters.period === "custom" && (
              <div className="space-y-2 sm:col-span-3">
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:max-w-md">
                  <Field label="De">
                    <input
                      type="date"
                      className={FIELD}
                      value={filters.from}
                      max={filters.to || undefined}
                      onChange={(e) => patch({ from: e.target.value })}
                      aria-invalid={!!rangeError}
                    />
                  </Field>
                  <Field label="Até">
                    <input
                      type="date"
                      className={FIELD}
                      value={filters.to}
                      min={filters.from || undefined}
                      onChange={(e) => patch({ to: e.target.value })}
                      aria-invalid={!!rangeError}
                    />
                  </Field>
                </div>
                {rangeError && <p className="text-xs font-medium text-destructive" role="alert">{rangeError} O filtro de período fica sem efeito até corrigir.</p>}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-sm text-muted-foreground" aria-live="polite" data-history-count>
              {list.data ? plural(shown.length, "campanha", "campanhas") : "Carregando…"}
            </p>
            {hasAny && (
              <Button type="button" variant="ghost" className="h-11 gap-2 rounded-xl px-3 text-sm text-muted-foreground" onClick={clearAll}>
                <X size={15} aria-hidden="true" /> Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {initialLoading ? (
        <LoadingBox />
      ) : list.error && !list.data ? (
        <ErrorBox message={list.error} onRetry={list.reload} />
      ) : (
        <>
          {list.error && (
            <ErrorBox message={`Não foi possível atualizar a lista. ${list.error}`} onRetry={list.reload} />
          )}
          {all.length === 0 ? (
            <EmptyBox icon={<HistoryIcon size={34} />} title="Nenhuma campanha no histórico ainda." />
          ) : shown.length === 0 ? (
            <div className="space-y-3">
              <EmptyBox icon={<Search size={34} />} title="Nenhuma campanha encontrada com esses filtros." />
              {hasAny && (
                <div className="flex justify-center">
                  <Button variant="outline" className="h-11 gap-2 rounded-xl" onClick={clearAll}>
                    <X size={15} aria-hidden="true" /> Limpar filtros
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-tutorial="camp-history-list">
              {shown.map((it, idx) => (
                <li key={it.id} className="min-w-0">
                  <HistoryItemCard
                    item={it}
                    tutorial={idx === 0}
                    canReactivate={canReactivate}
                    canRestore={canRestore}
                    canDuplicate={canDuplicate}
                    busy={busy !== null}
                    busyKey={busy}
                    onOpen={() => navigate(`/admin/campaigns/${it.id}`)}
                    onReports={() => navigate(`/admin/campaigns/${it.id}?tab=reports`)}
                    onDuplicate={() => setDupTarget(it)}
                    onRestorable={() => it.restorable && setConfirm({ kind: it.restorable === "reactivate" ? "reactivate" : "restore", item: it })}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "reactivate" ? "Reativar campanha?" : "Restaurar campanha?"}
        description={
          confirm?.kind === "reactivate"
            ? "A campanha volta para a lista principal e fica visível. Períodos de participação e votação já encerrados NÃO são reabertos."
            : "A campanha volta como estava antes de ser excluída."
        }
        confirmLabel={confirm?.kind === "reactivate" ? "Reativar" : "Restaurar"}
        onConfirm={doConfirm}
      />

      {dupTarget && (
        <DuplicateDialog
          open
          onOpenChange={(o) => !o && setDupTarget(null)}
          campaignId={dupTarget.id}
          campaignName={dupTarget.name}
          hasVoting={dupTarget.has_voting}
          onDuplicated={(id) => navigate(`/admin/campaigns/${id}`)}
        />
      )}

      <CampaignTour steps={ADMIN_TOUR_HISTORY} tour={tour} />
    </div>
  );
}
