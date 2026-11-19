import { ChevronRight } from "lucide-react";
import { cn } from "../../../../../lib/utils";
import type { AdminAnalytics, AdminCampaign } from "../../../../../lib/campaigns/types";

type Kpi = {
  key: string;
  label: string;
  value: number;
  hint?: string;
  dot: string;
  badge?: string;
  onClick?: () => void;
  aria: string;
};

/** Cartões de números: participantes, enviadas, aprovadas, reprovadas, votos e fora do prazo. Cada um abre a tela detalhada (se houver acesso). */
export function KpiCards({
  data, campaign, go,
}: {
  data: AdminAnalytics;
  campaign: AdminCampaign;
  go: { people?: () => void; recipes?: () => void; results?: () => void };
}) {
  const t = data.totals;
  const f = campaign.features;
  const share = (n: number) => (t.submissions > 0 ? Math.round((n / t.submissions) * 100) : 0);
  const list: Kpi[] = [];

  if (f.submission) {
    list.push({
      key: "participants", label: "Participantes", value: t.participants, dot: "bg-primary",
      hint: `de ${t.eligible} · ${t.participation_pct}%`, onClick: go.people,
      aria: `Participantes: ${t.participants} de ${t.eligible}, ${t.participation_pct}%`,
    });
    list.push({
      key: "submissions", label: "Receitas enviadas", value: t.submissions, dot: "bg-blue-500",
      hint: t.pending > 0 ? `${t.pending} em análise` : undefined, onClick: go.recipes,
      aria: `Receitas enviadas: ${t.submissions}, ${t.pending} em análise`,
    });
    if (f.approval) {
      list.push({
        key: "approved", label: "Aprovadas", value: t.approved, dot: "bg-green-500",
        hint: t.submissions > 0 ? `${share(t.approved)}% das enviadas` : undefined, onClick: go.recipes,
        aria: `Receitas aprovadas: ${t.approved}`,
      });
      list.push({
        key: "rejected", label: "Reprovadas", value: t.rejected, dot: "bg-red-500",
        hint: t.rejected > 0 ? `${share(t.rejected)}% das enviadas` : undefined, onClick: go.recipes,
        aria: `Receitas reprovadas: ${t.rejected}`,
      });
    }
  }
  if (data.has_voting) {
    list.push({
      key: "votes", label: "Votos válidos", value: t.votes_valid, dot: "bg-amber-500",
      hint: `${t.voters} votaram · ${t.voting_pct}%`, badge: data.voting_live ? "Parcial" : undefined, onClick: go.results,
      aria: `Votos válidos: ${t.votes_valid}, ${t.voters} pessoas votaram`,
    });
    if (f.submission) {
      list.push({
        key: "late", label: "Fora do prazo", value: t.late, dot: "bg-orange-500",
        hint: "não concorrem à votação", onClick: go.recipes,
        aria: `Receitas fora do prazo: ${t.late}. Não concorrem à votação`,
      });
    }
  }

  return (
    <div data-tutorial="camp-rep-cards" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {list.map((k) => {
        const body = (
          <>
            <div className="flex items-center justify-between gap-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", k.dot)} />
                <span className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k.label}</span>
              </span>
              {k.onClick && <ChevronRight size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">{k.value}</span>
              {k.badge && (
                <span className="rounded-full border border-yellow-200 bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300">
                  {k.badge}
                </span>
              )}
            </div>
            <p className="min-h-[1rem] text-[11px] leading-snug text-muted-foreground">{k.hint ?? ""}</p>
          </>
        );
        const base = "block min-w-0 space-y-1 rounded-3xl border border-border bg-card p-3.5 text-left text-card-foreground shadow-sm sm:p-4";
        return k.onClick ? (
          <button
            key={k.key}
            type="button"
            onClick={k.onClick}
            aria-label={`${k.aria}. Abrir detalhes`}
            className={cn(base, "transition-colors hover:bg-accent/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
          >
            {body}
          </button>
        ) : (
          <div key={k.key} role="group" aria-label={k.aria} className={base}>{body}</div>
        );
      })}
    </div>
  );
}
