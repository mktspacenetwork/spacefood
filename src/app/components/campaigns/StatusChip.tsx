import { cn } from "../../lib/utils";
import type { CampaignStatusInfo, StatusTone } from "./campaignInfo";

const DOT: Record<StatusTone, string> = {
  open: "bg-green-500",
  soon: "bg-blue-500",
  closed: "bg-muted-foreground/60",
  paused: "bg-amber-500",
  done: "bg-purple-500",
};
const TEXT: Record<StatusTone, string> = {
  open: "text-green-700 dark:text-green-300",
  soon: "text-blue-700 dark:text-blue-300",
  closed: "text-muted-foreground",
  paused: "text-amber-700 dark:text-amber-300",
  done: "text-purple-700 dark:text-purple-300",
};
const PILL: Record<StatusTone, string> = {
  open: "bg-green-100 dark:bg-green-950/40",
  soon: "bg-blue-100 dark:bg-blue-950/40",
  closed: "bg-muted",
  paused: "bg-amber-100 dark:bg-amber-950/40",
  done: "bg-purple-100 dark:bg-purple-950/40",
};

/** Status da campanha em tamanho mínimo: ponto colorido + texto (ou uma pílula discreta). */
export function StatusChip({
  status,
  variant = "dot",
  className,
}: {
  status: CampaignStatusInfo;
  variant?: "dot" | "pill";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold",
        TEXT[status.tone],
        variant === "pill" && cn("rounded-full px-2.5 py-1 text-[11px]", PILL[status.tone]),
        className,
      )}
    >
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", DOT[status.tone])} />
      {status.text}
    </span>
  );
}
