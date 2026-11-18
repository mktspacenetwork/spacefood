import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { formatInTimeZone } from "date-fns-tz";
import { BarChart3, Check, RefreshCw, Trophy, X } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { Progress } from "../../../../components/ui/progress";
import { cn } from "../../../../lib/utils";
import { TIMEZONE } from "../../../../lib/date-utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { RESULT_STATUS, fmtDate, fmtDateTime, fmtDayTime, plural } from "../../../../lib/campaigns/format";
import type { DisplayState } from "../../../../lib/campaigns/format";
import type {
  AdminDashboard, AdminParticipant, AdminSubmissionRow, PublishCheck,
} from "../../../../lib/campaigns/types";
import { CampaignTour } from "../../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_TABS } from "../../../../lib/campaigns/tours-admin";
import { EmptyBox, ErrorBox, LoadingBox, Notice, SectionLabel, useLoader } from "../shared";
import type { TabProps } from "./types";
import { Fold, TabIntro } from "./ui";
import { useTabTour } from "./useTabTour";

export type SummaryTabProps = TabProps & {
  dashboard: AdminDashboard | null;
  dashboardLoading: boolean;
  dashboardError: string | null;
  onReloadDashboard: () => void;
  display: DisplayState;
  /** Resultado do checklist de publicação (só existe para rascunhos e para quem pode editar). */
  publishCheck: PublishCheck | null;
  /** Avisos de estado + ciclo da campanha + "próximo passo": o painel monta e o Resumo mostra no topo. */
  top?: React.ReactNode;
};

/**
 * Resumo da campanha: mostra só o que ajuda a decidir. Cada bloco respeita a permissão da pessoa
 * e some quando a funcionalidade está desligada ou quando a fase ainda não começou (nada de cartões de zeros).
 * Ordem: situação e próximo passo → números principais → ranking → "Mais indicadores" (recolhido).
 */
