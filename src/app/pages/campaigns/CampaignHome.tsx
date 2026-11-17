import { useNavigate } from "react-router";
import { ArrowRight, CheckCircle2, Clock, Megaphone, Target, ScrollText, Vote } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import { StageTimeline } from "../../components/campaigns/StageTimeline";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { HOME_TOUR } from "../../lib/campaigns/tours-collab";
import { fmtDateTime, SUBMISSION_STATUS } from "../../lib/campaigns/format";

type Cta = { label: string; to: string };

export function CampaignHome() {
  const { campaign, state, slug } = useCampaignCtx();
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = `/campanhas/${slug}`;

  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "home", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user,
  });

  // Ação do momento (a mais relevante primeiro).
  let cta: Cta | null = null;
  if (state.results_visible) cta = { label: "Ver resultado", to: `${base}/resultado` };
  else if (state.can_vote) cta = { label: "Votar agora", to: `${base}/votacao` };
  else if (state.can_submit && !state.my_submission_id) cta = { label: "Enviar minha receita", to: `${base}/enviar` };
  else if (state.my_submission_id) cta = { label: "Ver minha participação", to: `${base}/participacao` };
  else if (state.ranking_visible) cta = { label: "Ver ranking", to: `${base}/ranking` };

  const submissionStatus = state.my_submission_status ? SUBMISSION_STATUS[state.my_submission_status] : null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex justify-end">
        <TourButton onClick={tour.start} />
      </div>

      {/* Hero */}
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-muted shadow-sm">
        {campaign.cover_url ? (
          <img src={campaign.cover_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500 text-white/90">
            <Megaphone size={54} strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
      </div>

      {!state.released && (
        <Card role="status" className="rounded-3xl border-yellow-200 bg-yellow-50 p-4 hover:shadow-sm dark:border-yellow-900/50 dark:bg-yellow-950/20">
          <p className="flex items-center gap-2 text-sm font-bold text-yellow-800 dark:text-yellow-200">
            <Clock size={16} aria-hidden="true" />
            Em breve
          </p>
          <p className="mt-1 text-sm text-yellow-900/90 dark:text-yellow-100/90">
            Esta campanha ainda não foi aberta para participação.
            {campaign.visible_from ? ` Ela abre em ${fmtDateTime(campaign.visible_from)}.` : ""}
          </p>
        </Card>
      )}

      {campaign.description && (
        <Card className="rounded-3xl p-5 hover:shadow-sm">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{campaign.description}</p>
        </Card>
      )}

      {(submissionStatus || state.has_voted) && (
        <div className="flex flex-wrap gap-2" aria-label="Sua participação">
          {submissionStatus && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground">
              <ScrollText size={13} className="text-primary" aria-hidden="true" />
              Sua receita: {submissionStatus.label}
            </span>
          )}
          {state.has_voted && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground">
              <CheckCircle2 size={13} className="text-green-500" aria-hidden="true" />
              Você já votou
            </span>
          )}
        </div>
      )}

      {cta && state.released && (
        <Button size="lg" data-tutorial="camp-cta" onClick={() => navigate(cta!.to)} className="h-14 w-full gap-2 rounded-2xl text-base font-bold">
          {cta.label === "Votar agora" ? <Vote size={18} /> : null}
          {cta.label}
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
      )}

      {campaign.objective && (
        <Card className="rounded-3xl p-5 hover:shadow-sm">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Target size={14} className="text-primary" aria-hidden="true" />
            Objetivo
          </p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{campaign.objective}</p>
        </Card>
      )}

      {campaign.instructions && (
        <Card className="overflow-hidden rounded-3xl hover:shadow-sm">
          <Accordion type="single" collapsible>
            <AccordionItem value="instructions" className="border-0">
              <AccordionTrigger className="min-h-[56px] px-5 py-4 hover:no-underline hover:bg-accent/50 [&[data-state=open]]:bg-accent/30">
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <ScrollText size={16} className="text-primary" aria-hidden="true" />
                  Orientações
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5">
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{campaign.instructions}</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>
      )}

      <Card className="rounded-3xl p-5 hover:shadow-sm" data-tutorial="camp-timeline">
        <p className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Etapas e datas</p>
        <StageTimeline stages={campaign.stages} features={campaign.features} stage={state.stage} />
        <p className="mt-4 text-[11px] text-muted-foreground">Datas e horários no horário de Brasília.</p>
      </Card>

      <CampaignTour steps={HOME_TOUR} tour={tour} />
    </motion.div>
  );
}
