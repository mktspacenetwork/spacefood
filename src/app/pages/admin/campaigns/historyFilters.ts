import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "../../../lib/date-utils";
import type { AdminHistoryItem, HistoryCategory } from "../../../lib/campaigns/types";

/** Lógica pura do Histórico de campanhas (filtros, contagens e ordem). Sem React: fácil de conferir. */

// ───────────────────────────── Categoria (vai na URL: ?categoria=) ─────────────────────────────

export type CategoryFilter = "all" | HistoryCategory;

export const CATEGORIES: { key: CategoryFilter; label: string; param: string }[] = [
  { key: "all", label: "Todas", param: "todas" },
  { key: "completed", label: "Concluídas", param: "concluidas" },
  { key: "disabled", label: "Desativadas", param: "desativadas" },
  { key: "deleted", label: "Excluídas", param: "excluidas" },
];

/** Valor desconhecido na URL cai em "Todas" (link antigo ou digitado errado nunca quebra a tela). */
export function categoryFromParam(p: string | null): CategoryFilter {
  return CATEGORIES.find((c) => c.param === (p ?? "").toLowerCase())?.key ?? "all";
}
export function categoryToParam(k: CategoryFilter): string | null {
  return k === "all" ? null : (CATEGORIES.find((c) => c.key === k)?.param ?? null);
}

// ─────────────────────────────────────── Filtros ───────────────────────────────────────

export type PeriodPreset = "all" | "30d" | "90d" | "year" | "custom";
export type VotingFilter = "all" | "with" | "without";
export type ResultFilter = "all" | "announced" | "confirmed" | "unannounced";

export type HistoryFilters = {
  query: string;
  period: PeriodPreset;
  /** "yyyy-MM-dd" (dia de Brasília); só vale com period = custom. */
  from: string;
  to: string;
  voting: VotingFilter;
  result: ResultFilter;
};

export const EMPTY_FILTERS: HistoryFilters = { query: "", period: "all", from: "", to: "", voting: "all", result: "all" };

export const PERIOD_OPTIONS: { key: PeriodPreset; label: string }[] = [
  { key: "all", label: "Todo o período" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "90d", label: "Últimos 90 dias" },
  { key: "year", label: "Este ano" },
  { key: "custom", label: "Personalizado" },
];
export const VOTING_OPTIONS: { key: VotingFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "with", label: "Com votação" },
  { key: "without", label: "Sem votação" },
];
export const RESULT_OPTIONS: { key: ResultFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "announced", label: "Divulgado" },
  { key: "confirmed", label: "Confirmado" },
  { key: "unannounced", label: "Sem resultado divulgado" },
];

/** Sem acento e sem diferença de maiúsculas ("Café" encontra "cafe"). */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Dia de Brasília ("yyyy-MM-dd") de um instante. */
export function brazilDay(iso: string | Date): string {
  return formatInTimeZone(typeof iso === "string" ? new Date(iso) : iso, TIMEZONE, "yyyy-MM-dd");
}

/** Soma dias a um "yyyy-MM-dd" (aritmética de calendário, sem fuso). */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Erro do período personalizado (null = ok). A data inicial não pode passar da final. */
export function periodError(f: HistoryFilters): string | null {
  if (f.period !== "custom") return null;
  if (f.from && f.to && f.from > f.to) return "A data inicial deve ser anterior ou igual à data final.";
  return null;
}

/** Intervalo de dias (inclusive) do filtro "Situação em"; null = sem limite (ou período personalizado inválido/vazio). */
export function periodRange(f: HistoryFilters, now: Date = new Date()): { from: string | null; to: string | null } | null {
  const today = brazilDay(now);
  switch (f.period) {
    case "all": return null;
    case "30d": return { from: addDays(today, -29), to: today };
    case "90d": return { from: addDays(today, -89), to: today };
    case "year": return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom":
      if (periodError(f)) return null;
      if (!f.from && !f.to) return null;
      return { from: f.from || null, to: f.to || null };
  }
}

export function activeFilterCount(f: HistoryFilters): number {
  return (f.query.trim() ? 1 : 0) + (f.period !== "all" ? 1 : 0) + (f.voting !== "all" ? 1 : 0) + (f.result !== "all" ? 1 : 0);
}

/** Aplica tudo MENOS a categoria (a categoria é escolhida pelos botões e as contagens deles respeitam estes filtros). */
export function applyFilters(items: AdminHistoryItem[], f: HistoryFilters, now: Date = new Date()): AdminHistoryItem[] {
  const q = norm(f.query);
  const range = periodRange(f, now);
  return items.filter((it) => {
    if (q && !norm(it.name).includes(q)) return false;
    if (range) {
      if (!it.since) return false; // sem data registrada: não dá para dizer que cai no período
      const day = brazilDay(it.since);
      if (range.from && day < range.from) return false;
      if (range.to && day > range.to) return false;
    }
    if (f.voting === "with" && !it.has_voting) return false;
    if (f.voting === "without" && it.has_voting) return false;
    if (f.result === "announced" && it.result_status !== "announced") return false;
    if (f.result === "confirmed" && it.result_status !== "confirmed") return false;
    if (f.result === "unannounced" && it.result_status === "announced") return false;
    return true;
  });
}

export function countByCategory(items: AdminHistoryItem[]): Record<CategoryFilter, number> {
  const out: Record<CategoryFilter, number> = { all: items.length, completed: 0, disabled: 0, deleted: 0 };
  for (const it of items) out[it.category]++;
  return out;
}

/** Mais recentes primeiro (pela data da situação; sem data, pela criação). */
export function sortRecentFirst(items: AdminHistoryItem[]): AdminHistoryItem[] {
  const t = (it: AdminHistoryItem) => new Date(it.since ?? it.created_at).getTime() || 0;
  return [...items].sort((a, b) => t(b) - t(a));
}
