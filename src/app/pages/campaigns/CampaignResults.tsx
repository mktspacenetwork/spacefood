import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Lock, Medal, Trophy, User, UtensilsCrossed } from "lucide-react";
import { motion } from "motion/react";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/skeleton";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { fmtDateTime, plural } from "../../lib/campaigns/format";
import { RESULTS_TOUR } from "../../lib/campaigns/tours-collab";

type Payload = {
  announced_at: string | null;
  winner: { id: string; dish_name: string; author: string; description: string; votes: number | null; photo_url: string | null } | null;
  podium: { position: number; dish_name: string; author: string; votes: number }[];
  total_valid_votes: number;
};

export function CampaignResults() {
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
      setData(await campaignsApi.get<Payload>(`/campaigns/${encodeURIComponent(slug)}/results`));
    } catch (e) {
      if (e instanceof CampaignApiError && e.code === "RESULTS_HIDDEN") setHidden(true);
      else setError(errMsg(e, "Não foi possível carregar o resultado."));
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "results", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user && !!data?.winner,
  });

  // "Ver tour" fica visível também enquanto o resultado não foi divulgado.
  if (hidden) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <TourButton onClick={tour.start} />
        </div>
        <EmptyState
          icon={<Lock size={22} aria-hidden="true" />}
          title="Resultado ainda não divulgado"
          description="Assim que a campanha divulgar o resultado oficial, ele aparece aqui."
        />
        <CampaignTour steps={RESULTS_TOUR} tour={tour} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-72 w-full rounded-3xl" />
        <span className="sr-only">Carregando o resultado…</span>
      </div>
    );
  }

  const w = data.winner;

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
          <div className="relative">
            {w.photo_url ? (
              <img src={w.photo_url} alt={`Foto da receita vencedora ${w.dish_name}`} className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-amber-300 via-orange-400 to-orange-500 text-white/90">
                <UtensilsCrossed size={54} strokeWidth={1.5} aria-hidden="true" />
              </div>
            )}
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md">
              <Trophy size={14} aria-hidden="true" /> Receita vencedora
            </span>
          </div>
          <div className="space-y-2 p-5">
            <h3 className="text-2xl font-bold leading-tight text-foreground">{w.dish_name}</h3>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><User size={14} aria-hidden="true" /> {w.author}</p>
            {w.votes !== null && <p className="text-sm font-semibold text-foreground">{plural(w.votes, "voto", "votos")}</p>}
            {w.description && <p className="whitespace-pre-line pt-1 text-sm leading-relaxed text-muted-foreground">{w.description}</p>}
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

      {data.podium.length > 0 && (
        <Card className="rounded-3xl p-5 hover:shadow-sm">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Medal size={14} className="text-primary" aria-hidden="true" /> Pódio
          </p>
          <ol className="space-y-3">
            {data.podium.map((p) => (
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

      <p className="text-center text-xs text-muted-foreground">
        {plural(data.total_valid_votes, "voto válido", "votos válidos")}
        {data.announced_at ? ` · Resultado divulgado em ${fmtDateTime(data.announced_at)}` : ""}
      </p>

      <CampaignTour steps={RESULTS_TOUR} tour={tour} />
    </motion.div>
  );
}
