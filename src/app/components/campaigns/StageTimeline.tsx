import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { fmtDateTime, fmtShort } from "../../lib/campaigns/format";
import type { CollabStage, Features, PublicCampaign, PublicStage, StageKey } from "../../lib/campaigns/types";

const ORDER: StageKey[] = ["registration", "voting", "results", "announcement"];

const TEXT: Record<StageKey, { title: string; desc: string }> = {
  registration: { title: "Inscrições", desc: "Envie a sua receita" },
  voting: { title: "Votação", desc: "Escolha a sua favorita" },
  results: { title: "Apuração", desc: "Contagem e confirmação dos votos" },
  announcement: { title: "Divulgação", desc: "Resultado oficial" },
};

/** Posição da etapa atual na linha do tempo (0.5 = entre inscrições e votação, 99 = tudo concluído). */
function activeIndex(stage?: CollabStage): number {
  switch (stage) {
    case "registration":
    case "registration_paused":
      return 0;
    case "review":
      return 0.5;
    case "voting":
    case "voting_paused":
      return 1;
    case "voting_closed":
      return 2;
    case "results":
      return 3;
    case "closed":
      return 99;
    default:
      return -1;
  }
}

function enabledKeys(f: Features): StageKey[] {
  return ORDER.filter((k) => {
    if (k === "registration") return f.submission;
    if (k === "voting") return f.voting;
    if (k === "results") return f.voting;
    return f.announcement && f.results;
  });
}

function range(s?: PublicStage): string {
  if (!s || (!s.starts_at && !s.ends_at)) return "Data a definir";
  if (s.starts_at && s.ends_at) return `${fmtDateTime(s.starts_at)} até ${fmtDateTime(s.ends_at)}`;
  if (s.starts_at) return `A partir de ${fmtDateTime(s.starts_at)}`;
  return `Até ${fmtDateTime(s.ends_at)}`;
}

/** Texto curto do período principal da campanha, para o cartão da lista. */
export function campaignPeriod(c: Pick<PublicCampaign, "stages" | "features">): string {
  const reg = c.stages.find((s) => s.key === "registration");
  const vot = c.stages.find((s) => s.key === "voting");
  if (c.features.submission && reg?.starts_at && reg.ends_at) return `Inscrições: ${fmtShort(reg.starts_at)} a ${fmtShort(reg.ends_at)}`;
  if (c.features.voting && vot?.starts_at && vot.ends_at) return `Votação: ${fmtShort(vot.starts_at)} a ${fmtShort(vot.ends_at)}`;
  return "Datas a definir";
}

export function StageTimeline({
  stages,
  features,
  stage,
  className,
}: {
  stages: PublicStage[];
  features: Features;
  stage?: CollabStage;
  className?: string;
}) {
  const keys = enabledKeys(features);
  const active = activeIndex(stage);

  return (
    <ol className={cn("space-y-0", className)} aria-label="Etapas da campanha">
      {keys.map((k, i) => {
        const pos = ORDER.indexOf(k);
        const state: "done" | "active" | "upcoming" = active === 99 || pos < active ? "done" : pos === active ? "active" : "upcoming";
        const s = stages.find((x) => x.key === k);
        const isLast = i === keys.length - 1;
        return (
          <li key={k} className="relative flex gap-3 pb-5 last:pb-0" aria-current={state === "active" ? "step" : undefined}>
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn("absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5", state === "done" ? "bg-primary/40" : "bg-border")}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold",
                state === "done" && "border-primary bg-primary text-primary-foreground",
                state === "active" && "border-primary bg-primary/10 text-primary ring-4 ring-primary/15",
                state === "upcoming" && "border-border bg-card text-muted-foreground",
              )}
            >
              {state === "done" ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn("text-sm font-bold", state === "upcoming" ? "text-muted-foreground" : "text-foreground")}>{TEXT[k].title}</p>
                {state === "active" && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Agora</span>
                )}
                {s?.paused && (
                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300">
                    Pausada
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{TEXT[k].desc}</p>
              <p className="mt-0.5 text-xs font-medium text-foreground/80">{range(s)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
