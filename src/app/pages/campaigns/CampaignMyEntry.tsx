import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle2, ChevronDown, ClipboardList, Pencil, Plus } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/skeleton";
import { SubmissionStatus } from "../../components/campaigns/SubmissionStatus";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { RecipePhotos, RecipeText } from "../../components/campaigns/RecipeBody";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { cn } from "../../lib/utils";
import { fmtDateTime, plural } from "../../lib/campaigns/format";
import { MYENTRY_TOUR } from "../../lib/campaigns/tours-collab";
import type { CollabState, MySubmission, MySubmissions } from "../../lib/campaigns/types";

type Payload = MySubmissions;

/**
 * Minhas receitas: tudo o que a pessoa enviou nesta campanha (uma, ou várias se a campanha permitir),
 * com a situação de cada uma, o motivo quando não foi aprovada e o caminho para enviar/editar.
 */
export function CampaignMyEntry() {
  const { campaign, state: ctxState, slug } = useCampaignCtx();
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = `/campanhas/${slug}`;
  const api = `/campaigns/${encodeURIComponent(slug)}`;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Receitas com o texto completo aberto (ingredientes e modo de preparo).
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await campaignsApi.get<Payload>(`${api}/my-submissions`));
    } catch (e) {
      // Plano B: servidor ainda sem a rota nova → usa a rota de uma receita só.
      if (e instanceof CampaignApiError && e.status === 404 && e.code === "NOT_FOUND") {
        try {
          const r = await campaignsApi.get<{ submission: MySubmission | null; state: CollabState; my_vote: Payload["my_vote"] }>(`${api}/my-submission`);
          const items = r.submission ? [r.submission] : [];
          setData({ items, count: items.length, max: 1, can_submit_more: !!r.state.can_submit, state: r.state, my_vote: r.my_vote });
          return;
        } catch (e2) { e = e2; }
      }
      setError(errMsg(e, "Não foi possível carregar as suas receitas."));
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  // Abre sozinha uma vez; o botão "Ver tour" existe em todos os estados da tela.
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "myentry", campaign.id, ctxState.tour?.version),
    enabled: !!ctxState.tour?.enabled && !!user && !!data,
  });

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <span className="sr-only">Carregando as suas receitas…</span>
      </div>
    );
  }

  const { items, state, my_vote: vote } = data;
  const max = data.max || 1;
  const multi = max > 1 || campaign.features.multiple_submissions === true;
  const hasVoting = !!campaign.features.voting;
  const canSendMore = data.can_submit_more;
  // Edição é por receita: só enquanto as inscrições estão abertas e a receita ainda não foi aprovada.
  const regOpen = !!state.released && state.registration === "open" && state.stage !== "closed";
  const canEdit = (s: MySubmission) => (multi ? regOpen && s.status !== "approved" : !!state.can_edit);
  const limitReached = multi && items.length >= max && regOpen;

  const newButton = (
    <Button
      size="lg"
      data-tutorial="camp-new-recipe"
      onClick={() => navigate(`${base}/enviar`)}
      className="h-14 w-full gap-2 rounded-2xl text-base font-bold"
    >
      <Plus size={18} aria-hidden="true" />
      {items.length === 0 ? "Enviar minha receita" : "Enviar outra receita"}
    </Button>
  );

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">Minhas receitas</h2>
          <TourButton onClick={tour.start} />
        </div>
        <EmptyState
          icon={<ClipboardList size={22} aria-hidden="true" />}
          title="Você ainda não enviou receitas"
          description={canSendMore ? (campaign.features.photos !== false ? "Escreva os ingredientes e o modo de preparo e envie uma foto." : "Escreva os ingredientes e o modo de preparo.") : "A participação não está aberta para você agora."}
          action={
            canSendMore ? (
              <Button data-tutorial="camp-new-recipe" onClick={() => navigate(`${base}/enviar`)} className="h-12 gap-2 rounded-xl px-6">
                <Plus size={18} aria-hidden="true" /> Enviar minha receita
              </Button>
            ) : (
              <Button variant="outline" onClick={() => navigate(base)} className="h-11 rounded-xl px-5">Voltar à campanha</Button>
            )
          }
        />
        <CampaignTour steps={MYENTRY_TOUR} tour={tour} />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">Minhas receitas</h2>
          {multi && <p className="text-xs text-muted-foreground">{items.length} de {plural(max, "receita", "receitas")}</p>}
        </div>
        <TourButton onClick={tour.start} />
      </div>

      {items.map((s, i) => {
        const editable = canEdit(s);
        const isOpen = !!openIds[s.id];
        return (
          <section key={s.id} className="space-y-3" aria-label={`Receita ${s.dish_name}`}>
            <RecipePhotos media={s.media} alt={s.dish_name} />
            <div className="space-y-1">
              <h3 className="text-xl font-bold leading-tight text-foreground">{s.dish_name}</h3>
              <p className="text-xs text-muted-foreground">Enviada por você</p>
            </div>

            {isOpen && <RecipeText story={s.description} ingredients={s.ingredients} preparation={s.preparation} />}
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenIds((o) => ({ ...o, [s.id]: !o[s.id] }))}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {isOpen ? "Esconder a receita" : "Ver receita completa"}
              <ChevronDown size={16} className={cn("transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
            </button>

            <SubmissionStatus status={s.status} submittedAt={s.submitted_at} reviewedAt={s.reviewed_at} reason={s.rejection_reason} canEdit={editable} />

            {editable && (
              <Button
                size="lg"
                variant={s.status === "rejected" || s.status === "pending_media" ? "primary" : "outline"}
                data-tutorial={i === 0 ? "camp-edit" : undefined}
                onClick={() => navigate(`${base}/enviar/${s.id}`)}
                className="h-14 w-full gap-2 rounded-2xl text-base font-bold"
              >
                <Pencil size={18} aria-hidden="true" />
                {s.status === "pending_media" ? "Terminar o envio" : s.status === "rejected" ? "Corrigir e reenviar" : "Editar receita"}
              </Button>
            )}
          </section>
        );
      })}

      {canSendMore && newButton}
      {limitReached && !canSendMore && (
        <p role="note" className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          Você chegou ao limite de {plural(max, "receita", "receitas")} nesta campanha.
        </p>
      )}

      {hasVoting && vote && (
        <p className="flex items-start gap-2 rounded-2xl bg-green-50 p-4 text-sm text-green-900 dark:bg-green-950/20 dark:text-green-100">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Você votou em <strong>“{vote.dish_name}”</strong>
            {vote.at ? ` — ${fmtDateTime(vote.at)}` : ""}.
          </span>
        </p>
      )}

      <CampaignTour steps={MYENTRY_TOUR} tour={tour} />
    </motion.div>
  );
}