export function SummaryTab(props: SummaryTabProps) {
  const {
    campaignId, campaign, perms, goTab, dashboard: d, dashboardLoading, dashboardError, onReloadDashboard, display,
    publishCheck, top, tourUserId, tourSignal, results,
  } = props;
  const navigate = useNavigate();
  const f = campaign.features;
  const isDraft = display === "draft";
  const [moreOpen, setMoreOpen] = useState(false);

  // Gráficos secundários só carregam quando a pessoa abre "Mais indicadores".
  const canSubs = !isDraft && !!perms.campaigns_review && f.submission && (d?.submissions ?? 0) > 0;
  const canParts = !isDraft && !!perms.campaigns_participants && f.submission;
  const subs = useLoader<AdminSubmissionRow[]>(
    () => (canSubs && moreOpen ? campaignsApi.get(`/admin/campaigns/${campaignId}/submissions`) : Promise.resolve([])),
    [campaignId, canSubs, moreOpen, d?.submissions],
  );
  const parts = useLoader<{ items: AdminParticipant[] }>(
    () => (canParts && moreOpen ? campaignsApi.get(`/admin/campaigns/${campaignId}/participants`) : Promise.resolve({ items: [] })),
    [campaignId, canParts, moreOpen, d?.participants],
  );

  // A tour desta aba só abre sozinha quando o conteúdo (e os alvos) já existe.
  const tour = useTabTour("summary", {
    tourUserId, tourSignal,
    ready: isDraft ? true : !!d && !dashboardLoading,
  });
  const tourEl = <CampaignTour steps={ADMIN_TOUR_TABS.summary} tour={tour} />;

  // ───────────────────────── Rascunho: checklist em vez de zeros ─────────────────────────
  if (isDraft) {
    const items = publishCheck?.items ?? [];
    const missing = items.filter((i) => !i.ok);
    const fix = (key: string) =>
      key === "registration_dates" || key === "voting_dates"
        ? () => goTab?.("settings", "period")
        : () => navigate(`/admin/campaigns/${campaignId}/edit`);
    return (
      <div className="space-y-4">
        <TabIntro>Veja o que falta para publicar a campanha.</TabIntro>
        {top}
        {publishCheck ? (
          <Card className="rounded-3xl border" data-tutorial="camp-summary-checklist">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>O que falta para publicar</SectionLabel>
                <Badge className={cn("border text-[10px]", missing.length === 0
                  ? "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
                  : "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300")}>
                  {missing.length === 0 ? "Tudo pronto" : plural(missing.length, "item pendente", "itens pendentes")}
                </Badge>
              </div>
              <ul className="divide-y divide-border">
                {items.map((i) => (
                  <li key={i.key} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex min-w-0 items-start gap-2.5 text-sm">
                      <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", i.ok ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300")}>
                        {i.ok ? <Check size={12} /> : <X size={12} />}
                      </span>
                      <span className={cn("min-w-0", i.ok && "text-muted-foreground")}>{i.message}</span>
                    </span>
                    {!i.ok && (
                      <Button size="sm" variant="outline" className="shrink-0 rounded-xl" onClick={fix(i.key)}>
                        {i.key.endsWith("_dates") ? "Definir datas" : "Corrigir"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                {plural(publishCheck.eligible_count, "colaborador elegível", "colaboradores elegíveis")} quando a campanha for publicada.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Notice tone="info" title="Rascunho">Complete as informações e as datas; depois a pessoa com permissão clica em Publicar.</Notice>
        )}
        <p className="px-1 text-center text-xs text-muted-foreground">
          {f.voting ? "Participação, receitas, votos e ranking aparecem aqui quando a campanha for publicada." : "Participação e receitas aparecem aqui quando a campanha for publicada."}
        </p>
        {tourEl}
      </div>
    );
  }

  // ───────────────────────────── Campanha publicada (ou já tendo história) ─────────────────────────────
  if (dashboardLoading && !d) return <LoadingBox />;
  if (dashboardError && !d) return <ErrorBox message={dashboardError} onRetry={onReloadDashboard} />;
  if (!d) return null;

  const hasVoting = f.voting;
  // Enquanto a votação não encerra, o servidor não manda a contagem por receita: aqui nada de placar parcial.
  const resultsLocked = hasVoting && !!d.results_locked;
  const votingEnds = d.voting_ends_at ?? d.stages.find((x) => x.stage_key === "voting")?.ends_at ?? null;
  const rs = d.results?.status ?? "none";
  const rsMeta = RESULT_STATUS[rs];
  // Divulgação programada (vem do registro da campanha; o painel do resumo traz só o essencial).
  const announceAt = rs === "confirmed" ? (results?.announce_at ?? d.results?.announce_at ?? null) : null;
  const tally = resultsLocked ? [] : d.tally ?? [];
  const official = rs === "confirmed" || rs === "announced";
  const canGoVoting = !!goTab && (!!perms.campaigns_schedule || !!perms.campaigns_results || !!perms.campaigns_votes_view);
  const share = (n: number) => (d.submissions > 0 ? (n / d.submissions) * 100 : 0);
  const showVotes = hasVoting;
  const showResult = hasVoting;
  const showRanking = hasVoting && !resultsLocked && !!perms.campaigns_results && tally.length > 0;
  const maxVotes = Math.max(0, ...tally.map((t) => t.votes));

  const refresh = () => {
    onReloadDashboard();
    if (moreOpen) {
      subs.reload();
      parts.reload();
    }
  };

  const hasMore = d.submissions > 0 && (canSubs || canParts);

  return (
    <div className="space-y-5">
      <TabIntro
        action={(
          <Button variant="ghost" size="sm" className="gap-2 rounded-xl text-muted-foreground" onClick={refresh} disabled={dashboardLoading}>
            <RefreshCw size={13} className={cn(dashboardLoading && "animate-spin")} /> Atualizar
          </Button>
        )}
      >
        Veja o que fazer agora e os números que importam.
      </TabIntro>

      {top}

      <div data-tutorial="camp-summary-cards" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Participação */}
        <Card className="rounded-3xl border">
          <CardContent className="space-y-3 p-5">
            <SectionLabel>Participação</SectionLabel>
            <div className="flex items-end justify-between gap-3">
              <p className="text-foreground">
                <span className="text-3xl font-bold tabular-nums">{d.participants}</span>
                <span className="ml-1.5 text-sm text-muted-foreground">de {d.eligible}</span>
              </p>
              <span className="text-lg font-bold tabular-nums text-primary">{d.participation_pct}%</span>
            </div>
            <Progress value={d.participation_pct} aria-label="Participação" />
            <p className="text-[11px] text-muted-foreground">colaboradores elegíveis que enviaram uma receita</p>
          </CardContent>
        </Card>

        {/* Receitas */}
        {f.submission && (
          <Card className="rounded-3xl border">
            <CardContent className="space-y-3 p-5">
              <SectionLabel>Receitas</SectionLabel>
              <p className="text-foreground">
                <span className="text-3xl font-bold tabular-nums">{d.submissions}</span>
                <span className="ml-1.5 text-sm text-muted-foreground">enviadas</span>
              </p>
              <div
                className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${d.approved} aprovadas, ${d.pending} em análise, ${d.rejected} reprovadas`}
              >
                <span className="bg-green-500" style={{ width: `${share(d.approved)}%` }} />
                <span className="bg-yellow-400" style={{ width: `${share(d.pending)}%` }} />
                <span className="bg-red-400" style={{ width: `${share(d.rejected)}%` }} />
              </div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <li className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />{d.approved} aprovadas</li>
                <li className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400" />{d.pending} em análise</li>
                {d.rejected > 0 && <li className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />{d.rejected} reprovadas</li>}
              </ul>
              {d.pending > 0 && perms.campaigns_review && goTab && (
                <button type="button" onClick={() => goTab("submissions")} className="text-xs font-semibold text-primary hover:underline">
                  {plural(d.pending, "receita aguarda análise", "receitas aguardam análise")} →
                </button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Votos (só depois que a votação começou) */}
        {showVotes && (
          <Card className="rounded-3xl border">
            <CardContent className="space-y-3 p-5">
              <SectionLabel>Votos</SectionLabel>
              <p className="text-foreground">
                <span className="text-3xl font-bold tabular-nums">{d.votes_valid}</span>
                <span className="ml-1.5 text-sm text-muted-foreground">{d.votes_valid === 1 ? "voto válido" : "votos válidos"}</span>
              </p>
              <Progress value={d.voting_pct} aria-label="Quem já votou" />
              <p className="text-[11px] text-muted-foreground">
                {d.voting_pct}% dos elegíveis já votaram ({d.voters} de {d.eligible})
              </p>
              {d.votes_invalidated > 0 && (
                <p className="text-[11px] text-orange-600 dark:text-orange-300">
                  {plural(d.votes_invalidated, "voto invalidado", "votos invalidados")}
                  {goTab && perms.campaigns_participants && (
                    <> · <button type="button" className="font-semibold underline" onClick={() => goTab("participants")}>ver em Participantes</button></>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Resultado */}
        {showResult && (
          <Card className="rounded-3xl border">
            <CardContent className="space-y-3 p-5">
              <SectionLabel>Resultado</SectionLabel>
              {resultsLocked ? (
                <>
                  <Badge className="border border-blue-200 bg-blue-100 text-[11px] text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">Votação em andamento</Badge>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    O resultado só aparece depois do encerramento{votingEnds ? ` (${fmtDate(votingEnds)})` : ""}.
                  </p>
                </>
              ) : (
                <>
                  <Badge className={cn("border text-[11px]", announceAt ? "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300" : rsMeta.className)}>
                    {announceAt ? "Divulgação programada" : rsMeta.label}
                  </Badge>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    {rs === "none" && "A votação encerrou. Veja o ganhador."}
                    {rs === "preliminary" && "Confira o resultado e confirme o ganhador."}
                    {rs === "tie_pending" && "Há empate: registre a decisão para continuar."}
                    {rs === "confirmed" && !announceAt && `Ganhador confirmado em ${fmtDateTime(d.results?.confirmed_at)}.`}
                    {rs === "confirmed" && announceAt && `Será divulgado em ${fmtDayTime(announceAt)}.`}
                    {rs === "announced" && `Divulgado em ${fmtDateTime(d.results?.announced_at)}.`}
                  </p>
                  {canGoVoting && (
                    <button type="button" onClick={() => goTab?.("voting")} className="text-xs font-semibold text-primary hover:underline">
                      {rs === "confirmed" && !announceAt ? "Divulgar resultado →" : rs === "announced" ? "Ver resultado →" : "Ver ganhador →"}
                    </button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Ranking: as 5 mais votadas */}
      {showRanking && (
        <Card className="rounded-3xl border" data-tutorial="camp-summary-ranking">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>Ranking · 5 mais votadas</SectionLabel>
              <Badge className={cn("border text-[10px]", official
                ? "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
                : "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300")}>
                {official ? "Oficial" : "Preliminar"}
              </Badge>
            </div>
            <ol className="space-y-3">
              {tally.slice(0, 5).map((t, i) => (
                <li key={t.submission_id} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <b className="mr-2 text-muted-foreground">{i + 1}º</b>
                      {t.dish_name} <span className="text-muted-foreground">— {t.author}</span>
                      {official && d.results?.winner_submission_id === t.submission_id && <Trophy size={13} className="ml-2 inline text-amber-500" aria-label="Vencedora" />}
                    </span>
                    <b className="shrink-0 tabular-nums">{t.votes}</b>
                  </div>
                  <Progress value={maxVotes > 0 ? (t.votes / maxVotes) * 100 : 0} aria-label={`${t.dish_name}: ${t.votes} votos`} />
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Ritmo e alcance: recolhido para não encher a tela; só carrega ao abrir */}
      {hasMore && (
        <Fold
          title="Mais indicadores"
          hint="Receitas enviadas por dia e participação por unidade."
          icon={<BarChart3 size={18} />}
          open={moreOpen}
          onOpenChange={setMoreOpen}
          tutorial="camp-summary-more"
        >
          <MoreIndicators
            wantSubs={canSubs}
            wantParts={canParts}
            subsLoading={subs.loading && !subs.data?.length}
            partsLoading={parts.loading && !parts.data?.items.length}
            subsError={subs.error}
            partsError={parts.error}
            rows={subs.data ?? []}
            items={parts.data?.items ?? []}
            onRetry={() => { subs.reload(); parts.reload(); }}
          />
        </Fold>
      )}

      {d.submissions === 0 && (
        <EmptyBox
          icon={<BarChart3 size={34} />}
          title="Nenhuma receita enviada ainda"
          hint="Quando as receitas chegarem, o ritmo de envios por dia e a participação por unidade aparecem aqui."
        />
      )}
      {tourEl}
    </div>
  );
}

function MoreIndicators({
  wantSubs, wantParts, subsLoading, partsLoading, subsError, partsError, rows, items, onRetry,
}: {
  wantSubs: boolean;
  wantParts: boolean;
  subsLoading: boolean;
  partsLoading: boolean;
  subsError: string | null;
  partsError: string | null;
  rows: AdminSubmissionRow[];
  items: AdminParticipant[];
  onRetry: () => void;
}) {
  const loading = (wantSubs && subsLoading) || (wantParts && partsLoading);
  if (loading) return <LoadingBox />;
  const error = (wantSubs && subsError) || (wantParts && partsError);
  if (error && rows.length === 0 && items.length === 0) return <ErrorBox message={error} onRetry={onRetry} />;
  const daily = wantSubs && rows.length > 0;
  const byUnit = wantParts && items.length > 0;
  if (!daily && !byUnit) return <p className="text-sm text-muted-foreground">Ainda não há dados suficientes para estes gráficos.</p>;
  return (
    <div className={cn("grid grid-cols-1 gap-5", daily && byUnit && "lg:grid-cols-2")}>
      {daily && <DailyBars rows={rows} />}
      {byUnit && <UnitBars items={items} />}
    </div>
  );
}

// ───────────────────────────────── Gráficos simples (CSS) ─────────────────────────────────

function WidgetShell({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <SectionLabel>{title}</SectionLabel>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const dayKey = (iso: string) => formatInTimeZone(new Date(iso), TIMEZONE, "yyyy-MM-dd");

/** Receitas enviadas por dia (dia de Brasília), no máximo os últimos 30 dias. */
function DailyBars({ rows }: { rows: AdminSubmissionRow[] }) {
  const { days, total, max, peak } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!r.submitted_at) continue;
      const k = dayKey(r.submitted_at);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const keys = [...counts.keys()].sort();
    if (keys.length === 0) return { days: [] as { key: string; n: number }[], total: 0, max: 0, peak: "" };
    const today = dayKey(new Date().toISOString());
    const first = keys[0];
    const last = keys[keys.length - 1] > today ? keys[keys.length - 1] : today;
    const list: { key: string; n: number }[] = [];
    for (let t = new Date(`${first}T12:00:00Z`).getTime(); ; t += 86_400_000) {
      const k = new Date(t).toISOString().slice(0, 10);
      list.push({ key: k, n: counts.get(k) ?? 0 });
      if (k >= last || list.length > 400) break;
    }
    const shown = list.slice(-30);
    const mx = Math.max(...shown.map((x) => x.n));
    const pk = shown.find((x) => x.n === mx);
    return { days: shown, total: shown.reduce((s, x) => s + x.n, 0), max: mx, peak: pk ? pk.key : "" };
  }, [rows]);

  if (days.length === 0) return null;
  const label = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  const step = Math.max(1, Math.ceil(days.length / 6));

  return (
    <WidgetShell title="Receitas enviadas por dia" hint={days.length > 1 ? `${plural(total, "receita", "receitas")} em ${plural(days.length, "dia", "dias")}` : undefined}>
      <div
        role="img"
        aria-label={`Receitas enviadas por dia: ${total} no total; maior dia ${label(peak)} com ${max}.`}
      >
        <div className="flex h-28 items-end justify-center gap-1">
          {days.map((x) => (
            <div key={x.key} className="flex h-full min-w-0 max-w-10 flex-1 flex-col items-center justify-end gap-1" title={`${label(x.key)}: ${x.n}`}>
              {days.length <= 14 && x.n > 0 && <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{x.n}</span>}
              <div
                className={cn("w-full rounded-t-md", x.n > 0 ? "bg-primary/80" : "bg-muted")}
                style={{ height: x.n > 0 ? `${Math.max(8, (x.n / max) * 80)}%` : "3px" }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-center gap-1">
          {days.map((x, i) => (
            <span key={x.key} className="min-w-0 max-w-10 flex-1 truncate text-center text-[9px] text-muted-foreground">
              {i % step === 0 || i === days.length - 1 ? label(x.key) : ""}
            </span>
          ))}
        </div>
      </div>
    </WidgetShell>
  );
}

/** Participação por unidade: quem enviou receita entre os elegíveis de cada sede. */
function UnitBars({ items }: { items: AdminParticipant[] }) {
  const groups = useMemo(() => {
    // Com várias receitas por pessoa há uma linha por receita: aqui conta cada PESSOA uma vez.
    const people = new Map<string, { unit: string; sent: boolean }>();
    for (const p of items) {
      const cur = people.get(p.user_id) ?? { unit: p.unit?.trim() || "Sem unidade", sent: false };
      if (p.submission_id && p.submission_status && p.submission_status !== "pending_media") cur.sent = true;
      people.set(p.user_id, cur);
    }
    const m = new Map<string, { eligible: number; sent: number }>();
    for (const { unit, sent } of people.values()) {
      const g = m.get(unit) ?? { eligible: 0, sent: 0 };
      g.eligible += 1;
      if (sent) g.sent += 1;
      m.set(unit, g);
    }
    return [...m.entries()].sort((a, b) => b[1].eligible - a[1].eligible);
  }, [items]);

  if (groups.length === 0) return null;
  return (
    <WidgetShell title="Participação por unidade" hint="Quem enviou receita entre os elegíveis de cada unidade.">
      <ul className="space-y-3.5">
        {groups.map(([name, g]) => {
          const pct = g.eligible > 0 ? Math.round((g.sent / g.eligible) * 100) : 0;
          return (
            <li key={name} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <b className="text-foreground">{g.sent}</b> de {g.eligible} · {pct}%
                </span>
              </div>
              <Progress value={pct} aria-label={`${name}: ${pct}%`} />
            </li>
          );
        })}
      </ul>
    </WidgetShell>
  );
}
