import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle2, ClipboardList, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/skeleton";
import { RecipeTile, RecipeViewToggle, StatusBadge, useRecipeView } from "../../components/campaigns/RecipeView";
import { SubmissionStatus } from "../../components/campaigns/SubmissionStatus";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { LateBadge, LateNote, RecipePhotos, RecipeText } from "../../components/campaigns/RecipeBody";
import { RecipeSheet, VOTING_LOCKED_MSG, useRecipeSheetParam, votingLocked } from "../../components/campaigns/RecipeSheet";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { DeleteRecipeDialog } from "../../components/campaigns/DeleteRecipeDialog";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { fmtDateTime, plural } from "../../lib/campaigns/format";
import { MYENTRY_TOUR } from "../../lib/campaigns/tours-collab";
import type { CollabState, MySubmission, MySubmissions } from "../../lib/campaigns/types";

type Payload = MySubmissions;

/**
 * Minhas receitas: tudo o que a pessoa enviou nesta campanha (uma, ou várias se a campanha permitir),
 * no mesmo padrão visual de "Receitas" (cards ou lista, com selo da situação).
 * Tocar numa receita abre a folha com o texto completo, a situação, o motivo quando não foi aprovada
 * e os botões: editar (ou "Corrigir e reenviar") e, só para receita reprovada, EXCLUIR (a vaga volta e dá para enviar outra).
 */
