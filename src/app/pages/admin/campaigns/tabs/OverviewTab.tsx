import { Lock, Trophy } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { Progress } from "../../../../components/ui/progress";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { RESULT_STATUS, STAGE_LABEL, fmtDateTime, plural } from "../../../../lib/campaigns/format";
import type { AdminDashboard } from "../../../../lib/campaigns/types";
import { ErrorBox, LoadingBox, Notice, SectionLabel, Stat, useLoader } from "../shared";
import type { TabProps } from "./types";

export function OverviewTab({ campaignId, campaign, perms, goTab }: TabProps) {
  const { data, loading, error, reload } = useLoader<AdminDashboard>(
    () => campaignsApi.get(`/admin/campaigns/${campaignId}/dashboard`),
    [campaignId],
  );

  if (loading && !data) return <LoadingBox />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const rs = data.results?.status ?? "none";
  const rsMeta = RESULT_STATUS[rs];
  const hasVoting = campaign.features.voting;
  const tally = data.tally ?? [];
  const maxVotes = Math.max(1, ...tally.map((t) => t.votes));

  return (
    <div className="space-y-5">
      {data.pending > 0 && hasVoting && !data.locked && (
        <Notice tone="warn" title={`${plural(data.pending, "receita aguarda", "receitas aguardam")} análise`}>
          <div className="flex flex-wrap items-center gap-3">
            <span>Quando a votação começar, as receitas ainda pendentes ficam de fora e a lista de candidatas é congelada.</span>
            {perms.campaigns_review && goTab && (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => goTab("submissions")}>Analisar receitas</Button>
            )}
          </div>
        </Notice>
      )}
      {data.locked && (
        <Notice tone="info" title="A votação começou">
          <span className="inline-flex items-center gap-1.5"><Lock size={12} /> As receitas estão bloqueadas para edição e a lista de candidatas está congelada.</span>
        </Notice>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Stat label="Elegíveis" value={data.eligible} />
        <Stat label="Receitas enviadas" value={data.submissions} />
        <Stat label="Pendentes" value={data.pending} />
        <Stat label="Aprovadas" value={data.approved} />
        <Stat label="Reprovadas" value={data.rejected} />
        <Stat label="Participantes" value={data.participants} />
        {hasVoting && <Stat label="Votos válidos" value={data.votes_valid} hint={`${data.votes_registered} registrados`} />}
        {hasVoting && <Stat label="Votos invalidados" value={data.votes_invalidated} />}
      </div>

      <Card className="rounded-3xl border">
        <CardContent className="p-5 space-y-4">
          <SectionLabel>Engajamento</SectionLabel>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm"><span>Participação (enviaram receita)</span><b className="tabular-nums">{data.participation_pct}%</b></div>
            <Progress value={data.participation_pct} />
          </div>
          {hasVoting && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm"><span>Quem já votou</span><b className="tabular-nums">{data.voting_pct}% ({data.voters})</b></div>
              <Progress value={data.voting_pct} />
            </div>
          )}
        </CardContent>
      </Card>

      {hasVoting && (
        <Card className="rounded-3xl border">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>Apuração</SectionLabel>
              <Badge className={cn("border text-[10px]", rsMeta.className)}>{rsMeta.label}</Badge>
            </div>
            {data.results?.confirmed_at && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Trophy size={12} /> Vencedor confirmado em {fmtDateTime(data.results.confirmed_at)}
                {data.results.announced_at ? ` · divulgado em ${fmtDateTime(data.results.announced_at)}` : ""}
              </p>
            )}
            {perms.campaigns_results ? (
              tally.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não há receitas aprovadas para a votação.</p>
              ) : (
                <ol className="space-y-3">
                  {tally.slice(0, 5).map((t, i) => (
                    <li key={t.submission_id} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate"><b className="text-muted-foreground mr-2">{i + 1}º</b>{t.dish_name} <span className="text-muted-foreground">— {t.author}</span></span>
                        <b className="tabular-nums shrink-0">{t.votes}</b>
                      </div>
                      <Progress value={(t.votes / maxVotes) * 100} />
                    </li>
                  ))}
                </ol>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Você não tem permissão para ver a contagem de votos por receita.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-3xl border">
        <CardContent className="p-5 space-y-2">
          <SectionLabel>Etapas</SectionLabel>
          <ul className="divide-y divide-border text-sm">
            {data.stages.map((s) => (
              <li key={s.stage_key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{STAGE_LABEL[s.stage_key] ?? s.stage_key}{s.paused ? " (pausada)" : ""}</span>
                <span className="text-xs text-muted-foreground">{s.starts_at || s.ends_at ? `${fmtDateTime(s.starts_at)} → ${fmtDateTime(s.ends_at)}` : "Sem datas"}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
