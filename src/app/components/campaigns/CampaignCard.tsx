import { Link } from "react-router";
import { CalendarDays, ChevronRight, UtensilsCrossed } from "lucide-react";
import { Card } from "../ui/Card";
import { CampaignCover } from "./CampaignCover";
import { StatusChip } from "./StatusChip";
import { PeriodRows } from "./PeriodRows";
import { cardAction, recipesSummary, statusOfListItem, submissionsCount } from "./campaignInfo";
import { cn } from "../../lib/utils";
import type { CollabCampaignListItem } from "../../lib/campaigns/types";

/**
 * Cartão da lista, em quatro blocos curtos:
 *   Nome (e capa) · Situação (chip + período) · Receitas (só quem já enviou) · Ação (botão do momento).
 * A área da capa/nome abre a campanha; o botão leva direto ao que dá para fazer agora.
 * `first` marca o 1º cartão para a tour.
 */
export function CampaignCard({ campaign, first = false }: { campaign: CollabCampaignListItem; first?: boolean }) {
  const base = `/campanhas/${campaign.slug}`;
  const status = statusOfListItem(campaign);
  const action = cardAction(campaign);
  const count = submissionsCount(campaign.state);
  const summary = [
    count > 0 ? (count === 1 ? "1 receita enviada" : recipesSummary(count)) : null,
    campaign.features?.voting && campaign.state.has_voted ? "Você votou" : null,
  ].filter(Boolean).join(" · ");

  return (
    <Card className="overflow-hidden rounded-3xl">
      <Link
        to={base}
        data-tutorial={first ? "camp-card" : undefined}
        aria-label={`Abrir a campanha ${campaign.name}`}
        className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
      >
        <CampaignCover url={campaign.cover_url} />
        <div className="space-y-2 px-4 pt-4">
          <h2 className="line-clamp-2 text-base font-bold leading-snug text-foreground">{campaign.name}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-tutorial={first ? "camp-stage" : undefined}>
            <StatusChip status={status} variant="pill" />
            <PeriodRows campaign={campaign} compact icon={<CalendarDays size={12} aria-hidden="true" />} />
          </div>
        </div>
      </Link>

      <div className="flex items-center gap-3 px-4 pb-4 pt-3">
        {summary && (
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-foreground/80">
            <UtensilsCrossed size={13} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{summary}</span>
          </p>
        )}
        <Link
          to={`${base}${action.to}`}
          data-tutorial={first ? "camp-card-action" : undefined}
          className={cn(
            "inline-flex h-11 items-center justify-center gap-1 rounded-xl px-4 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]",
            action.emphasis === "primary"
              ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              : "border border-border bg-background text-foreground hover:bg-accent",
            summary ? "shrink-0" : "w-full",
          )}
        >
          {action.label}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
