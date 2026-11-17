import { Medal, Trophy } from "lucide-react";
import { Card } from "../ui/Card";
import { Progress } from "../ui/progress";
import { cn } from "../../lib/utils";
import { plural } from "../../lib/campaigns/format";
import type { RankingItem } from "../../lib/campaigns/types";

const MEDAL = ["text-amber-500", "text-slate-400", "text-orange-600"];

/** Ranking com posição, prato, autor, votos e barra proporcional ao primeiro lugar. */
export function RankingList({ items, votedId }: { items: RankingItem[]; votedId?: string | null }) {
  const top = Math.max(0, ...items.map((i) => i.votes));
  return (
    <Card className="overflow-hidden rounded-3xl hover:shadow-sm">
      <ol className="divide-y divide-border">
        {items.map((it) => {
          const pct = top > 0 ? Math.round((it.votes / top) * 100) : 0;
          return (
            <li key={it.submission_id} className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-extrabold text-foreground" aria-label={`${it.position}º lugar`}>
                {it.position <= 3 && it.votes > 0 ? (
                  it.position === 1 ? <Trophy size={18} className={MEDAL[0]} aria-hidden="true" /> : <Medal size={18} className={MEDAL[it.position - 1]} aria-hidden="true" />
                ) : (
                  <span>{it.position}º</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm font-bold", it.position === 1 && it.votes > 0 ? "text-foreground" : "text-foreground/90")}>
                      {it.dish_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {it.author}
                      {votedId === it.submission_id && (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Seu voto</span>
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
