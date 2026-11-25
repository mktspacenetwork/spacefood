import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle2, ChevronRight, Info } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/Button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { CampaignBannerSlide } from "../../components/campaigns/CampaignBannerSlide";
import { StatusChip } from "../../components/campaigns/StatusChip";
import { PeriodRows } from "../../components/campaigns/PeriodRows";
import {
  hasVoting as campaignHasVoting, periodRows, recipesSummary, statusOfDetail, submissionsCount, submissionsMax,
} from "../../components/campaigns/campaignInfo";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { homeTour } from "../../lib/campaigns/tours-collab";
import { fmtDateTime } from "../../lib/campaigns/format";
import { campaignToBanner } from "../../lib/campaigns/homeBanners";
import type { CollabCampaignListItem } from "../../lib/campaigns/types";

type Cta = { label: string; to: string };

export function CampaignHome() {
  const { campaign, state, slug } = useCampaignCtx();
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = `/campanhas/${slug}`;
  const [detailsOpen, setDetailsOpen] = useState(false);

  const hasVoting = campaignHasVoting(campaign);
  const photosOn = campaign.features.photos !== false;
  const steps = useMemo(() => homeTour(hasVoting), [hasVoting]);
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "home", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user,
  });

  // O mesmo banner da Home e da lista de Campanhas (mesmos dados: imagem e texto configurados no cadastro). Nesta página o slide
  // inteiro não é link (já estamos na campanha) e o botão do banner não aparece: ele existe só na Home, e aqui a ação do momento
  // já é o botão logo abaixo.
  const banner = useMemo(
    () => campaignToBanner({ ...campaign, state, ended: false } as unknown as CollabCampaignListItem),
    [campaign, state],
  );
  const status = statusOfDetail(campaign, state);
  const periods = periodRows(campaign);
  const count = submissionsCount(state);
  const max = submissionsMax(campaign, state);
  const multi = max > 1;
  const mine = recipesSummary(count, state.my_submission_status);

  // UM só botão no corpo da página: a AÇÃO DO MOMENTO (enviar a receita, votar ou ver o resultado). Receitas, Minhas receitas,
  // Cadastrar, Votação e Resultado já estão no menu da campanha, logo acima: repetir cada uma em botão grande era duplicidade
  // (ex.: "Minhas receitas" e "Ver receitas" apareciam no menu E no corpo). Sem ação pendente nenhum botão aparece.
  let cta: Cta | null = null;
  const votingNow = hasVoting && !!state.can_vote;
  if (state.released) {
    if (hasVoting && state.results_visible) cta = { label: "Ver resultado", to: `${base}/resultado` };
    else if (count === 0 && state.can_submit) cta = { label: "Enviar minha receita", to: `${base}/enviar` };
    else if (votingNow) cta = { label: "Votar", to: `${base}/votacao` };
    else if (count > 0 && state.can_submit) cta = { label: "Enviar outra receita", to: `${base}/enviar` };
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="overflow-hidden rounded-3xl shadow-sm">
        <CampaignBannerSlide banner={banner} fit="container" linkSlide={false} showButton={false} />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold leading-tight text-foreground">{campaign.name}</h1>
        {campaign.description && (
          <p className="line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{campaign.description}</p>
        )}
        <div className="space-y-2 pt-1" data-tutorial="camp-status-home">
          <StatusChip status={status} variant="pill" />
          <PeriodRows campaign={campaign} />
        </div>
      </div>

      {(mine || (hasVoting && state.has_voted)) && (
        <p className="flex items-center gap-2 text-xs font-medium text-foreground/80" aria-label="Sua participação">
          <CheckCircle2 size={14} className="shrink-0 text-green-500" aria-hidden="true" />
          {[mine, hasVoting && state.has_voted ? "Você já votou" : null].filter(Boolean).join(" · ")}
        </p>
      )}

      {cta && (
        <Button size="lg" data-tutorial="camp-cta" onClick={() => navigate(cta!.to)} className="h-14 w-full rounded-2xl text-base font-bold">
          {cta.label}
        </Button>
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
            {periods.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{periods.length > 1 || periods[0].key === "both" ? "Períodos" : "Período"}</h3>
                {periods.map((p) => (
                  <p key={p.key} className="text-foreground">
                    {(periods.length > 1 || p.key === "both") && <span className="block text-xs font-semibold text-muted-foreground">{p.label}</span>}
                    {p.startsAt && <>Início: {fmtDateTime(p.startsAt)}<br /></>}
                    {p.endsAt && <>Encerramento: {fmtDateTime(p.endsAt)}</>}
                  </p>
                ))}
                <p className="text-xs text-muted-foreground">Horário de Brasília.</p>
              </section>
            )}
            <section className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Como funciona</h3>
              <ul className="space-y-1.5 text-foreground">
                <li className="flex gap-2.5"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Informe o título, os ingredientes e o modo de preparo{photosOn ? ", com até 3 fotos" : ""}. Se quiser, conte a história e a memória afetiva da receita.</li>
                {multi && (
                  <li className="flex gap-2.5"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Você pode enviar até {max} receitas.</li>
                )}
                {campaign.features.approval && (
                  <li className="flex gap-2.5"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />A equipe confere antes de ela aparecer para todos.</li>
                )}
                {hasVoting && (
                  <li className="flex gap-2.5"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Vote na sua favorita: 1 voto por pessoa, definitivo, e não vale nas suas próprias receitas.</li>
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

      <CampaignTour steps={steps} tour={tour} />
    </motion.div>
  );
}
