import { useEffect, useState } from "react";
import { Check, Loader2, Lock, RefreshCw, Square, Trophy } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { Progress } from "../../../../components/ui/progress";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { useVisibleInterval } from "../../../../lib/campaigns/ranking";
import { PHASE_STATE, RESULT_STAGE, fmtDate, fmtDayTime, fmtRange, plural } from "../../../../lib/campaigns/format";
import type { AdminDashboard, AdminResults } from "../../../../lib/campaigns/types";
import { CampaignTour } from "../../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_TABS } from "../../../../lib/campaigns/tours-admin";
import { ErrorBox, LoadingBox, Notice, SectionLabel, stageState, useBusy, useLoader } from "../shared";
import { ResultView } from "./VoteFlow";
import { PartialRankingSwitch, RankingCard, VotesList } from "./LiveRanking";
import type { TabProps } from "./types";
import { useTabTour } from "./useTabTour";

type StepState = "done" | "current" | "todo";

/** Os cinco passos do caminho até o resultado, na ordem: o estado de cada um sai da situação real da campanha. */
function Steps({ items }: { items: { label: string; state: StepState }[] }) {
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Passos até o resultado" data-tutorial="camp-results-steps">
      {items.map((s, i) => (
        <li key={s.label} className="flex min-w-0 flex-col items-center gap-1 text-center" aria-current={s.state === "current" ? "step" : undefined}>
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold",
              s.state === "done" && "border-green-300 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300",
              s.state === "current" && "border-primary bg-primary text-primary-foreground",
              s.state === "todo" && "border-border bg-muted text-muted-foreground",
            )}
          >
            {s.state === "done" ? <Check size={14} aria-hidden="true" /> : i + 1}
          </span>
          <span className={cn("w-full truncate text-[10.5px] font-semibold sm:text-xs", s.state === "todo" ? "text-muted-foreground" : "text-foreground")}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * RESULTADOS — do acompanhamento da votação até a divulgação, em ordem:
 *  1 Acompanhar (votos e participação; quem votou em quê, com permissão) · 2 Ranking (ao vivo, "Parcial"; a gestão
 *  decide se os colaboradores também veem o parcial) · 3 Apuração · 4 Confirmar ganhador · 5 Divulgar.
 * Estados do resultado: Em apuração → Definido (ganhador confirmado) → Divulgado. Confirmar e divulgar são ações
 * separadas. O período e a data de anúncio ficam em Configurações → Período.
 */
export function ResultsTab(props: TabProps) {
  const { campaignId, campaign, results, perms, onChanged, tourUserId, tourSignal } = props;
  const dash = useLoader<AdminDashboard>(() => campaignsApi.get(`/admin/campaigns/${campaignId}/dashboard`), [campaignId]);
  const { busy, run } = useBusy();
  const tour = useTabTour("results", { tourUserId, tourSignal, ready: !!dash.data });
  // null = automático (mostra o resultado quando já existe apuração); depois que a pessoa pede, vale a escolha dela.
  const [shown, setShown] = useState<boolean | null>(null);
  const [endNowOpen, setEndNowOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Ao vivo = votação aberta/pausada (e, quando o servidor informa, `voting_live`): o ranking é PARCIAL e se atualiza
  // sozinho a cada 20 s, só com a aba visível. Fora disso (encerrada) o ranking não muda mais e não há recarga.
  const votingStage = dash.data ? stageState(dash.data.stages.find((s) => s.stage_key === "voting")) : "unset";
  const votingNow = ["open", "paused"].includes(votingStage) && (dash.data?.voting_live ?? true);
  const { reload: reloadDash } = dash;
  useVisibleInterval(() => { void reloadDash(); setRefreshKey((k) => k + 1); }, 20_000, votingNow, 0);
  useEffect(() => { if (dash.data) setUpdatedAt(new Date()); }, [dash.data]);

  if (dash.loading && !dash.data) return <LoadingBox />;
  if (dash.error && !dash.data) return <ErrorBox message={dash.error} onRetry={dash.reload} />;
  const d = dash.data;
  if (!d) return null;

  const base = `/admin/campaigns/${campaignId}`;
  const vs = d.stages.find((s) => s.stage_key === "voting");
  const state = stageState(vs);
  const phase = PHASE_STATE[state];
  // `results` (da campanha) traz o registro completo; o painel (dashboard) traz o mais recente. O recente vence.
  const res = { ...(results ?? {}), ...(d.results ?? {}) } as Partial<AdminResults>;
  const rs = res.status ?? "none";
  const finalized = rs === "confirmed" || rs === "announced";
  const announced = rs === "announced";
  const ended = state === "closed";
  const canSchedule = !!perms.campaigns_schedule;
  const canSeeResult = !!perms.campaigns_results;
  const isBusy = busy !== null;
  const endsAt = vs?.ends_at ?? d.voting_ends_at ?? null;
  const resultShown = shown ?? rs !== "none";
  const announceAt = !announced ? res.announce_at ?? null : null;
  const partialOn = !!campaign.visibility?.show_partial;
  const refresh = () => { dash.reload(); setRefreshKey((k) => k + 1); onChanged(); };

  // Passos: o estado de cada um vem da situação real (votação aberta/encerrada e do resultado).
  const upcoming = state === "upcoming" || state === "unset";
  const stepStates: { label: string; state: StepState }[] = [
    { label: "Votos", state: ended || rs !== "none" ? "done" : upcoming ? "todo" : "current" },
    { label: "Ranking", state: ended || rs !== "none" ? "done" : upcoming ? "todo" : "current" },
    { label: "Apuração", state: rs === "preliminary" || finalized ? "done" : ended || rs === "tie_pending" ? "current" : "todo" },
    { label: "Confirmar", state: finalized ? "done" : rs === "preliminary" ? "current" : "todo" },
    { label: "Divulgar", state: announced ? "done" : rs === "confirmed" ? "current" : "todo" },
  ];
  const stage = rs === "none" && votingNow
    ? { label: "Votação em andamento", className: "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300" }
    : RESULT_STAGE[rs];

  const endNow = async () => {
    setEndNowOpen(false);
    const r = await run("end", () => campaignsApi.post(`${base}/voting/close`, { end_now: true }), "Votação encerrada.");
    if (r.ok) { setShown(true); refresh(); }
  };

  // "Ver ganhador": se ainda não foi apurado, apura agora (o servidor só libera depois do encerramento) e mostra.
  const seeResult = async () => {
    if (rs === "none") {
      const r = await run("tally", () => campaignsApi.post(`${base}/voting/close`, { end_now: false }));
      if (!r.ok) return;
      refresh();
    }
    setShown(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge className={cn("border px-3 py-1 text-xs", stage.className)}>{stage.label}</Badge>
        <Button variant="ghost" size="sm" className="gap-2 rounded-xl text-muted-foreground" onClick={() => { dash.reload(); setRefreshKey((k) => k + 1); }} disabled={dash.loading}>
          <RefreshCw size={13} className={cn(dash.loading && "animate-spin")} /> Atualizar
        </Button>
      </div>

      <Card className="rounded-3xl border hover:shadow-sm">
        <CardContent className="p-4 sm:p-5"><Steps items={stepStates} /></CardContent>
      </Card>

      {/* 1 · Acompanhar */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-vote-status">
        <CardContent className="grid gap-5 p-5 md:grid-cols-2">
          <div className="space-y-2">
            <SectionLabel>1 · Acompanhar a votação</SectionLabel>
            <Badge className={cn("border px-3 py-1 text-sm", phase.className)}>Votação {phase.label.toLowerCase()}</Badge>
            <p className="text-xs text-muted-foreground">{vs?.starts_at || vs?.ends_at ? fmtRange(vs?.starts_at, vs?.ends_at) : "Defina o período em Configurações."}</p>
            {state === "open" && endsAt && <p className="text-xs font-medium text-foreground">Encerra em {fmtDate(endsAt)} (fim do dia).</p>}
            {state === "paused" && <p className="text-xs font-medium text-foreground">Pausada: ninguém consegue votar por enquanto.</p>}
            {announceAt && <p className="text-xs font-medium text-foreground">Anúncio do resultado: {fmtDayTime(announceAt)}.</p>}
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Votos</p>
                <p className="text-3xl font-bold tabular-nums text-foreground">{d.votes_valid}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quem votou</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{d.voters} <span className="text-sm font-medium text-muted-foreground">de {d.eligible}</span></p>
              </div>
            </div>
            <div className="space-y-1">
              <Progress value={Math.min(100, d.voting_pct)} aria-label={`${d.voting_pct}% dos elegíveis já votaram`} />
              <p className="text-[11px] text-muted-foreground">{d.voting_pct}% dos elegíveis já votaram.</p>
            </div>
            {d.votes_invalidated > 0 && (
              <p className="text-[11px] text-muted-foreground">{plural(d.votes_invalidated, "voto invalidado", "votos invalidados")} (não entram na contagem).</p>
            )}
          </div>
        </CardContent>
      </Card>

      {perms.campaigns_votes_view && (
        <VotesList campaignId={campaignId} canInvalidate={!!perms.campaigns_votes_invalidate && !finalized} refreshKey={refreshKey} onChanged={refresh} />
      )}

      {/* 2 · Ranking (ao vivo, parcial) */}
      {Array.isArray(d.tally) && (
        <RankingCard tally={d.tally} live={votingNow} official={finalized} winnerId={res.winner_submission_id} updatedAt={updatedAt} />
      )}
      {!announced && (
        <PartialRankingSwitch campaignId={campaignId} enabled={partialOn} canEdit={!!perms.campaigns_announce && !isBusy} onChanged={onChanged} />
      )}

      {/* 3 · Apuração → 4 Confirmar → 5 Divulgar */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-vote-result">
        <CardContent className="space-y-4 p-5">
          <SectionLabel>3 · Apuração final</SectionLabel>

          {!ended && rs === "none" ? (
            <div className="space-y-3">
              <Button size="lg" className="w-full gap-2 rounded-2xl sm:w-auto" disabled>
                <Lock size={16} /> Ver ganhador
              </Button>
              <p className="text-sm text-muted-foreground">
                Disponível depois do encerramento da votação{endsAt ? ` (${fmtDate(endsAt)})` : ""}.
              </p>
              {canSchedule && state === "open" && (
                <div className="space-y-1 border-t pt-3">
                  <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setEndNowOpen(true)} disabled={isBusy}>
                    {busy === "end" ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />} Encerrar votação agora
                  </Button>
                  <p className="text-[11px] text-muted-foreground">Só se quiser antecipar o fim: a participação e a votação terminam agora. Receitas enviadas depois ficam “fora do prazo” e não entram na votação nem no ranking.</p>
                </div>
              )}
            </div>
          ) : !canSeeResult ? (
            <Notice tone="info">A votação encerrou. Para ver o resultado é preciso a permissão “Ver apuração”.</Notice>
          ) : !resultShown ? (
            <div className="space-y-3">
              {rs === "none" && !canSchedule ? (
                <Notice tone="info">A votação encerrou, mas o resultado ainda não foi apurado. Peça a quem gerencia as datas da campanha para apurar.</Notice>
              ) : (
                <>
                  <Button size="lg" className="w-full gap-2 rounded-2xl sm:w-auto" onClick={seeResult} disabled={isBusy}>
                    {busy === "tally" ? <Loader2 size={16} className="animate-spin" /> : <Trophy size={16} />} Ver ganhador
                  </Button>
                  <p className="text-sm text-muted-foreground">A votação encerrou. Veja o ganhador e confira os números.</p>
                </>
              )}
            </div>
          ) : (
            <ResultView
              {...props}
              totals={{ votesValid: d.votes_valid, voters: d.voters, eligible: d.eligible, invalidated: d.votes_invalidated }}
              onChanged={refresh}
            />
          )}

          {finalized && <p className="text-[11px] text-muted-foreground">O ganhador já foi confirmado: a votação não pode mais ser alterada.</p>}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={endNowOpen}
        onOpenChange={setEndNowOpen}
        title="Encerrar a votação agora?"
        description="A participação e a votação terminam agora: ninguém mais vota. Receitas enviadas depois ficam “fora do prazo”: são aceitas, mas não entram na votação nem no ranking. Depois você poderá ver o ganhador, confirmar e divulgar."
        confirmLabel="Encerrar agora"
        variant="destructive"
        onConfirm={endNow}
      />

      <CampaignTour steps={ADMIN_TOUR_TABS.results} tour={tour} />
    </div>
  );
}
