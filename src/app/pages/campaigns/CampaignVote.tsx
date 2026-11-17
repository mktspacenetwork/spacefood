import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Clock, Flag, Lock, PauseCircle, User, UtensilsCrossed, Vote } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/skeleton";
import { VoteConfirmDialog } from "../../components/campaigns/VoteConfirmDialog";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, errMsg } from "../../lib/campaigns/api";
import { fmtDateTime } from "../../lib/campaigns/format";
import { VOTE_TOUR } from "../../lib/campaigns/tours-collab";
import { cn } from "../../lib/utils";
import type { AdminStageRow, CollabState, VoteCandidate } from "../../lib/campaigns/types";

type Payload = { state: CollabState; candidates: VoteCandidate[]; voting: AdminStageRow | null };

export function CampaignVote() {
  const { campaign, state: ctxState, refresh, slug } = useCampaignCtx();
  const { user } = useAuth();
  const api = `/campaigns/${encodeURIComponent(slug)}`;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<VoteCandidate | null>(null);
  const [voting, setVoting] = useState(false);
  const inflight = useRef(false);

  const load = useCallback(
    async (silent: boolean) => {
      if (!silent) { setError(null); setData(null); }
      try {
        setData(await campaignsApi.get<Payload>(`${api}/vote`));
      } catch (e) {
        if (!silent) setError(errMsg(e, "Não foi possível carregar a votação."));
      }
    },
    [api],
  );

  useEffect(() => { void load(false); }, [load]);

  // Abre sozinha uma vez, quando a votação está aberta; "Ver tour" fica sempre visível.
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "vote", campaign.id, ctxState.tour?.version),
    enabled: !!ctxState.tour?.enabled && !!user && !!data && data.state.voting === "open",
  });

  const confirm = async () => {
    if (!pick || inflight.current) return;
    inflight.current = true;
    setVoting(true);
    try {
      await campaignsApi.post<{ created_at: string; dish_name: string }>(`${api}/votes`, { submission_id: pick.id, confirm: true });
      setPick(null);
      toast.success("Voto registrado!");
    } catch (e) {
      setPick(null);
      toast.error(errMsg(e));
    } finally {
      inflight.current = false;
      setVoting(false);
      // Em sucesso ou erro, o servidor é a fonte da verdade: recarrega a votação e o estado da campanha.
      await Promise.all([load(true), refresh()]);
    }
  };

  const firstVotableId = useMemo(() => data?.candidates.find((c) => !c.mine)?.id ?? null, [data]);

  if (error) return <ErrorState message={error} onRetry={() => void load(false)} />;

  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-52 w-full rounded-2xl" />)}
        </div>
        <span className="sr-only">Carregando a votação…</span>
      </div>
    );
  }

  const { state, candidates, voting: stage } = data;
  const phase = state.voting ?? "unset";
  const hasVoted = !!state.has_voted;
  const canVoteNow = phase === "open" && !hasVoted && !!state.can_vote;
  const votedFor = candidates.find((c) => c.voted);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">Votação</h2>
        <TourButton onClick={tour.start} />
      </div>

      {phase === "unset" && <EmptyState icon={<Clock size={22} aria-hidden="true" />} title="A votação ainda não tem data" />}
      {phase === "upcoming" && (
        <EmptyState
          icon={<Clock size={22} aria-hidden="true" />}
          title="A votação ainda não começou"
          description={stage?.starts_at ? `Começa em ${fmtDateTime(stage.starts_at)}.` : undefined}
        />
      )}
      {phase === "paused" && (
        <Card role="status" className="rounded-2xl border-yellow-200 bg-yellow-50 p-4 hover:shadow-sm dark:border-yellow-900/50 dark:bg-yellow-950/20">
          <p className="flex items-start gap-2 text-sm font-medium text-yellow-900 dark:text-yellow-100">
            <PauseCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>A votação está em pausa. Volte mais tarde.</span>
          </p>
        </Card>
      )}
      {phase === "closed" && (
        <Card role="status" className="rounded-2xl p-4 hover:shadow-sm">
          <p className="flex items-start gap-2 text-sm font-medium text-foreground">
            <Flag size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span>Votação encerrada. O resultado será divulgado aqui.</span>
          </p>
        </Card>
      )}

      {phase === "open" && !hasVoted && (
        <p className="text-xs text-muted-foreground" data-tutorial="camp-vote-rules">
          1 voto por pessoa, definitivo e não vale na própria receita
          {stage?.ends_at ? ` · até ${fmtDateTime(stage.ends_at)}` : ""}.
        </p>
      )}

      {hasVoted && (
        <Card role="status" className="rounded-2xl border-green-200 bg-green-50 p-4 hover:shadow-sm dark:border-green-900/50 dark:bg-green-950/20" data-tutorial={phase !== "open" ? "camp-vote-rules" : undefined}>
          <p className="flex items-start gap-2 text-sm font-medium text-green-900 dark:text-green-100">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{votedFor ? <>Você votou em <strong>“{votedFor.dish_name}”</strong>.</> : "Seu voto foi registrado."}</span>
          </p>
        </Card>
      )}

      {candidates.length > 0 && (
        <section className="grid grid-cols-2 gap-3" aria-label="Receitas">
          {candidates.map((c) => {
            const photo = (
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                {c.photo_url ? (
                  <img src={c.photo_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-100 to-amber-100 text-orange-400 dark:from-orange-950/40 dark:to-amber-950/30">
                    <UtensilsCrossed size={28} aria-hidden="true" />
                  </div>
                )}
                {c.voted && (
                  <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow">Seu voto</span>
                )}
              </div>
            );
            return (
              <Card key={c.id} className={cn("flex flex-col overflow-hidden rounded-2xl hover:shadow-sm", c.voted && "border-primary/50 ring-1 ring-primary/30")}>
                {state.gallery_visible ? (
                  <Link to={`/campanhas/${slug}/receitas/${c.id}`} aria-label={`Ver a receita ${c.dish_name}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    {photo}
                  </Link>
                ) : photo}
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{c.dish_name}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <User size={11} aria-hidden="true" className="shrink-0" />
                      <span className="truncate">{c.mine ? "Você" : c.author}</span>
                    </p>
                  </div>
                  {canVoteNow && (
                    c.mine ? (
                      <Button disabled variant="secondary" className="h-11 w-full gap-1.5 rounded-xl text-sm" aria-label="Você não pode votar na sua própria receita">
                        <Lock size={13} aria-hidden="true" /> Sua receita
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setPick(c)}
                        disabled={voting}
                        data-tutorial={c.id === firstVotableId ? "camp-vote-button" : undefined}
                        className="h-11 w-full gap-1.5 rounded-xl text-sm font-bold"
                        aria-label={`Votar em ${c.dish_name}`}
                      >
                        <Vote size={15} aria-hidden="true" /> Votar
                      </Button>
                    )
                  )}
                </div>
              </Card>
            );
          })}
        </section>
      )}

      {phase === "open" && candidates.length === 0 && (
        <EmptyState icon={<UtensilsCrossed size={22} aria-hidden="true" />} title="Ainda não há receitas para votar" description="Quando houver receitas aprovadas, elas aparecem aqui." />
      )}

      <VoteConfirmDialog
        open={!!pick}
        onOpenChange={(o) => { if (!o) setPick(null); }}
        dishName={pick?.dish_name ?? ""}
        loading={voting}
        onConfirm={() => void confirm()}
      />

      <CampaignTour steps={VOTE_TOUR} tour={tour} />
    </motion.div>
  );
}
