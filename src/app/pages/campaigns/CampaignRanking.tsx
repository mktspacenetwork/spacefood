import { useCallback, useEffect, useState } from "react";
import { ListOrdered, Lock, ShieldCheck, Hourglass } from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "../../components/ui/Badge";
import { Skeleton } from "../../components/ui/skeleton";
import { RankingList } from "../../components/campaigns/RankingList";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { RANKING_TOUR } from "../../lib/campaigns/tours-collab";
import { cn } from "../../lib/utils";
import type { RankingItem } from "../../lib/campaigns/types";

type Payload = { official: boolean; items: RankingItem[] };

export function CampaignRanking() {
  const { campaign, state, slug } = useCampaignCtx();
  const { user } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setHidden(false);
    setData(null);
    try {
      setData(await campaignsApi.get<Payload>(`/campaigns/${encodeURIComponent(slug)}/ranking`));
    } catch (e) {
      if (e instanceof CampaignApiError && e.code === "RANKING_HIDDEN") setHidden(true);
      else setError(errMsg(e, "Não foi possível carregar o ranking."));
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "ranking", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user && !!data,
  });

  if (hidden) {
    return (
      <EmptyState
        icon={<Lock size={22} aria-hidden="true" />}
        title="O ranking ainda não está disponível"
        description="Ele é liberado de acordo com as regras da campanha. Volte depois do encerramento da votação ou da confirmação do vencedor."
      />
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <Skeleton className="h-6 w-40" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        <span className="sr-only">Carregando o ranking…</span>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <ListOrdered size={18} className="text-primary" aria-hidden="true" />
          Ranking
        </h2>
        <TourButton onClick={tour.start} />
      </div>

      <div data-tutorial="camp-ranking" className="space-y-2">
        <Badge
          className={cn(
            "gap-1.5 border text-[11px] font-semibold",
            data.official
              ? "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
              : "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300",
          )}
        >
          {data.official ? <ShieldCheck size={12} aria-hidden="true" /> : <Hourglass size={12} aria-hidden="true" />}
          {data.official ? "Resultado oficial" : "Parcial"}
        </Badge>
        {!data.official && (
          <p className="text-xs text-muted-foreground">Contagem parcial: pode mudar até a confirmação oficial do vencedor.</p>
        )}
      </div>

      {data.items.length === 0 ? (
        <EmptyState icon={<ListOrdered size={22} aria-hidden="true" />} title="Ainda não há receitas no ranking" />
      ) : (
        <RankingList items={data.items} votedId={state.voted_submission_id} />
      )}
    </motion.div>
  );
}
