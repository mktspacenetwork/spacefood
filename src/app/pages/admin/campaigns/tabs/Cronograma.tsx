import { CalendarDays } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { cn } from "../../../../lib/utils";
import { PHASE_STATE, fmtDayTime, fmtRange } from "../../../../lib/campaigns/format";
import type { DisplayState } from "../../../../lib/campaigns/format";
import type { AdminCampaign, AdminResults, AdminStageRow } from "../../../../lib/campaigns/types";
import { stageState } from "../shared";

type Item = { key: string; label: string; when: string; chip?: { text: string; className: string } };

/** "faltam 3 dias" / "termina hoje" (o encerramento vale até o fim do dia). */
function daysLeft(ends: string | null | undefined): string | null {
  if (!ends) return null;
  const ms = new Date(ends).getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.ceil(ms / 86_400_000);
  return days <= 1 ? "termina hoje" : `faltam ${days} dias`;
}

const BLUE = "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300";
const GREEN = "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300";
const PURPLE = "border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300";

/**
 * Cronograma simples: só o que se aplica. O período é UM só (a votação usa a mesma janela da participação) e,
 * com votação, a data de anúncio do resultado. Lê as datas que já existem no cadastro — não há segunda configuração
 * de datas aqui; para mudar, Configurações → Período.
 */
export function Cronograma({
  campaign, stages, results, display,
}: {
  campaign: AdminCampaign;
  stages: AdminStageRow[];
  results: AdminResults | null;
  display: DisplayState;
}) {
  const f = campaign.features;
  const reg = stages.find((s) => s.stage_key === "registration");
  const live = display === "published" || display === "scheduled";
  const regState = stageState(reg);
  const items: Item[] = [];

  const left = live && (regState === "open" || regState === "paused") ? daysLeft(reg?.ends_at) : null;
  items.push({
    key: "registration",
    label: f.voting ? "Participação e votação" : "Participação",
    when: fmtRange(reg?.starts_at, reg?.ends_at) + (left ? ` · ${left}` : ""),
    chip: regState === "unset" ? undefined : { text: PHASE_STATE[regState].label, className: PHASE_STATE[regState].className },
  });

  if (f.voting && f.announcement) {
    const rs = results?.status ?? "none";
    const at = results?.announce_at ?? null;
    let when = "Sem data definida";
    let chip: Item["chip"];
    if (rs === "announced") { when = `Divulgado em ${fmtDayTime(results?.announced_at)}`; chip = { text: "Divulgado", className: PURPLE }; }
    else if (rs === "confirmed" && at) { when = `Em ${fmtDayTime(at)}`; chip = { text: "Definido", className: GREEN }; }
    else if (rs === "confirmed") { when = "Ganhador definido — falta divulgar"; chip = { text: "Definido", className: GREEN }; }
    else if (at) { when = `Em ${fmtDayTime(at)}`; chip = { text: "Programado", className: BLUE }; }
    items.push({ key: "results", label: "Anúncio do resultado", when, chip });
  }

  return (
    <Card className="rounded-2xl border p-3.5 hover:shadow-sm" data-tutorial="camp-panel-cycle">
      <div className="flex gap-3">
        <CalendarDays size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <ul className="min-w-0 flex-1 divide-y divide-border">
          {items.map((it) => (
            <li key={it.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 first:pt-0 last:pb-0">
              <span className="min-w-0 text-sm">
                <span className="text-muted-foreground">{it.label} </span>
                <b className="text-foreground">{it.when}</b>
              </span>
              {it.chip && <Badge className={cn("border text-[10px]", it.chip.className)}>{it.chip.text}</Badge>}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
