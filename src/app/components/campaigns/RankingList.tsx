import { Medal, Trophy } from "lucide-react";
import { Card } from "../ui/Card";
import { Progress } from "../ui/progress";
import { cn } from "../../lib/utils";
import { plural } from "../../lib/campaigns/format";
import { positionLabel, rankPositions, totalVotes } from "../../lib/campaigns/ranking";
import type { RankingItem } from "../../lib/campaigns/types";

const MEDAL = ["text-amber-500", "text-slate-400", "text-orange-600"];

/**
 * Ranking com posição, prato, autor, votos e barra proporcional ao primeiro lugar.
 * A posição é de competição (empate divide o lugar: 1º, 1º, 3º), calculada em `ranking.ts` — a mesma regra do painel da gestão.
 * `limit` mostra só as primeiras linhas (a posição continua calculada sobre a lista inteira).
 */
export function RankingList({ items, votedId, limit }: { items: RankingItem[]; votedId?: string | null; limit?: number }) {
  const ranked = rankPositions(items);
  const anyVotes = totalVotes(items) > 0;
  const top = Math.max(0, ...items.map((i) => i.votes));
  const shown = limit !== undefined ? ranked.slice(0, limit) : ranked;
  return (
    <Card className="overflow-hidden rounded-3xl hover:shadow-sm">
      <ol className="divide-y divide-border">
        {shown.map(({ item: it, position, tied }) => {
          const pct = top > 0 ? Math.round((it.votes / top) * 100) : 0;
          const medal = anyVotes && it.votes > 0 && position <= 3;
          return (
            <li key={it.submission_id} className="flex items-center gap-3 p-4">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-extrabold text-foreground"
                aria-label={anyVotes ? `${position}º lugar${tied ? " (empate)" : ""}` : "Sem votos ainda"}
              >
                {medal ? (
                  position === 1 ? <Trophy size={18} className={MEDAL[0]} aria-hidden="true" /> : <Medal size={18} className={MEDAL[position - 1]} aria-hidden="true" />
                ) : (
                  <span>{positionLabel(position, anyVotes)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm font-bold", position === 1 && it.votes > 0 ? "text-foreground" : "text-foreground/90")}>
                      {it.dish_name}
                    </p>
                    <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">{it.author}</span>
                      {anyVotes && tied && it.votes > 0 && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Empate</span>
                      )}
                      {votedId === it.submission_id && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Seu voto</span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">{plural(it.votes, "voto", "votos")}</span>
                </div>
                <Progress value={pct} className="h-2" aria-label={`${it.dish_name}: ${plural(it.votes, "voto", "votos")}`} />
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
