import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, CheckCircle2, ClipboardList, Lock, Pencil, Send, Vote } from "lucide-react";
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

  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "myentry", campaign.id, ctxState.tour?.version),
    enabled: !!ctxState.tour?.enabled && !!user && !!data?.submission,
  });

  const photos = useMemo(() => {
    const list = (data?.submission?.media ?? []).filter((m) => m.kind !== "video" && m.url);
    return [...list.filter((m) => m.kind === "main_photo"), ...list.filter((m) => m.kind === "photo")];
  }, [data]);
  const video = useMemo(() => (data?.submission?.media ?? []).find((m) => m.kind === "video" && m.url), [data]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-48 w-full rounded-3xl" />
        <span className="sr-only">Carregando a sua participação…</span>
      </div>
    );
  }

  const { submission: s, state, my_vote: vote } = data;

  if (!s) {
    return (
      <EmptyState
        icon={<ClipboardList size={22} aria-hidden="true" />}
        title="Você ainda não enviou uma receita"
        description={state.can_submit ? "Envie a sua receita para participar da campanha." : "As inscrições não estão abertas para você neste momento."}
        action={
          state.can_submit ? (
            <Button onClick={() => navigate(`${base}/enviar`)} className="h-12 gap-2 rounded-xl px-6">
              <Send size={16} aria-hidden="true" /> Enviar minha receita
            </Button>
          ) : (
            <Button variant="outline" onClick={() => navigate(base)} className="h-11 rounded-xl px-5">Voltar à campanha</Button>
          )
        }
      />
    );
  }

  const ingredients = s.ingredients.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const edited = !!s.updated_at && !!s.submitted_at && Math.abs(new Date(s.updated_at).getTime() - new Date(s.submitted_at).getTime()) > 60_000;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">Minha participação</h2>
        <TourButton onClick={tour.start} />
      </div>

      {s.status === "pending_media" && (
        <Card role="alert" className="rounded-3xl border-yellow-200 bg-yellow-50 p-4 hover:shadow-sm dark:border-yellow-900/50 dark:bg-yellow-950/20">
          <p className="flex items-start gap-2 text-sm font-medium text-yellow-900 dark:text-yellow-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>O envio das fotos ou do vídeo não foi concluído, então sua receita ainda não entrou na análise. Abra a edição para terminar o envio.</span>
          </p>
        </Card>
      )}

      <Card className="overflow-hidden rounded-3xl hover:shadow-sm">
        {photos.length > 0 && (
          <div>
            <img src={photos[0].url} alt={`Foto principal de ${s.dish_name}`} className="aspect-[4/3] w-full object-cover" />
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {photos.slice(1).map((p, i) => (
                  <img key={p.id} src={p.url} alt={`Foto ${i + 2} de ${photos.length}`} loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                ))}
              </div>
            )}
          </div>
        )}
        {video && (
          <video src={video.url} poster={photos[0]?.url} controls preload="metadata" playsInline className="aspect-video w-full bg-black" aria-label="Vídeo da sua receita" />
        )}
        <div className="space-y-1 p-5">
          <h3 className="text-xl font-bold leading-tight text-foreground">{s.dish_name}</h3>
          <p className="text-xs text-muted-foreground">
            Enviada em {fmtDateTime(s.submitted_at)}
            {edited && <> · Última edição em {fmtDateTime(s.updated_at)}</>}
          </p>
        </div>
      </Card>

      <Card className="rounded-3xl p-5 hover:shadow-sm">
        <SubmissionStatus status={s.status} submittedAt={s.submitted_at} reviewedAt={s.reviewed_at} reason={s.rejection_reason} />
      </Card>

      {state.can_edit ? (
        <Button
          size="lg"
          variant={s.status === "rejected" || s.status === "pending_media" ? "primary" : "outline"}
          data-tutorial="camp-edit"
          onClick={() => navigate(`${base}/enviar`)}
          className="h-14 w-full gap-2 rounded-2xl text-base font-bold"
        >
          <Pencil size={18} aria-hidden="true" />
          {s.status === "pending_media" ? "Concluir o envio" : s.status === "rejected" ? "Corrigir e reenviar" : "Editar receita"}
        </Button>
      ) : (
        state.locked && (
          <p className="flex items-start gap-2 rounded-2xl bg-muted/60 p-4 text-xs text-muted-foreground" role="note">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            A votação já começou, por isso a receita não pode mais ser editada.
          </p>
        )
      )}

      {vote && (
        <Card className="rounded-3xl border-green-200 bg-green-50 p-5 hover:shadow-sm dark:border-green-900/50 dark:bg-green-950/20">
          <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-300">
            <Vote size={14} aria-hidden="true" /> Seu voto
          </p>
          <p className="flex items-start gap-2 text-sm text-green-900 dark:text-green-100">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Você votou em <strong>“{vote.dish_name}”</strong>, de {vote.author}
              {vote.at ? ` — ${fmtDateTime(vote.at)}` : ""}.
            </span>
          </p>
        </Card>
      )}

      <Card className="space-y-5 rounded-3xl p-5 hover:shadow-sm">
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Descrição</p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{s.description}</p>
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Ingredientes</p>
          <ul className="space-y-1.5">
            {ingredients.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-foreground">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Modo de preparo</p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{s.preparation}</p>
        </div>
      </Card>

      <CampaignTour steps={MYENTRY_TOUR} tour={tour} />
    </motion.div>
  );
}
