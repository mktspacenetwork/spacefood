import { formatInTimeZone } from "date-fns-tz";
import { RefreshCw } from "lucide-react";
import { Card } from "../../../../../components/ui/Card";
import { cn } from "../../../../../lib/utils";
import { TIMEZONE } from "../../../../../lib/date-utils";
import type { TallyRow } from "../../../../../lib/campaigns/types";
import { SectionLabel } from "../../shared";

/** Cores dos gráficos (variáveis do tema; funcionam no claro e no escuro). */
export const CHART = {
  primary: "var(--primary)",
  green: "#16a34a",
  amber: "#f59e0b",
  blue: "#3b82f6",
  muted: "var(--muted-foreground)",
} as const;

export const TOOLTIP_STYLE = {
  borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
  backgroundColor: "var(--card)", color: "var(--card-foreground)", fontSize: 12,
} as const;

/** Altura padrão dos gráficos (px). */
export const CHART_HEIGHT = 220;

/** Cartão de um bloco do dashboard: rótulo, dica opcional, ação opcional à direita e o conteúdo. */
export function Panel({
  title, hint, action, className, children,
}: { title: string; hint?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <Card className={cn("min-w-0 space-y-3 rounded-3xl border p-4 hover:shadow-sm sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <SectionLabel>{title}</SectionLabel>
          {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** "Ao vivo" + hora da última atualização (horário de Brasília, vem do servidor). */
export function LiveStatus({
  generatedAt, fetchedAt, error, autoRefresh, refreshing, onReload,
}: {
  generatedAt: string | null;
  fetchedAt: number | null;
  error: string | null;
  autoRefresh: boolean;
  refreshing: boolean;
  onReload: () => void;
}) {
  const stamp = generatedAt ?? (fetchedAt ? new Date(fetchedAt).toISOString() : null);
  const time = stamp ? formatInTimeZone(new Date(stamp), TIMEZONE, "HH:mm:ss") : null;
  const state: "live" | "stale" | "final" = error ? "stale" : autoRefresh ? "live" : "final";
  const label = state === "live" ? "Ao vivo" : state === "stale" ? "Sem atualização" : "Dados finais";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 font-semibold">
        <span
          aria-hidden="true"
          className={cn(
            "h-2 w-2 rounded-full",
            state === "live" && "bg-green-500 motion-safe:animate-pulse",
            state === "stale" && "bg-amber-500",
            state === "final" && "bg-muted-foreground/60",
          )}
        />
        <span className={cn(state === "live" && "text-green-700 dark:text-green-400", state === "stale" && "text-amber-700 dark:text-amber-400", state === "final" && "text-muted-foreground")}>
          {label}
        </span>
      </span>
      {time && <span className="text-muted-foreground">· Atualizado às {time}</span>}
      <button
        type="button"
        onClick={onReload}
        disabled={refreshing}
        aria-label="Atualizar agora"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <RefreshCw size={13} className={cn(refreshing && "animate-spin")} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Posição de competição (1º, 1º, 3º). Usa a do servidor; se faltar, calcula pelos votos. */
export function withPositions(rows: TallyRow[]): (TallyRow & { pos: number })[] {
  return rows.map((r) => ({
    ...r,
    pos: typeof r.position === "number" ? r.position : 1 + rows.filter((o) => o.votes > r.votes).length,
  }));
}
