import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Clock, Lock, PauseCircle, ShieldCheck, User, UtensilsCrossed, Vote, Flag } from "lucide-react";
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
import { fmtDateTime, plural } from "../../lib/campaigns/format";
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

  // Abre sozinha uma vez, quando a votação está aberta (é quando as regras e o botão Votar existem na tela).
  // O botão "Ver tour" fica sempre visível e, fora desse período, explica a tela.
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "vote", campaign.id, ctxState.tour?.version),
    enabled: !!ctxState.tour?.enabled && !!user && !!data && data.state.voting === "open",
  });

  const confirm = async () => {
    if (!pick || inflight.current) return;
    inflight.current = true;
    setVoting(true);
    try {
      const r = await campaignsApi.post<{ created_at: string; dish_name: string }>(`${api}/votes`, { submission_id: pick.id, confirm: true });
      setPick(null);
      toast.success(`Voto registrado em ${fmtDateTime(r.created_at)}.`);
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

  const firstVotableId = useMemo(
    () => data?.candidates.find((c) => !c.mine)?.id ?? null,
    [data],
  );

  if (error) return <ErrorState message={error} onRetry={() => void load(false)} />;

  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-28 w-full rounded-3xl" />
        {[0, 1].map((i) => <Skeleton key={i} className="h-32 w-full rounded-3xl" />)}
        <span className="sr-only">Carregando a votação…</span>
      </div>
    );
  }

  const { state, candidates, voting: stage } = data;
  const phase = state.voting ?? "unset";
  const hasVoted = !!state.has_voted;
  const canVoteNow = phase === "open" && !hasVoted && !!state.can_vote;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">Votação</h2>
        <TourButton onClick={tour.start} />
      </div>

      {phase === "unset" && (
        <EmptyState icon={<Clock size={22} aria-hidden="true" />} title="A votação ainda não tem data definida" description="Assim que a data for definida, ela aparece aqui." />
      )}
      {phase === "upcoming" && (
        <EmptyState
          icon={<Clock size={22} aria-hidden="true" />}
          title="A votação ainda não começou"
          description={stage?.starts_at ? `Ela começa em ${fmtDateTime(stage.starts_at)} (horário de Brasília).` : "Em breve você poderá votar na sua receita favorita."}
        />
      )}
      {phase === "paused" && (
        <Card role="status" className="rounded-3xl border-yellow-200 bg-yellow-50 p-4 hover:shadow-sm dark:border-yellow-900/50 dark:bg-yellow-950/20">
          <p className="flex items-start gap-2 text-sm font-medium text-yellow-900 dark:text-yellow-100">
            <PauseCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>A votação está em pausa no momento. Volte mais tarde para votar.</span>
          </p>
        </Card>
      )}
      {phase === "closed" && (
        <Card role="status" className="rounded-3xl p-4 hover:shadow-sm">
          <p className="flex items-start gap-2 text-sm font-medium text-foreground">
            <Flag size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span>A votação foi encerrada. Aguarde a divulgação do resultado.</span>
          </p>
        </Card>
      )}

      {phase === "open" && (
        <Card className="rounded-3xl p-5 hover:shadow-sm" data-tutorial="camp-vote-rules">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck size={14} className="text-primary" aria-hidden="true" />
            Como funciona
          </p>
          <ul className="space-y-2 text-sm text-foreground">
            <li className="flex gap-2.5"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span><strong>1 voto por pessoa.</strong></span></li>
            <li className="flex gap-2.5"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>O voto é <strong>definitivo</strong>: depois de confirmado não pode ser alterado.</span></li>
            <li className="flex gap-2.5"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>Não é possível votar na <strong>própria receita</strong>.</span></li>
          </ul>
          {stage?.ends_at && <p className="mt-3 text-xs text-muted-foreground">A votação termina em {fmtDateTime(stage.ends_at)} (horário de Brasília).</p>}
        </Card>
      )}

      {hasVoted && (
        <Card role="status" className="rounded-3xl border-green-200 bg-green-50 p-4 hover:shadow-sm dark:border-green-900/50 dark:bg-green-950/20">
          <p className="flex items-start gap-2 text-sm font-medium text-green-900 dark:text-green-100">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>Seu voto foi registrado{state.voted_at ? ` em ${fmtDateTime(state.voted_at)}` : ""}. Obrigado por participar!</span>
          </p>
        </Card>
      )}

      {candidates.length > 0 && (
        <section className="space-y-3" aria-label="Receitas concorrentes">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{plural(candidates.length, "receita concorrente", "receitas concorrentes")}</p>
          {candidates.map((c) => (
            <Card key={c.id} className={cn("overflow-hidden rounded-3xl hover:shadow-sm", c.voted && "border-primary/50 ring-1 ring-primary/30")}>
              <div className="flex gap-3 p-3">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-muted">
                  {c.photo_url ? (
                    <img src={c.photo_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-100 to-amber-100 text-orange-400 dark:from-orange-950/40 dark:to-amber-950/30">
                      <UtensilsCrossed size={26} aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold leading-snug text-foreground">{c.dish_name}</p>
                    {c.voted && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Seu voto</span>}
                  </div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><User size={11} aria-hidden="true" /> {c.mine ? "Você" : c.author}</p>
                  {c.description && <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>}
                </div>
              </div>
              {(state.gallery_visible || canVoteNow) && (
                <div className="flex items-center gap-2 border-t border-border/60 p-3">
                  {state.gallery_visible && (
                    <Link
                      to={`/campanhas/${slug}/receitas/${c.id}`}
                      className="inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      Ver receita
                    </Link>
                  )}
                  {canVoteNow && (
                    c.mine ? (
                      <Button disabled variant="secondary" className="ml-auto h-11 gap-2 rounded-xl px-4" aria-label="Você não pode votar na sua própria receita">
                        <Lock size={14} aria-hidden="true" /> Sua receita
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setPick(c)}
                        disabled={voting}
                        data-tutorial={c.id === firstVotableId ? "camp-vote-button" : undefined}
                        className="ml-auto h-11 gap-2 rounded-xl px-5 font-bold"
                        aria-label={`Votar em ${c.dish_name}`}
                      >
                        <Vote size={16} aria-hidden="true" /> Votar
                      </Button>
                    )
                  )}
                </div>
              )}
            </Card>
          ))}
        </section>
      )}

      {phase === "open" && candidates.length === 0 && (
        <EmptyState icon={<UtensilsCrossed size={22} aria-hidden="true" />} title="Ainda não há receitas para votar" description="Assim que houver receitas aprovadas, elas aparecem aqui." />
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