export function CampaignMyEntry() {
  const { campaign, state: ctxState, slug, refresh } = useCampaignCtx();
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = `/campanhas/${slug}`;
  const api = `/campaigns/${encodeURIComponent(slug)}`;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Receita aberta na folha (texto completo, situação e botão de editar). Fica na URL: o "voltar" fecha a folha.
  const [selId, setSelId] = useRecipeSheetParam();
  const [view, setView] = useRecipeView();
  // Excluir a própria receita reprovada: confirmação + envio em andamento (bloqueia clique duplo).
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  // Edição é por receita: enquanto a participação está aberta, e a receita ainda não foi aprovada. Na janela de
  // "fora do prazo" (participação encerrada, resultado ainda não divulgado) só as receitas já enviadas fora do prazo.
  const live = !!state.released && state.stage !== "closed";
  const regOpen = live && state.registration === "open";
  const lateOpen = live && !!state.late_window;
  const canEdit = (s: MySubmission) =>
    multi ? s.status !== "approved" && ((regOpen && state.can_edit !== false) || (lateOpen && !!s.is_late)) : !!state.can_edit;
  // Excluir vale para receita REPROVADA, nas mesmas condições da edição (o servidor confere de novo).
  const canDelete = (s: MySubmission) => s.status === "rejected" && canEdit(s);
  // A votação começou: nada de enviar nem editar (mensagem clara no lugar de "participação não está aberta").
  const lockedByVoting = votingLocked(state);
  const limitReached = multi && items.length >= max && (regOpen || lateOpen);
  const selected = items.find((x) => x.id === selId) ?? null;
  const coverOf = (s: MySubmission) => s.media.find((m) => m.kind === "main_photo") ?? s.media.find((m) => m.kind === "photo");
  const photoOf = (s: MySubmission) => coverOf(s)?.url ?? null;

  const doDelete = async () => {
    if (!selected || deleting) return;
    setDeleting(true);
    try {
      await campaignsApi.del(`${api}/submission/${encodeURIComponent(selected.id)}`);
      setDelOpen(false);
      setSelId(null);
      toast.success("Receita excluída. Você já pode enviar uma nova receita.");
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setDelOpen(false);
      toast.error(errMsg(e, "Não foi possível excluir a receita. Tente de novo."));
      // o estado mudou (ex.: a votação começou ou a receita já não existe): recarrega para a tela refletir a realidade
      if (e instanceof CampaignApiError && (e.status === 409 || e.status === 404)) { setSelId(null); void load(); void refresh(); }
    } finally {
      setDeleting(false);
    }
  };

  const newButton = (
    <Button
      size="lg"
      data-tutorial="camp-new-recipe"
      onClick={() => navigate(`${base}/enviar`)}
      className="h-14 w-full gap-2 rounded-2xl text-base font-bold"
    >
      <Plus size={18} aria-hidden="true" />
      {items.length === 0 ? "Cadastrar receita" : "Cadastrar outra receita"}
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
          title="Você ainda não cadastrou receitas"
          description={canSendMore ? "Informe os ingredientes e o modo de preparo." : lockedByVoting ? VOTING_LOCKED_MSG : "A participação não está aberta para você agora."}
          action={
            canSendMore ? (
              <Button data-tutorial="camp-new-recipe" onClick={() => navigate(`${base}/enviar`)} className="h-12 gap-2 rounded-xl px-6">
                <Plus size={18} aria-hidden="true" /> Cadastrar receita
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

      <div className="flex justify-end">
        <RecipeViewToggle view={view} onChange={setView} />
      </div>

      <div className={view === "cards" ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "space-y-2"}>
        {items.map((s, i) => (
          <RecipeTile
            key={s.id}
            layout={view}
            title={s.dish_name}
            subtitle="Enviada por você"
            photoUrl={photoOf(s)}
            photoWeb={!!coverOf(s)?.web}
            badge={s.is_late ? (
              <span className="flex flex-col items-start gap-1"><StatusBadge status={s.status} /><LateBadge /></span>
            ) : <StatusBadge status={s.status} />}
            onClick={() => setSelId(s.id)}
            first={i === 0}
            ariaLabel={`Abrir a receita ${s.dish_name}`}
          />
        ))}
      </div>

      {lockedByVoting && !limitReached && (
        <p role="note" className="flex items-start gap-2 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{VOTING_LOCKED_MSG}</span>
        </p>
      )}
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

      <RecipeSheet
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelId(null); }}
        title={selected?.dish_name ?? "Sua receita"}
        subtitle={selected ? "Enviada por você" : undefined}
        footer={
          selected && canEdit(selected) ? (
            <div className="space-y-2">
              <Button
                size="lg"
                variant={selected.status === "rejected" || selected.status === "pending_media" ? "primary" : "outline"}
                data-tutorial="camp-edit"
                onClick={() => navigate(`${base}/enviar/${selected.id}`)}
                className="h-14 w-full gap-2 rounded-2xl text-base font-bold"
              >
                <Pencil size={18} aria-hidden="true" />
                {selected.status === "pending_media" ? "Terminar o envio" : selected.status === "rejected" ? "Corrigir e reenviar" : "Editar receita"}
              </Button>
              {canDelete(selected) && (
                <Button
                  size="lg"
                  variant="outline"
                  data-tutorial="camp-delete"
                  onClick={() => setDelOpen(true)}
                  className="h-12 w-full gap-2 rounded-2xl border-red-300 text-base font-semibold text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  <Trash2 size={18} aria-hidden="true" /> Excluir receita
                </Button>
              )}
            </div>
          ) : selected && selected.status !== "approved" && lockedByVoting ? (
            <p role="note" className="flex items-start gap-2 text-sm text-muted-foreground">
              <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{VOTING_LOCKED_MSG}</span>
            </p>
          ) : undefined
        }
      >
        {selected && (
          <>
            <RecipePhotos media={selected.media} alt={selected.dish_name} />
            {selected.is_late && <LateNote />}
            <SubmissionStatus
              status={selected.status}
              submittedAt={selected.submitted_at}
              reviewedAt={selected.reviewed_at}
              reason={selected.rejection_reason}
              canEdit={canEdit(selected)}
              canDelete={canDelete(selected)}
            />
            <RecipeText story={selected.description} ingredients={selected.ingredients} preparation={selected.preparation} />
          </>
        )}
      </RecipeSheet>

      <DeleteRecipeDialog
        open={delOpen && !!selected}
        onOpenChange={setDelOpen}
        dishName={selected?.dish_name ?? ""}
        loading={deleting}
        onConfirm={() => void doDelete()}
      />

      <CampaignTour steps={MYENTRY_TOUR} tour={tour} />
    </motion.div>
  );
}
