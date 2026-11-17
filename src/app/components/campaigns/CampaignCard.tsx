import { Link } from "react-router";
import { ChevronRight, Megaphone, CalendarDays } from "lucide-react";
import { Card } from "../ui/Card";
import { StageBadge } from "./StageBadge";
import { campaignPeriod } from "./StageTimeline";
import type { CollabCampaignListItem } from "../../lib/campaigns/types";

/** Cartão da lista de campanhas. `first` marca o primeiro cartão para a tour (camp-card / camp-stage). */
export function CampaignCard({ campaign, first = false }: { campaign: CollabCampaignListItem; first?: boolean }) {
  return (
    <Link
      to={`/campanhas/${campaign.slug}`}
      data-tutorial={first ? "camp-card" : undefined}
      aria-label={`Abrir a campanha ${campaign.name}`}
      className="group block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="overflow-hidden rounded-3xl transition-all group-active:scale-[0.99]">
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          {campaign.cover_url ? (
            <img src={campaign.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500 text-white/90">
              <Megaphone size={44} strokeWidth={1.75} />
            </div>
          )}
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-bold leading-snug text-foreground">{campaign.name}</h2>
            <ChevronRight size={20} className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
          {campaign.description && <p className="line-clamp-2 text-sm text-muted-foreground">{campaign.description}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1" data-tutorial={first ? "camp-stage" : undefined}>
            <StageBadge stage={campaign.state.stage} />
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays size={12} aria-hidden="true" />
              {campaignPeriod(campaign)}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
