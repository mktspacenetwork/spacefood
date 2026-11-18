import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import { RankingList } from "./RankingList";
import { campaignsApi } from "../../lib/campaigns/api";
import type { RankingItem } from "../../lib/campaigns/types";

/**
 * Ranking PARCIAL, só quando o administrador liberou (`state.ranking_visible && state.ranking_partial`).
 * Mostra posição, receita, autor e votos, com o rótulo "Parcial — ainda pode mudar".
 * Falha silenciosa: se o servidor negar (não liberado), nada aparece.
 */
export function PartialRanking({ slug, votedId }: { slug: string; votedId?: string | null }) {
  const [items, setItems] = useState<RankingItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    campaignsApi
      .get<{ official: boolean; partial?: boolean; items: RankingItem[] }>(`/campaigns/${encodeURIComponent(slug)}/ranking`)
      .then((r) => { if (alive && !r.official && r.partial === true) setItems(r.items); })
      .catch(() => { /* não liberado: não mostra nada */ });
    return () => { alive = false; };
  }, [slug]);

  if (!items || items.length === 0) return null;
  return (
    <section data-tutorial="camp-partial" className="space-y-2" aria-label="Ranking parcial">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
        <Hourglass size={13} aria-hidden="true" /> Parcial — ainda pode mudar
      </p>
      <RankingList items={items} votedId={votedId} />
    </section>
  );
}
