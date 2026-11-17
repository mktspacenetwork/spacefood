import { Link } from "react-router";
import { CalendarDays, ChevronRight } from "lucide-react";
import { Card } from "../ui/Card";
import { CampaignCover } from "./CampaignCover";
import { StatusChip } from "./StatusChip";
import { periodText, statusOfListItem } from "./campaignInfo";
import type { CollabCampaignListItem } from "../../lib/campaigns/types";

/** Cartão da lista: capa (proporção do banner), nome, uma linha de período e o status. `first` marca o 1º para a tour. */
export function CampaignCard({ campaign, first = false }: { campaign: CollabCampaignListItem; first?: boolean }) {
  const status = statusOfListItem(campaign);
  const period = periodText(campaign);
  return (
    <Link
      to={`/campanhas/${campaign.slug}`}
      data-tutorial={first ? "camp-card" : undefined}
      aria-label={`Abrir a campanha ${campaign.name}`}
      className="group block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="overflow-hidden rounded-3xl transition-all group-active:scale-[0.99]">
        <CampaignCover url={campaign.cover_url} />
        <div className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="truncate text-base font-bold leading-snug text-foreground">{campaign.name}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-tutorial={first ? "camp-stage" : undefined}>
              {period && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays size={12} aria-hidden="true" /> {period}
                </span>
              )}
              <StatusChip status={status} />
            </div>
          </div>
          <ChevronRight size={20} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      </Card>
    </Link>
  );
}
