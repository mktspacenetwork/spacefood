import { useCallback, useEffect, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Hourglass, ListOrdered, Lock, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/skeleton";
import { RankingList } from "../../components/campaigns/RankingList";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { rankPositions, sameRanking, topCount, totalVotes, useVisibleInterval } from "../../lib/campaigns/ranking";
import { RANKING_TOUR } from "../../lib/campaigns/tours-collab";
import { TIMEZONE } from "../../lib/date-utils";
import type { RankingItem } from "../../lib/campaigns/types";

/** `partial`: o administrador liberou a classificação PARCIAL (ainda pode mudar). Sem isso, só o oficial. */
type Payload = { official: boolean; partial?: boolean; items: RankingItem[] };

export function CampaignRanking() {
  const { campaign, state, slug, refresh } = useCampaignCtx();
  const { user } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [full, setFull] = useState(false);
  const lastMode = useRef<"official" | "partial" | "hidden" | null>(null);

  // `silent` = recarga automática: não limpa a tela, não mostra carregando e ignora falhas de rede passageiras.
  const load = useCallback(async (silent: boolean) => {
    if (!silent) {
      setError(null);
      setHidden(false);
      setData(null);
    }
    let mode: "official" | "partial" | "hidden" = "hidden";
    try {
      const r = await campaignsApi.get<Payload>(`/campaigns/${encodeURIComponent(slug)}/ranking`);
      // Oficial (depois da divulgação) ou parcial liberado pelo administrador; qualquer outra coisa é tratada como oculta.
      if (!r.official && r.partial !== true) {
        setHidden(true);
        setData(null);
      } else {
        mode = r.official ? "official" : "partial";
        setHidden(false);
        setError(null);
        setData((prev) => (prev && prev.official === r.official && sameRanking(prev.items, r.items) ? prev : r));
        setUpdatedAt(new Date());
      }
    } catch (e) {
      if (e instanceof CampaignApiError && e.code === "RANKING_HIDDEN") {
        setHidden(true);
        setData(null);
      } else {
        if (!silent) setError(errMsg(e, "Não foi possível carregar o ranking."));
        return;
      }
    }
    // O administrador ligou/desligou o parcial ou o resultado foi divulgado: atualiza o menu da campanha na hora.
    if (lastMode.current !== null && lastMode.current !== mode) void refresh();
    lastMode.current = mode;
  }, [slug, refresh]);

  useEffect(() => { void load(false); }, [load]);

  // Recarga automática (só com a aba visível): a cada 30 s no parcial; a cada 60 s enquanto está oculto, para a tela
  // aparecer sozinha se a gestão liberar o ranking. O oficial não muda mais.
  useVisibleInterval(() => void load(true), hidden ? 60_000 : 30_000, hidden || (!!data && !data.official));

  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "ranking", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user && !!data,
  });

  // "Ver tour" fica visível também quando o ranking ainda não foi liberado; a tour sempre é renderizada.
  if (hidden) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <TourButton onClick={tour.start} />
        </div>
        <EmptyState
          icon={<Lock size={22} aria-hidden="true" />}
          title="O ranking ainda não está disponível"
          description="Quando a equipe liberar, ele aparece aqui. A classificação final fica em Resultado, depois da divulgação."
        />
        <CampaignTour steps={RANKING_TOUR} tour={tour} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => void load(false)} />;
  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <Skeleton className="h-6 w-40" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        <span className="sr-only">Carregando o ranking…</span>
      </div>
    );
  }

  const ranked = rankPositions(data.items);
  const anyVotes = totalVotes(data.items) > 0;
  const summary = topCount(ranked, 3, 5);
  const canExpand = data.items.length > summary;
  const listLimit = full || summary === 0 ? undefined : summary;

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
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {data.official ? (
            <Badge className="gap-1.5 border border-green-200 bg-green-100 text-[11px] font-semibold text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
              <ShieldCheck size={12} aria-hidden="true" />
              Resultado oficial
            </Badge>
          ) : (
            <Badge className="gap-1.5 border border-amber-200 bg-amber-100 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <Hourglass size={12} aria-hidden="true" />
              Parcial — ainda pode mudar
            </Badge>
          )}
          {updatedAt && !data.official && (
            <span className="text-[11px] text-muted-foreground" aria-live="off">Atualizado às {formatInTimeZone(updatedAt, TIMEZONE, "HH:mm")}</span>
          )}
        </div>
        {!data.official && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Esta é a classificação até agora e ela se atualiza sozinha. Só entram receitas aprovadas e dentro do prazo. O resultado oficial vale só depois da divulgação.
          </p>
        )}
      </div>

      {data.items.length === 0 ? (
        <EmptyState icon={<ListOrdered size={22} aria-hidden="true" />} title="Ainda não há receitas no ranking" />
      ) : (
        <div className="space-y-2">
          {!anyVotes && (
            <p className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">
              Ainda não há votos. {data.items.length === 1 ? "1 receita concorre." : `${data.items.length} receitas concorrem.`}
            </p>
          )}
          {summary > 0 && !full && <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Os primeiros colocados</p>}
          {(anyVotes || full) && <RankingList items={data.items} votedId={state.voted_submission_id} limit={listLimit} />}
          {canExpand && (
            <Button variant="ghost" className="h-11 w-full rounded-xl font-semibold text-primary" onClick={() => setFull((v) => !v)} aria-expanded={full}>
              {full ? "Mostrar só os primeiros" : `Ver classificação completa (${data.items.length})`}
            </Button>
          )}
        </div>
      )}

      <CampaignTour steps={RANKING_TOUR} tour={tour} />
    </motion.div>
  );
}
