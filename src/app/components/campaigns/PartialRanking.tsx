import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronRight, Hourglass } from "lucide-react";
import { RankingList } from "./RankingList";
import { campaignsApi } from "../../lib/campaigns/api";
import { rankPositions, sameRanking, topCount, useVisibleInterval } from "../../lib/campaigns/ranking";
import { TIMEZONE } from "../../lib/date-utils";
import type { RankingItem } from "../../lib/campaigns/types";

/**
 * Ranking PARCIAL, só quando o administrador liberou (`state.ranking_visible && state.ranking_partial`).
 * Resumo do topo (até o 3º lugar) com o rótulo "Parcial — ainda pode mudar" e um link para a classificação completa.
 * Atualiza sozinho (30 s, só com a aba visível, sem piscar). Falha silenciosa: se o servidor negar (não liberado ou
 * desligado depois), a seção some.
 */
export function PartialRanking({ slug, votedId }: { slug: string; votedId?: string | null }) {
  const [items, setItems] = useState<RankingItem[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await campaignsApi.get<{ official: boolean; partial?: boolean; items: RankingItem[] }>(`/campaigns/${encodeURIComponent(slug)}/ranking`);
      if (!r.official && r.partial === true) {
        setItems((prev) => (sameRanking(prev, r.items) ? prev : r.items));
        setUpdatedAt(new Date());
      } else {
        setItems(null);
      }
    } catch {
      setItems(null); // não liberado (ou desligado depois): não mostra nada
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);
  useVisibleInterval(() => void load(), 30_000, true);

  if (!items || items.length === 0) return null;
  const count = topCount(rankPositions(items), 3, 5);
  return (
    <section data-tutorial="camp-partial" className="space-y-2" aria-label="Ranking parcial">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          <Hourglass size={13} aria-hidden="true" /> Parcial — ainda pode mudar
        </p>
        {updatedAt && <span className="text-[11px] text-muted-foreground">Atualizado às {formatInTimeZone(updatedAt, TIMEZONE, "HH:mm")}</span>}
      </div>
      {count > 0 ? (
        <RankingList items={items} votedId={votedId} limit={count} />
      ) : (
        <p className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">Ainda não há votos. A classificação aparece quando os primeiros votos chegarem.</p>
      )}
      <Link
        to={`/campanhas/${encodeURIComponent(slug)}/ranking`}
        className="inline-flex h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Ver classificação completa <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
