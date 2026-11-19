import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Lock, Medal, Trophy, User } from "lucide-react";
import { motion } from "motion/react";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/skeleton";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { RecipePhoto } from "../../components/campaigns/RecipePhoto";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { fmtDateTime, plural } from "../../lib/campaigns/format";
import { RESULTS_TOUR } from "../../lib/campaigns/tours-collab";

type VoteResult = {
  announced_at: string | null;
  winner: { id: string; dish_name: string; author: string; description: string; votes: number | null; photo_url: string | null } | null;
  podium: { position: number; dish_name: string; author: string; votes: number }[];
  total_valid_votes: number;
};

/** O resultado ainda oculto (não divulgado) ou com dados. */
type Part = { kind: "hidden" } | { kind: "ready"; data: VoteResult };

/**
 * Resultado da campanha, só depois da divulgação oficial. Campanha sem votação não tem resultado:
 * nada vazio aparece e o item nem existe no menu.
 */
export function CampaignResults() {
  const { campaign, state, slug } = useCampaignCtx();
  const { user } = useAuth();
  const hasVoting = !!campaign.features.voting;
  const [part, setPart] = useState<Part | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setPart(null);
    if (!hasVoting) { setPart({ kind: "hidden" }); return; }
    try {
      setPart({ kind: "ready", data: await campaignsApi.get<VoteResult>(`/campaigns/${encodeURIComponent(slug)}/results`) });
    } catch (e) {
      if (e instanceof CampaignApiError && e.code === "RESULTS_HIDDEN") setPart({ kind: "hidden" });
      else setError(errMsg(e, "Não foi possível carregar o resultado."));
    }
  }, [slug, hasVoting]);

  useEffect(() => { void load(); }, [load]);

  const ready = part?.kind === "ready";
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "results", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user && ready,
  });

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!part) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-72 w-full rounded-3xl" />
        <span className="sr-only">Carregando o resultado…</span>
      </div>
    );
  }

  // "Ver tour" fica visível também enquanto o resultado não foi divulgado.
  if (part.kind === "hidden") {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <TourButton onClick={tour.start} />
        </div>
        <EmptyState
          icon={<Lock size={22} aria-hidden="true" />}
          title={hasVoting ? "Resultado ainda não divulgado" : "Esta campanha não tem resultado a divulgar"}
          description={hasVoting ? "Ele aparece aqui quando for divulgado." : undefined}
        />
        <CampaignTour steps={RESULTS_TOUR} tour={tour} />
      </div>
    );
  }

  const v = part.data;
  const w = v.winner;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Trophy size={18} className="text-amber-500" aria-hidden="true" />
          Resultado
        </h2>
        <TourButton onClick={tour.start} />
      </div>

      {!w ? (
        <EmptyState icon={<Trophy size={22} aria-hidden="true" />} title="Não houve receita vencedora nesta campanha" />
      ) : (
        <Card data-tutorial="camp-winner" className="overflow-hidden rounded-3xl border-amber-300 shadow-lg shadow-amber-500/10 hover:shadow-lg dark:border-amber-700">
          <RecipePhoto src={w.photo_url} alt={`Foto da receita vencedora ${w.dish_name}`} variant="tile" eager>
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md">
              <Trophy size={14} aria-hidden="true" /> Receita vencedora
            </span>
          </RecipePhoto>
          <div className="space-y-2 p-5">
            <h3 className="text-2xl font-bold leading-tight text-foreground">{w.dish_name}</h3>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><User size={14} aria-hidden="true" /> {w.author}</p>
            {w.votes !== null && <p className="text-sm font-semibold text-foreground">{plural(w.votes, "voto", "votos")}</p>}
            {w.description && <p className="line-clamp-4 whitespace-pre-line pt-1 text-sm leading-relaxed text-muted-foreground">{w.description}</p>}
            {state.gallery_visible && (
              <Link
                to={`/campanhas/${slug}/receitas/${w.id}`}
                className="mt-2 inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Ver a receita completa
              </Link>
            )}
          </div>
        </Card>
      )}

      {v.podium.length > 0 && (
        <Card className="rounded-3xl p-5 hover:shadow-sm">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Medal size={14} className="text-primary" aria-hidden="true" /> Pódio
          </p>
          <ol className="space-y-3">
            {v.podium.map((p) => (
              <li key={p.position} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-extrabold text-foreground" aria-label={`${p.position}º lugar`}>{p.position}º</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{p.dish_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.author}</p>
                </div>
                <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">{plural(p.votes, "voto", "votos")}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {state.ranking_visible && (
        <Link
          to={`/campanhas/${slug}/ranking`}
          className="flex h-12 items-center justify-center rounded-2xl border border-border text-sm font-semibold text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Ver classificação
        </Link>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {plural(v.total_valid_votes, "voto válido", "votos válidos")}
        {v.announced_at ? ` · Resultado divulgado em ${fmtDateTime(v.announced_at)}` : ""}
      </p>

      <CampaignTour steps={RESULTS_TOUR} tour={tour} />
    </motion.div>
  );
}
