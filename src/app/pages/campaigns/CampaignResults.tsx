import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Lock, Medal, PartyPopper, Sparkles, Trophy, User, UtensilsCrossed } from "lucide-react";
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
import type { CollabDraw } from "../../lib/campaigns/types";

type VoteResult = {
  announced_at: string | null;
  winner: { id: string; dish_name: string; author: string; description: string; votes: number | null; photo_url: string | null } | null;
  podium: { position: number; dish_name: string; author: string; votes: number }[];
  total_valid_votes: number;
};

/** Cada parte do resultado: ainda oculta (não divulgada), com dados, ou ausente (a campanha não tem essa parte). */
type Part<T> = { kind: "none" } | { kind: "hidden" } | { kind: "ready"; data: T };

/**
 * Resultado da campanha, só depois da divulgação oficial.
 * Mostra a votação (vencedor) e/ou o sorteio (ganhadores), conforme o que a campanha tem; nada vazio aparece.
 */
export function CampaignResults() {
  const { campaign, state, slug } = useCampaignCtx();
  const { user } = useAuth();
  const hasVoting = !!campaign.features.voting;
  const hasDraw = !!campaign.features.draw;
  const [vote, setVote] = useState<Part<VoteResult> | null>(null);
  const [draw, setDraw] = useState<Part<CollabDraw> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setVote(null);
    setDraw(null);
    const api = `/campaigns/${encodeURIComponent(slug)}`;
    const fetchPart = async <T,>(on: boolean, path: string, hiddenCode: string): Promise<Part<T>> => {
      if (!on) return { kind: "none" };
      try {
        return { kind: "ready", data: await campaignsApi.get<T>(`${api}/${path}`) };
      } catch (e) {
        if (e instanceof CampaignApiError && e.code === hiddenCode) return { kind: "hidden" };
        throw e;
      }
    };
    try {
      const [v, d] = await Promise.all([
        fetchPart<VoteResult>(hasVoting, "results", "RESULTS_HIDDEN"),
        fetchPart<CollabDraw>(hasDraw, "draw", "DRAW_HIDDEN"),
      ]);
      setVote(v);
      setDraw(d);
    } catch (e) {
      setError(errMsg(e, "Não foi possível carregar o resultado."));
    }
  }, [slug, hasVoting, hasDraw]);

  useEffect(() => { void load(); }, [load]);

  const anyReady = vote?.kind === "ready" || draw?.kind === "ready";
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "results", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user && anyReady,
  });

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!vote || !draw) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-72 w-full rounded-3xl" />
        <span className="sr-only">Carregando o resultado…</span>
      </div>
    );
  }

  // "Ver tour" fica visível também enquanto o resultado não foi divulgado.
  if (!anyReady) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <TourButton onClick={tour.start} />
        </div>
        <EmptyState
          icon={<Lock size={22} aria-hidden="true" />}
          title={hasVoting || hasDraw ? "Resultado ainda não divulgado" : "Esta campanha não tem resultado a divulgar"}
          description={hasVoting || hasDraw ? "Ele aparece aqui quando for divulgado." : undefined}
        />
        <CampaignTour steps={RESULTS_TOUR} tour={tour} />
      </div>
    );
  }

  const v = vote.kind === "ready" ? vote.data : null;
  const d = draw.kind === "ready" ? draw.data : null;
  const w = v?.winner ?? null;
  const announcedAt = v?.announced_at ?? d?.announced_at ?? null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Trophy size={18} className="text-amber-500" aria-hidden="true" />
          Resultado
        </h2>
        <TourButton onClick={tour.start} />
      </div>

      {d?.i_won && (
        <Card role="status" className="rounded-3xl border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-5 text-center hover:shadow-sm dark:border-amber-700 dark:from-amber-950/30 dark:to-orange-950/20">
          <PartyPopper size={34} className="mx-auto text-amber-500" aria-hidden="true" />
          <p className="mt-2 text-xl font-extrabold text-foreground">Você foi sorteado!</p>
          <p className="mt-1 text-sm text-muted-foreground">Parabéns! A equipe vai entrar em contato com você.</p>
        </Card>
      )}

      {v && (
        !w ? (
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
        )
      )}

      {v && v.podium.length > 0 && (
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

      {v && state.ranking_visible && (
        <Link
          to={`/campanhas/${slug}/ranking`}
          className="flex h-12 items-center justify-center rounded-2xl border border-border text-sm font-semibold text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Ver classificação
        </Link>
      )}

      {d && (
        <Card data-tutorial="camp-draw" className="rounded-3xl p-5 hover:shadow-sm">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Sparkles size={14} className="text-primary" aria-hidden="true" /> {d.winners.length === 1 ? "Sorteado" : "Sorteados"}
          </p>
          {d.winners.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma pessoa foi sorteada.</p>
          ) : (
            <ol className="space-y-3">
              {d.winners.map((p) => (
                <li key={p.position} className="flex items-center gap-3">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-extrabold text-foreground">{p.position}º</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.dish_name}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {v ? `${plural(v.total_valid_votes, "voto válido", "votos válidos")}${announcedAt ? " · " : ""}` : ""}
        {announcedAt ? `Resultado divulgado em ${fmtDateTime(announcedAt)}` : ""}
      </p>

      <CampaignTour steps={RESULTS_TOUR} tour={tour} />
    </motion.div>
  );
}
