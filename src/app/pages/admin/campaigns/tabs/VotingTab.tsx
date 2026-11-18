import { useState } from "react";
import { CalendarDays, Loader2, Lock, Square, Trophy } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { Progress } from "../../../../components/ui/progress";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { PHASE_STATE, fmtDate, fmtDayTime, fmtRange, plural } from "../../../../lib/campaigns/format";
import type { AdminDashboard, AdminResults } from "../../../../lib/campaigns/types";
import { CampaignTour } from "../../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_TABS } from "../../../../lib/campaigns/tours-admin";
import { ErrorBox, LoadingBox, Notice, SectionLabel, stageState, useBusy, useLoader } from "../shared";
import { ResultView } from "./VoteFlow";
import type { TabProps } from "./types";
import { TabIntro } from "./ui";
import { useTabTour } from "./useTabTour";

/**
 * VOTAÇÃO — situação da votação e o caminho até o resultado.
 *  - Durante a votação: só a participação (quantas pessoas já votaram). Nada de contagem por receita.
 *  - Depois do encerramento: botão "Ver resultado" → vencedor, conferência, confirmar e divulgar.
 *  - O período (início e encerramento) é editado em Configurações; aqui só há "Encerrar votação agora".
 *  - Quem votou em quem fica em Participantes.
 */
export function VotingTab(props: TabProps) {
  const { campaignId, results, perms, onChanged, tourUserId, tourSignal } = props;
  const dash = useLoader<AdminDashboard>(() => campaignsApi.get(`/admin/campaigns/${campaignId}/dashboard`), [campaignId]);
  const { busy, run } = useBusy();
  const tour = useTabTour("voting", { tourUserId, tourSignal, ready: !!dash.data });
  // null = automático (mostra o resultado quando já existe apuração); depois que a pessoa pede, vale a escolha dela.
  const [shown, setShown] = useState<boolean | null>(null);
  const [endNowOpen, setEndNowOpen] = useState(false);

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
  const resultsStatus = res.status ?? "none";
  const finalized = resultsStatus === "confirmed" || resultsStatus === "announced";
  const ended = state === "closed";
  const canSchedule = !!perms.campaigns_schedule;
  const canSeeResult = !!perms.campaigns_results;
  const isBusy = busy !== null;
  const endsAt = vs?.ends_at ?? d.voting_ends_at ?? null;
  const resultShown = shown ?? resultsStatus !== "none";
  const announceAt = resultsStatus === "confirmed" ? (res.announce_at ?? null) : null;
  const refresh = () => { dash.reload(); onChanged(); };

  const endNow = async () => {
    setEndNowOpen(false);
    const r = await run("end", () => campaignsApi.post(`${base}/voting/close`, { end_now: true }), "Votação encerrada.");
    if (r.ok) { setShown(true); refresh(); }
  };

  // "Ver resultado": se ainda não foi apurado, apura agora (o servidor só libera depois do encerramento) e mostra.
  const seeResult = async () => {
    if (resultsStatus === "none") {
      const r = await run("tally", () => campaignsApi.post(`${base}/voting/close`, { end_now: false }));
      if (!r.ok) return;
      refresh();
    }
    setShown(true);
  };

  return (
    <div className="space-y-4">
      <TabIntro>Acompanhe quem já votou. O ganhador fica disponível depois do encerramento da votação.</TabIntro>

      {/* Situação */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-vote-status">
        <CardContent className="grid gap-5 p-5 md:grid-cols-2">
          <div className="space-y-2">
            <SectionLabel>Situação da votação</SectionLabel>
            <Badge className={cn("border px-3 py-1 text-sm", phase.className)}>Votação {phase.label.toLowerCase()}</Badge>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays size={13} aria-hidden="true" /> {vs?.starts_at || vs?.ends_at ? fmtRange(vs?.starts_at, vs?.ends_at) : "Defina o período em Configurações."}
            </p>
            {state === "open" && endsAt && <p className="text-xs font-medium text-foreground">Encerra em {fmtDate(endsAt)} (fim do dia).</p>}
            {announceAt && <p className="text-xs font-medium text-foreground">Divulgação programada para {fmtDayTime(announceAt)}.</p>}
            {state === "paused" && <p className="text-xs font-medium text-foreground">Pausada: ninguém consegue votar por enquanto.</p>}
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

      {/* Resultado */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-vote-result">
        <CardContent className="space-y-4 p-5">
          <SectionLabel>Resultado</SectionLabel>

          {!ended && resultsStatus === "none" ? (
            <div className="space-y-3">
              <Button size="lg" className="w-full gap-2 rounded-2xl sm:w-auto" disabled>
                <Lock size={16} /> Ver ganhador
              </Button>
              <p className="text-sm text-muted-foreground">
                Disponível depois do encerramento oficial da votação{endsAt ? ` (${fmtDate(endsAt)})` : ""}. Até lá, ninguém vê a contagem por receita — nem a gestão —, para o resultado não influenciar os votos.
              </p>
              {canSchedule && state === "open" && (
                <div className="space-y-1 border-t pt-3">
                  <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setEndNowOpen(true)} disabled={isBusy}>
                    {busy === "end" ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />} Encerrar votação agora
                  </Button>
                  <p className="text-[11px] text-muted-foreground">Só se quiser antecipar o fim. Ninguém mais vota (e o envio de receitas também fecha, se ainda estiver aberto).</p>
                </div>
              )}
            </div>
          ) : !canSeeResult ? (
            <Notice tone="info">A votação encerrou. Para ver o resultado é preciso a permissão “Ver apuração”.</Notice>
          ) : !resultShown ? (
            <div className="space-y-3">
              {resultsStatus === "none" && !canSchedule ? (
                <Notice tone="info">A votação encerrou, mas o resultado ainda não foi apurado. Peça a quem gerencia as datas da campanha para apurar.</Notice>
              ) : (
                <>
                  <Button size="lg" className="w-full gap-2 rounded-2xl sm:w-auto" onClick={seeResult} disabled={isBusy}>
                    {busy === "tally" ? <Loader2 size={16} className="animate-spin" /> : <Trophy size={16} />} Ver ganhador
                  </Button>
                  <p className="text-sm text-muted-foreground">A votação encerrou. Veja quem ganhou, confira os números e divulgue.</p>
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

          {finalized && <p className="text-[11px] text-muted-foreground">O vencedor já foi confirmado: a votação não pode mais ser alterada.</p>}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={endNowOpen}
        onOpenChange={setEndNowOpen}
        title="Encerrar a votação agora?"
        description="A votação termina agora e ninguém mais poderá votar. Depois você poderá ver o ganhador, confirmar e divulgar."
        confirmLabel="Encerrar votação"
        variant="destructive"
        onConfirm={endNow}
      />

      <CampaignTour steps={ADMIN_TOUR_TABS.voting} tour={tour} />
    </div>
  );
}
