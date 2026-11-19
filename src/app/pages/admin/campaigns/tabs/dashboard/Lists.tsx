import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "../../../../../components/ui/Badge";
import { cn } from "../../../../../lib/utils";
import { PHASE_STATE, fmtDayTime } from "../../../../../lib/campaigns/format";
import type { AdminAnalytics, AdminCampaign, AdminResults, AdminStageRow } from "../../../../../lib/campaigns/types";
import { stageState } from "../../shared";
import { EmptyLine, Panel, withPositions } from "./parts";

// ───────────────────────────────────── Funil ─────────────────────────────────────

/** Elegíveis → participantes → receitas aprovadas → votaram. Cada barra é proporcional ao maior valor. */
export function Funnel({ data, campaign }: { data: AdminAnalytics; campaign: AdminCampaign }) {
  const t = data.totals;
  const f = campaign.features;
  const steps = [
    { key: "eligible", label: "Elegíveis", value: t.eligible, color: "bg-muted-foreground/40" },
    { key: "participants", label: "Participantes", value: t.participants, color: "bg-primary" },
    ...(f.approval ? [{ key: "approved", label: "Receitas aprovadas", value: t.approved, color: "bg-green-500" }] : []),
    ...(data.has_voting ? [{ key: "voted", label: "Votaram", value: t.voters, color: "bg-amber-500" }] : []),
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  const summary = `Funil: ${steps.map((s) => `${s.label} ${s.value}`).join(", ")}.`;
  return (
    <Panel title="Funil de participação" hint="Do total de elegíveis até quem votou.">
      <ul aria-label={summary} className="space-y-3">
        {steps.map((s) => {
          const pct = t.eligible > 0 ? Math.round((s.value / t.eligible) * 100) : 0;
          return (
            <li key={s.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{s.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <b className="text-foreground">{s.value}</b>
                  {/* receitas podem passar de elegíveis (várias por pessoa): nesse caso só a contagem, sem % acima de 100 */}
                  {s.key !== "eligible" && t.eligible > 0 && s.value <= t.eligible && <> · {pct}%</>}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className={cn("h-full rounded-full transition-all", s.color)} style={{ width: `${s.value > 0 ? Math.max(2, (s.value / max) * 100) : 0}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// ─────────────────────────────────── Top 5 ───────────────────────────────────────

/** As 5 primeiras do ranking (só aprovadas e no prazo). Posição de competição; sem votos para ninguém = "sem votos". */
export function TopRanking({ data, onOpen }: { data: AdminAnalytics; onOpen?: () => void }) {
  const rows = useMemo(() => withPositions(data.tally ?? []).slice(0, 5), [data.tally]);
  const noVotes = rows.length > 0 && rows.every((r) => r.votes === 0);
  const maxVotes = Math.max(1, ...rows.map((r) => r.votes));
  return (
    <Panel
      title="Top 5 do ranking"
      hint={data.voting_live ? "Parcial: só a gestão vê enquanto a votação está aberta." : "Receitas aprovadas e no prazo."}
      action={
        onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-h-9 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-primary hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ranking completo <ChevronRight size={14} aria-hidden="true" />
          </button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyLine>Nenhuma receita aprovada e no prazo ainda.</EmptyLine>
      ) : (
        <>
          {noVotes && <p className="text-[12px] text-muted-foreground">Ainda sem votos.</p>}
          <ol className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.submission_id} className="flex items-center gap-3">
                <span
                  aria-label={noVotes ? "sem votos" : `${r.pos}º lugar`}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                    !noVotes && r.pos === 1 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" : "bg-muted text-muted-foreground",
                  )}
                >
                  {noVotes ? "–" : `${r.pos}º`}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{r.dish_name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {noVotes ? "sem votos" : <><b className="text-foreground">{r.votes}</b> {r.votes === 1 ? "voto" : "votos"}</>}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{r.author}</p>
                  {!noVotes && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${r.votes > 0 ? Math.max(3, (r.votes / maxVotes) * 100) : 0}%` }} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}

// ─────────────────────────────── Etapas da campanha ───────────────────────────────

/** Participação → votação → divulgação, cada uma com a situação de agora (calculada pelas datas) e o período. */
export function StagesCard({
  stages, campaign, results, hasVoting,
}: { stages: AdminStageRow[]; campaign: AdminCampaign; results: AdminResults | null; hasVoting: boolean }) {
  const reg = stages.find((s) => s.stage_key === "registration");
  const vot = stages.find((s) => s.stage_key === "voting");
  const rows: { key: string; label: string; chip: { label: string; className: string }; when: string }[] = [];

  const span = (s: AdminStageRow | undefined) =>
    s && (s.starts_at || s.ends_at) ? `${s.starts_at ? fmtDayTime(s.starts_at) : "—"} → ${s.ends_at ? fmtDayTime(s.ends_at) : "—"}` : "Sem datas";

  rows.push({ key: "registration", label: "Participação", chip: PHASE_STATE[stageState(reg)], when: span(reg) });
  if (hasVoting) {
    rows.push({ key: "voting", label: "Votação", chip: PHASE_STATE[stageState(vot)], when: span(vot) });
    if (campaign.features.announcement) {
      const rs = results?.status ?? "none";
      const at = results?.announce_at ?? null;
      const future = !!at && new Date(at).getTime() > Date.now();
      let chip = { ...PHASE_STATE.unset, label: "Pendente" };
      let when = "Sem data marcada";
      if (rs === "announced") { chip = { ...PHASE_STATE.closed, label: "Divulgado" }; when = fmtDayTime(results?.announced_at); }
      else if (future) { chip = { ...PHASE_STATE.upcoming, label: "Agendada" }; when = fmtDayTime(at); }
      else if (rs === "confirmed") { chip = { ...PHASE_STATE.paused, label: "Falta divulgar" }; when = "Ganhador definido"; }
      else if (at) { chip = { ...PHASE_STATE.paused, label: "Aguardando" }; when = fmtDayTime(at); }
      rows.push({ key: "announcement", label: "Divulgação", chip, when });
    }
  }

  return (
    <Panel title="Etapas da campanha" hint="Onde a campanha está agora.">
      <ol className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
            <span className="font-medium">{r.label}</span>
            <span className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <span className="text-[11px] text-muted-foreground">{r.when}</span>
              <Badge variant="outline" className={cn("border text-[10px]", r.chip.className)}>{r.chip.label}</Badge>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

