import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Clock, Flag, Lock, PauseCircle, User, UtensilsCrossed, Vote } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/skeleton";
import { VoteConfirmDialog } from "../../components/campaigns/VoteConfirmDialog";
import { PartialRanking } from "../../components/campaigns/PartialRanking";
import { RecipePhoto } from "../../components/campaigns/RecipePhoto";
import { GalleryRecipeSheet, useRecipeSheetParam } from "../../components/campaigns/RecipeSheet";
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

/**
 * Votação do colaborador: escolher (toque na receita), votar (botão claro), confirmar (diálogo) e ver a confirmação.
 * Ranking, contagem de votos e posição só aparecem se o administrador liberar o parcial (`ranking_partial`),
 * sempre rotulado "Parcial — ainda pode mudar". Por padrão: só as receitas e o próprio voto.
 */
export function CampaignVote() {
  const { campaign, state: ctxState, refresh, slug } = useCampaignCtx();
  const { user } = useAuth();
  const api = `/campaigns/${encodeURIComponent(slug)}`;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VoteCandidate | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voting, setVoting] = useState(false);
  const [justVoted, setJustVoted] = useState(false);
  // "Ver receita completa" abre a folha (na URL: o "voltar" do celular fecha a folha).
  const [openId, setOpenId] = useRecipeSheetParam();
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
    if (!selected || inflight.current) return;
    inflight.current = true;
    setVoting(true);
    try {
      await campaignsApi.post<{ created_at: string; dish_name: string }>(`${api}/votes`, { submission_id: selected.id, confirm: true });
      setJustVoted(true);
      toast.success("Voto registrado!");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setConfirmOpen(false);
      setSelected(null);
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
  const ownLabel = campaign.features.multiple_submissions ? "Suas receitas" : "Sua receita";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={cn("space-y-4", canVoteNow && "pb-24")}>
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
      {phase === "closed" && !hasVoted && (
        <Card role="status" className="rounded-2xl p-4 hover:shadow-sm">
          <p className="flex items-start gap-2 text-sm font-medium text-foreground">
            <Flag size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span>Votação encerrada. O resultado será divulgado aqui.</span>
          </p>
        </Card>
      )}

      {/* Já votou: confirmação objetiva (a mesma depois de recarregar a tela) */}
      {hasVoted && (
        <Card
          role="status"
          className={cn("rounded-2xl border-green-200 bg-green-50 p-4 hover:shadow-sm dark:border-green-900/50 dark:bg-green-950/20", justVoted && "ring-2 ring-green-300 dark:ring-green-800")}
          data-tutorial="camp-vote-rules"
        >
          <p className="flex items-start gap-2.5 text-green-900 dark:text-green-100">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="space-y-0.5 text-sm">
              <span className="block text-base font-bold">Voto registrado</span>
              <span className="block">
                {votedFor ? <>Você votou em <strong>“{votedFor.dish_name}”</strong>.</> : "Seu voto foi registrado."}
                {state.voted_at ? ` ${fmtDateTime(state.voted_at)}.` : ""}
              </span>
              <span className="block text-xs opacity-80">O voto é definitivo. Obrigado por participar!</span>
            </span>
          </p>
        </Card>
      )}

      {phase === "open" && !hasVoted && (
        <p className="text-sm text-muted-foreground" data-tutorial="camp-vote-rules">
          Escolha <strong className="text-foreground">uma</strong> receita. O voto é definitivo e não vale {campaign.features.multiple_submissions ? "nas suas receitas" : "na sua receita"}
          {stage?.ends_at ? ` · até ${fmtDateTime(stage.ends_at)}` : ""}.
        </p>
      )}

      {candidates.length > 0 && (
        <section className="grid grid-cols-2 gap-3" aria-label="Receitas" role={canVoteNow ? "radiogroup" : undefined}>
          {candidates.map((c) => {
            const isSel = selected?.id === c.id;
            const selectable = canVoteNow && !c.mine;
            const photo = (
              <RecipePhoto src={c.photo_url} variant="tile">
                {c.voted && (
                  <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow">Seu voto</span>
                )}
                {c.mine && !c.voted && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground shadow">
                    <Lock size={10} aria-hidden="true" /> {ownLabel}
                  </span>
                )}
                {selectable && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow transition-all",
                      isSel ? "border-primary bg-primary text-primary-foreground" : "border-white/90 bg-black/25 text-transparent",
                    )}
                  >
                    <CheckCircle2 size={16} />
                  </span>
                )}
              </RecipePhoto>
            );
            const body = (
              <div className="space-y-0.5 p-3 text-left">
                <p className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{c.dish_name}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <User size={11} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{c.mine ? "Você" : c.author}</span>
                </p>
              </div>
            );
            return (
              <Card
                key={c.id}
                className={cn(
                  "flex flex-col overflow-hidden rounded-2xl transition-all hover:shadow-sm",
                  c.voted && "border-primary/50 ring-1 ring-primary/30",
                  isSel && "border-primary ring-2 ring-primary",
                  c.mine && canVoteNow && "opacity-70",
                )}
              >
                {selectable ? (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSel}
                    aria-label={`Escolher ${c.dish_name}, de ${c.author}`}
                    data-tutorial={c.id === firstVotableId ? "camp-vote-card" : undefined}
                    onClick={() => setSelected(isSel ? null : c)}
                    disabled={voting}
                    className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    {photo}
                    {body}
                  </button>
                ) : (
                  <>
                    {photo}
                    {body}
                  </>
                )}
                {state.gallery_visible && (
                  <button
                    type="button"
                    onClick={() => setOpenId(c.id)}
                    aria-label={`Ver a receita completa de ${c.dish_name}`}
                    className="mx-3 mb-3 mt-auto min-h-9 rounded-lg py-1 text-center text-xs font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    Ver receita completa
                  </button>
                )}
              </Card>
            );
          })}
        </section>
      )}

      {state.ranking_visible && state.ranking_partial && <PartialRanking slug={slug} votedId={state.voted_submission_id} />}

      {phase === "open" && candidates.length === 0 && (
        <EmptyState icon={<UtensilsCrossed size={22} aria-hidden="true" />} title="Ainda não há receitas para votar" description="Quando houver receitas aprovadas, elas aparecem aqui." />
      )}

      {/* Barra de votar: sempre à vista enquanto dá para votar. Desenhada no <body> com position:fixed porque o
          contêiner principal do app tem overflow-x:hidden (isso desativa `sticky`) e o conteúdo anima com transform. */}
      {canVoteNow && candidates.some((c) => !c.mine) && createPortal(
        <div className="fixed inset-x-0 bottom-[4.75rem] z-30 px-4 md:bottom-4" data-campaign-vote-bar>
          <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
            {selected ? (
              <Button size="lg" data-tutorial="camp-vote-submit" onClick={() => setConfirmOpen(true)} disabled={voting} className="h-14 w-full gap-2 rounded-xl text-base font-bold">
                <Vote size={18} aria-hidden="true" />
                <span className="truncate">Votar em “{selected.dish_name}”</span>
              </Button>
            ) : (
              <p className="py-3 text-center text-sm font-medium text-muted-foreground">Toque na receita que você quer escolher.</p>
            )}
          </div>
        </div>,
        document.body,
      )}

      <GalleryRecipeSheet slug={slug} id={openId} onClose={() => setOpenId(null)} onChanged={async () => { await Promise.all([load(true), refresh()]); }} />

      <VoteConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        dishName={selected?.dish_name ?? ""}
        loading={voting}
        onConfirm={() => void confirm()}
      />

      <CampaignTour steps={VOTE_TOUR} tour={tour} />
    </motion.div>
  );
}
