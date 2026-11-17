import { useState } from "react";
import { useNavigate } from "react-router";
import { CalendarDays, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/Button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { CampaignCover } from "../../components/campaigns/CampaignCover";
import { StatusChip } from "../../components/campaigns/StatusChip";
import { periodText, statusOfDetail, myRecipeLine } from "../../components/campaigns/campaignInfo";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { HOME_TOUR } from "../../lib/campaigns/tours-collab";
import { fmtDateTime } from "../../lib/campaigns/format";

type Cta = { label: string; to: string };

export function CampaignHome() {
  const { campaign, state, slug } = useCampaignCtx();
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = `/campanhas/${slug}`;
  const [detailsOpen, setDetailsOpen] = useState(false);

  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "home", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user,
  });

  const hasVoting = campaign.features.voting;
  const status = statusOfDetail(campaign, state);
  const period = periodText(campaign);
  const reg = campaign.stages.find((s) => s.key === "registration");
  const mine = myRecipeLine(state.my_submission_status);

  // Um botão principal (a ação do momento) e, no máximo, um secundário.
  let primary: Cta | null = null;
  let secondary: Cta | null = null;
  if (state.released) {
    if (state.results_visible) primary = { label: "Ver resultado", to: `${base}/resultado` };
    else if (state.can_submit && !state.my_submission_id) {
      primary = { label: "Participar", to: `${base}/enviar` };
      if (hasVoting && state.can_vote) secondary = { label: "Votar nas receitas", to: `${base}/votacao` };
      else if (state.gallery_visible) secondary = { label: "Ver receitas", to: `${base}/receitas` };
    } else if (state.can_vote) {
      primary = { label: "Votar", to: `${base}/votacao` };
      if (state.my_submission_id) secondary = { label: "Minha receita", to: `${base}/participacao` };
    } else if (state.my_submission_id) {
      primary = { label: "Ver minha receita", to: `${base}/participacao` };
      if (state.gallery_visible) secondary = { label: "Ver receitas", to: `${base}/receitas` };
    } else if (state.gallery_visible) primary = { label: "Ver receitas", to: `${base}/receitas` };
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <CampaignCover url={campaign.cover_url} eager className="rounded-3xl shadow-sm" />

      <div className="space-y-2">
        <h1 className="text-2xl font-bold leading-tight text-foreground">{campaign.name}</h1>
        {campaign.description && (
          <p className="line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{campaign.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1" data-tutorial="camp-status-home">
          {period && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
              <CalendarDays size={13} aria-hidden="true" /> {period}
            </span>
          )}
          <StatusChip status={status} variant="pill" />
        </div>
      </div>

      {(mine || state.has_voted) && (
        <p className="flex items-center gap-2 text-xs font-medium text-foreground/80" aria-label="Sua participação">
          <CheckCircle2 size={14} className="shrink-0 text-green-500" aria-hidden="true" />
          {[mine, state.has_voted ? "Você já votou" : null].filter(Boolean).join(" · ")}
        </p>
      )}

      {primary && (
        <div className="space-y-2">
          <Button size="lg" data-tutorial="camp-cta" onClick={() => navigate(primary!.to)} className="h-14 w-full rounded-2xl text-base font-bold">
            {primary.label}
          </Button>
          {secondary && (
            <Button variant="outline" onClick={() => navigate(secondary!.to)} className="h-12 w-full rounded-2xl text-sm font-semibold">
              {secondary.label}
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          data-tutorial="camp-details"
          onClick={() => setDetailsOpen(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Info size={16} aria-hidden="true" /> Ver detalhes <ChevronRight size={14} aria-hidden="true" />
        </button>
        <TourButton onClick={tour.start} />
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl px-1 pb-6">
          <SheetHeader className="text-left">
            <SheetTitle className="pr-8 text-lg">{campaign.name}</SheetTitle>
            <SheetDescription className="sr-only">Detalhes da campanha</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 px-4 pb-2 text-sm">
            {campaign.description && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sobre</h3>
                <p className="whitespace-pre-line leading-relaxed text-foreground">{campaign.description}</p>
              </section>
            )}
            {(reg?.starts_at || reg?.ends_at) && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Período</h3>
                <p className="text-foreground">
                  {reg?.starts_at && <>Início: {fmtDateTime(reg.starts_at)}<br /></>}
                  {reg?.ends_at && <>Encerramento: {fmtDateTime(reg.ends_at)}</>}
                </p>
                <p className="text-xs text-muted-foreground">Horário de Brasília.</p>
              </section>
            )}
            <section className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Como funciona</h3>
              <ul className="space-y-1.5 text-foreground">
                <li className="flex gap-2.5"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Envie o nome, uma breve descrição e a foto da receita.</li>
                {campaign.features.approval && (
                  <li className="flex gap-2.5"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />A equipe confere antes de ela aparecer para todos.</li>
                )}
                {hasVoting && (
                  <li className="flex gap-2.5"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Vote na sua favorita: 1 voto por pessoa, definitivo, e não vale na própria receita.</li>
                )}
              </ul>
            </section>
            {campaign.instructions && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Orientações</h3>
                <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{campaign.instructions}</p>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <CampaignTour steps={HOME_TOUR} tour={tour} />
    </motion.div>
  );
}
