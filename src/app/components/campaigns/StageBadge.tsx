import { Badge } from "../ui/Badge";
import { cn } from "../../lib/utils";
import { COLLAB_STAGE } from "../../lib/campaigns/format";
import type { CollabStage } from "../../lib/campaigns/types";

/** Etapa da campanha como o colaborador a enxerga (calculada no servidor). */
export function StageBadge({ stage, className }: { stage?: CollabStage | null; className?: string }) {
  const cfg = COLLAB_STAGE[stage ?? "upcoming"] ?? COLLAB_STAGE.upcoming;
  return <Badge className={cn("border text-[11px] font-semibold", cfg.className, className)}>{cfg.label}</Badge>;
}
