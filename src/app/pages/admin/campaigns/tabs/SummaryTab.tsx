import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { formatInTimeZone } from "date-fns-tz";
import { BarChart3, Check, ChevronRight, RefreshCw, X } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { Progress } from "../../../../components/ui/progress";
import { cn } from "../../../../lib/utils";
import { TIMEZONE } from "../../../../lib/date-utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { AUDIT_ACTION, RESULT_STATUS, fmtDateTime, fmtDayTime, plural } from "../../../../lib/campaigns/format";
import type { DisplayState } from "../../../../lib/campaigns/format";
import type {
  AdminAuditRow, AdminDashboard, AdminDraw, AdminParticipant, AdminSubmissionRow, PublishCheck,
} from "../../../../lib/campaigns/types";
import { CampaignTour } from "../../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_TABS } from "../../../../lib/campaigns/tours-admin";
import { EmptyBox, ErrorBox, LoadingBox, Notice, SectionLabel, stageState, useLoader } from "../shared";
import type { TabProps } from "./types";
import { Cronograma } from "./Cronograma";
import { Fold } from "./ui";
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

  // As receitas alimentam "Últimas atividades" e os gráficos; a lista de pessoas só carrega em "Mais indicadores".
  const canSubs = !isDraft && !!perms.campaigns_review && f.submission && (d?.submissions ?? 0) > 0;
  const canParts = !isDraft && !!perms.campaigns_participants && f.submission;
  const canDraw = !isDraft && !!f.draw && !!perms.campaigns_results;
  const subs = useLoader<AdminSubmissionRow[]>(
    () => (canSubs ? campaignsApi.get(`/admin/campaigns/${campaignId}/submissions`) : Promise.resolve([])),
    [campaignId, canSubs, d?.submissions],
  );
  const parts = useLoader<{ items: AdminParticipant[] }>(
    () => (canParts && moreOpen ? campaignsApi.get(`/admin/campaigns/${campaignId}/participants`) : Promise.resolve({ items: [] })),
    [campaignId, canParts, moreOpen, d?.participants],
  );
  // Estado do sorteio (só campanhas com sorteio). Falha = sem informação extra, nunca quebra a tela.
  const draw = useLoader<AdminDraw | null>(
    () => (canDraw ? campaignsApi.get<AdminDraw>(`/admin/campaigns/${campaignId}/draw`).catch(() => null) : Promise.resolve(null)),
    [campaignId, canDraw, d?.results?.status],
  );
  const audit = useLoader<AdminAuditRow[]>(
    () => (isDraft ? Promise.resolve([]) : campaignsApi.get<AdminAuditRow[]>(`/admin/campaigns/${campaignId}/audit`).catch(() => [])),
    [campaignId, isDraft, d?.submissions, d?.votes_valid, d?.results?.status],
  );

  // Últimas atividades: poucas linhas, as mais recentes entre receitas enviadas e movimentações relevantes.
  const recent = useMemo(() => {
    const out: { key: string; at: string; text: string; sub?: string }[] = [];
    for (const r of (subs.data ?? []).slice(0, 4)) {
      if (r.submitted_at) out.push({ key: `s-${r.id}`, at: r.submitted_at, text: `${r.user_name} enviou “${r.dish_name}”` });
    }
    let n = 0;
    const seen = new Set<string>(); // cada tipo de movimentação uma vez (a mais recente), para não repetir "Campanha editada"
    for (const a of audit.data ?? []) {
      if (n >= 4) break;
      if (!RECENT_ACTIONS.has(a.action) || seen.has(a.action)) continue;
      seen.add(a.action);
      out.push({ key: `a-${a.id}`, at: a.occurred_at, text: AUDIT_ACTION[a.action] ?? a.action, sub: a.actor_name || undefined });
      n++;
    }
    return out.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime()).slice(0, 5);
  }, [subs.data, audit.data]);

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
        {top}
        <Cronograma campaign={campaign} stages={props.stages} results={results} display={display} />
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
        {tourEl}
      </div>
    );
  }

  // ───────────────────────────── Campanha publicada (ou já tendo história) ─────────────────────────────
  if (dashboardLoading && !d) return <LoadingBox />;
  if (dashboardError && !d) return <ErrorBox message={dashboardError} onRetry={onReloadDashboard} />;
  if (!d) return null;

  const hasVoting = f.voting;
  const hasDraw = !!f.draw;
  const votingStage = d.stages.find((x) => x.stage_key === "voting");
  // Ranking parcial: enquanto a votação está aberta, os números são só da gestão e ainda podem mudar.
  const votingOpen = hasVoting && (d.voting_live ?? ["open", "paused"].includes(stageState(votingStage)));
  const rs = d.results?.status ?? "none";
  const rsMeta = RESULT_STATUS[rs];
  const announceAt = rs === "confirmed" ? (results?.announce_at ?? d.results?.announce_at ?? null) : null;
  const share = (n: number) => (d.submissions > 0 ? (n / d.submissions) * 100 : 0);

  // Cada indicador leva à tela detalhada (quando a pessoa tem acesso a ela).
  const go = (tab: string, section?: string) => (goTab ? () => goTab(tab, section) : undefined);
  const toRecipes = perms.campaigns_review ? go("submissions") : perms.campaigns_participants ? go("submissions", "people") : undefined;
  const toPeople = perms.campaigns_participants ? go("submissions", "people") : perms.campaigns_review ? go("submissions") : undefined;
  const toVoting = hasVoting ? go("voting") : undefined;
  const drawView = draw.data;
  const toDraw = hasDraw && (perms.campaigns_results || perms.campaigns_winner_confirm || perms.campaigns_announce) ? go("draw") : undefined;

  const refresh = () => {
    onReloadDashboard();
    subs.reload();
    audit.reload();
    draw.reload();
    if (moreOpen) parts.reload();
  };

  const hasMore = d.submissions > 0 && (canSubs || canParts);

  const drawStatus = (() => {
    const x = drawView?.draw;
    if (x?.announced_at) return { label: "Divulgado", hint: `Divulgado em ${fmtDateTime(x.announced_at)}.`, className: "border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300" };
    if (x?.announce_at) return { label: "Divulgação programada", hint: `Será divulgado em ${fmtDayTime(x.announce_at)}.`, className: "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300" };
    if (x?.confirmed_at) return { label: "Confirmado", hint: "Falta divulgar os ganhadores.", className: "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300" };
    if (x) return { label: "Sorteado", hint: "Confira e confirme os ganhadores.", className: "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300" };
    if (drawView?.can_run) return { label: "Pronto para sortear", hint: `${plural(drawView.eligible_count, "pessoa concorre", "pessoas concorrem")}.`, className: "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300" };
    return { label: "Aguardando", hint: drawView?.reason ?? "Disponível depois do fim da participação.", className: "border-border bg-muted text-muted-foreground" };
  })();

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="gap-2 rounded-xl text-muted-foreground" onClick={refresh} disabled={dashboardLoading}>
          <RefreshCw size={13} className={cn(dashboardLoading && "animate-spin")} /> Atualizar
        </Button>
      </div>

      {top}

      <div data-tutorial="camp-summary-cards" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Receitas */}
        {f.submission && (
          <Kpi label="Receitas" onClick={toRecipes}>
            <p className="text-foreground">
              <span className="text-3xl font-bold tabular-nums">{d.submissions}</span>
              <span className="ml-1.5 text-sm text-muted-foreground">cadastradas</span>
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
          </Kpi>
        )}

        {/* Participantes */}
        <Kpi label="Participantes" onClick={toPeople}>
          <div className="flex items-end justify-between gap-3">
            <p className="text-foreground">
              <span className="text-3xl font-bold tabular-nums">{d.participants}</span>
              <span className="ml-1.5 text-sm text-muted-foreground">de {d.eligible}</span>
            </p>
            <span className="text-lg font-bold tabular-nums text-primary">{d.participation_pct}%</span>
          </div>
          <Progress value={d.participation_pct} aria-label="Participação" />
          <p className="text-[11px] text-muted-foreground">elegíveis que enviaram receita</p>
        </Kpi>

        {/* Votos */}
        {hasVoting && (
          <Kpi label="Votos" onClick={toVoting}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-foreground">
                <span className="text-3xl font-bold tabular-nums">{d.votes_valid}</span>
                <span className="ml-1.5 text-sm text-muted-foreground">{d.votes_valid === 1 ? "voto válido" : "votos válidos"}</span>
              </p>
              {votingOpen && (
                <Badge className="border border-yellow-200 bg-yellow-100 text-[10px] text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300">Parcial</Badge>
              )}
            </div>
            <Progress value={d.voting_pct} aria-label="Quem já votou" />
            <p className="text-[11px] text-muted-foreground">{d.voting_pct}% dos elegíveis votaram ({d.voters} de {d.eligible})</p>
          </Kpi>
        )}

        {/* Resultado da votação */}
        {hasVoting && f.announcement && (
          <Kpi label="Resultado" onClick={toVoting}>
            <Badge className={cn("border text-[11px]",
              announceAt || (rs === "none" && votingOpen)
                ? "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                : rsMeta.className)}>
              {announceAt ? "Divulgação programada" : rs === "none" && votingOpen ? "Votação em andamento" : rsMeta.label}
            </Badge>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {rs === "none" && votingOpen && "O ranking parcial está na aba Votação."}
              {rs === "none" && !votingOpen && "A votação encerrou. Veja o ganhador."}
              {rs === "preliminary" && "Confira o resultado e confirme o ganhador."}
              {rs === "tie_pending" && "Há empate: registre a decisão."}
              {rs === "confirmed" && !announceAt && "Ganhador confirmado. Falta divulgar."}
              {rs === "confirmed" && announceAt && `Será divulgado em ${fmtDayTime(announceAt)}.`}
              {rs === "announced" && `Divulgado em ${fmtDateTime(d.results?.announced_at)}.`}
            </p>
          </Kpi>
        )}

        {/* Sorteio */}
        {hasDraw && (
          <Kpi label="Sorteio" onClick={toDraw}>
            <Badge className={cn("border text-[11px]", drawStatus.className)}>{drawStatus.label}</Badge>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {drawStatus.hint} {f.draw_winners ? `${plural(f.draw_winners, "ganhador", "ganhadores")}.` : ""}
            </p>
          </Kpi>
        )}
      </div>

      <Cronograma campaign={campaign} stages={props.stages} results={results} display={display} draw={drawView} />

      {/* Últimas atividades: só o necessário para um olhar rápido */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-summary-recent">
        <CardContent className="space-y-2 p-5">
          <SectionLabel>Últimas atividades</SectionLabel>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{subs.loading || audit.loading ? "Carregando…" : "Nada por aqui ainda."}</p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((r) => (
                <li key={r.key} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {r.text}
                    {r.sub && <span className="text-muted-foreground"> · {r.sub}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDayTime(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Ritmo e alcance: recolhido para não encher a tela; só carrega ao abrir */}
      {hasMore && (
        <Fold
          title="Mais indicadores"
          hint="Receitas por dia e participação por unidade."
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
          hint="Quando as receitas chegarem, os números e as atividades aparecem aqui."
        />
      )}
      {tourEl}
    </div>
  );
}

/** Ações do histórico que valem como "movimentação relevante" na visão geral (sem votos nem exportações). */
const RECENT_ACTIONS = new Set([
  "PUBLISH_CAMPAIGN", "SUSPEND_CAMPAIGN", "RESUME_CAMPAIGN", "CLOSE_CAMPAIGN", "UPDATE_CAMPAIGN", "SET_PERIOD",
  "APPROVE_SUBMISSION", "REJECT_SUBMISSION", "END_VOTING_NOW", "CLOSE_VOTING", "DECIDE_TIE", "CONFIRM_WINNER",
  "ANNOUNCE_RESULTS", "SCHEDULE_ANNOUNCEMENT", "RUN_DRAW", "DISCARD_DRAW", "CONFIRM_DRAW", "ANNOUNCE_DRAW",
  "GENERATE_BOOK", "PUBLISH_BOOK", "WITHDRAW_BOOK",
]);

/** Indicador do painel. Com `onClick` vira um botão (abre a tela detalhada); sem acesso a ela, fica só informativo. */
function Kpi({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  const head = (
    <div className="flex items-center justify-between gap-2">
      <SectionLabel>{label}</SectionLabel>
      {onClick && <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
    </div>
  );
  const base = "block w-full space-y-2.5 rounded-3xl border border-border bg-card p-4 text-left text-card-foreground shadow-sm sm:p-5";
  if (!onClick) return <div className={base}>{head}{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: abrir detalhes`}
      className={cn(base, "transition-colors hover:bg-accent/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      {head}
      {children}
    </button>
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
