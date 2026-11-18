import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "../../lib/utils";
import { periodRows } from "./campaignInfo";
import type { PublicCampaign } from "../../lib/campaigns/types";

/**
 * Períodos da campanha em poucas palavras.
 *  - sem votação: só o período (sem rótulo);
 *  - com votação na mesma janela: "Participação e votação · 5 a 15 nov";
 *  - com votação em janela própria: "Participação 5 a 10 nov" e "Votação 11 a 15 nov".
 * `compact` = linha corrida (cartão da lista); senão, uma linha por período (Início da campanha).
 */
export function PeriodRows({
  campaign,
  compact = false,
  icon,
  className,
}: {
  campaign: Pick<PublicCampaign, "stages" | "features">;
  compact?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const rows = periodRows(campaign);
  if (rows.length === 0) return null;
  const labeled = rows.length > 1 || rows[0].key === "both";
  return (
    <div
      className={cn(compact ? "flex flex-wrap items-center gap-x-3 gap-y-1" : "flex flex-col gap-1", className)}
      data-tutorial="camp-period"
    >
      {rows.map((r, i) => (
        <span key={r.key} className={cn("inline-flex items-center gap-1.5 text-xs", compact ? "text-muted-foreground" : "font-medium text-foreground/80")}>
          {i === 0
            ? (icon ?? <CalendarDays size={13} aria-hidden="true" />)
            : !compact && <span className="w-[13px] shrink-0" aria-hidden="true" />}
          {labeled && <span className="font-semibold text-foreground/80">{r.label}</span>}
          <span>{r.text}</span>
        </span>
      ))}
    </div>
  );
}
