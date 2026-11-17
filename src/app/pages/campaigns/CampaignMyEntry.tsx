import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle2, ClipboardList, Pencil } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/skeleton";
import { SubmissionStatus } from "../../components/campaigns/SubmissionStatus";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, errMsg } from "../../lib/campaigns/api";
import { fmtDateTime } from "../../lib/campaigns/format";
import { MYENTRY_TOUR } from "../../lib/campaigns/tours-collab";
import type { CollabState, MySubmission } from "../../lib/campaigns/types";

type Payload = {
  submission: MySubmission | null;
  state: CollabState;
  my_vote: { dish_name: string; author: string; at: string | null } | null;
};

export function CampaignMyEntry() {
  const { campaign, state: ctxState, slug } = useCampaignCtx();
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = `/campanhas/${slug}`;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await campaignsApi.get<Payload>(`/campaigns/${encodeURIComponent(slug)}/my-submission`));
    } catch (e) {
      setError(errMsg(e, "Não foi possível carregar a sua participação."));
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  // Abre sozinha uma vez; o botão "Ver tour" existe em todos os estados da tela.
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "myentry", campaign.id, ctxState.tour?.version),
    enabled: !!ctxState.tour?.enabled && !!user && !!data,
  });

  const photo = useMemo(() => {
    const list = (data?.submission?.media ?? []).filter((m) => m.kind !== "video" && m.url);
    return list.find((m) => m.kind === "main_photo") ?? list[0];
  }, [data]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <span className="sr-only">Carregando a sua participação…</span>
      </div>
    );
  }

  const { submission: s, state, my_vote: vote } = data;

  if (!s) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end"><TourButton onClick={tour.start} /></div>
        <EmptyState
          icon={<ClipboardList size={22} aria-hidden="true" />}
          title="Você ainda não participou"
          description={state.can_submit ? "Envie a foto da sua receita." : "As inscrições não estão abertas para você agora."}
          action={
            state.can_submit ? (
              <Button onClick={() => navigate(`${base}/enviar`)} className="h-12 rounded-xl px-6">Participar</Button>
            ) : (
              <Button variant="outline" onClick={() => navigate(base)} className="h-11 rounded-xl px-5">Voltar à campanha</Button>
            )
          }
        />
        <CampaignTour steps={MYENTRY_TOUR} tour={tour} />
      </div>
    );
  }

  const canEdit = !!state.can_edit;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">Minha receita</h2>
        <TourButton onClick={tour.start} />
      </div>

      <Card className="overflow-hidden rounded-3xl hover:shadow-sm">
        {photo && <img src={photo.url} alt={`Foto de ${s.dish_name}`} className="aspect-[4/3] w-full object-cover" />}
        <div className="space-y-1 p-4">
          <h3 className="text-xl font-bold leading-tight text-foreground">{s.dish_name}</h3>
          {s.description && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{s.description}</p>}
        </div>
      </Card>

      <SubmissionStatus status={s.status} submittedAt={s.submitted_at} reviewedAt={s.reviewed_at} reason={s.rejection_reason} canEdit={canEdit} />

      {canEdit && (
        <Button
          size="lg"
          variant={s.status === "rejected" || s.status === "pending_media" ? "primary" : "outline"}
          data-tutorial="camp-edit"
          onClick={() => navigate(`${base}/enviar`)}
          className="h-14 w-full gap-2 rounded-2xl text-base font-bold"
        >
          <Pencil size={18} aria-hidden="true" />
          {s.status === "pending_media" ? "Terminar o envio" : s.status === "rejected" ? "Corrigir e reenviar" : "Editar receita"}
        </Button>
      )}

      {vote && (
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
