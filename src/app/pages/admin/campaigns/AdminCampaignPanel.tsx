import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft, BarChart3, CalendarDays, ChefHat, Compass, Copy, EyeOff, Loader2, Megaphone, MoreHorizontal, Pencil, Play, Rocket,
  Send, Settings, Users, Vote,
} from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../context/auth-context";
import { campaignsApi } from "../../../lib/campaigns/api";
import {
  DISPLAY_STATE, PHASE_STATE, RESULT_STATUS, campaignDisplayState, fmtDateTime, fmtDayTime, fmtRange, fmtShort, plural,
} from "../../../lib/campaigns/format";
import type { DisplayState } from "../../../lib/campaigns/format";
import type {
  AdminCampaign, AdminCampaignDetail, AdminDashboard, AdminResults, AdminStageRow, PublishCheck,
} from "../../../lib/campaigns/types";
import { TourButton } from "../../../components/campaigns/CampaignTour";
import { useCampaignPerms } from "./useCampaignPerms";
import { PublishDialog } from "./PublishDialog";
import { DuplicateDialog } from "./DuplicateDialog";
import { ErrorBox, LoadingBox, Notice, ReasonDialog, RestrictedBox, stageState, useBusy, useLoader } from "./shared";
import { SummaryTab } from "./tabs/SummaryTab";
import { SubmissionsTab } from "./tabs/SubmissionsTab";
import { ParticipantsTab } from "./tabs/ParticipantsTab";
import { VotingTab } from "./tabs/VotingTab";
import { SettingsTab } from "./tabs/SettingsTab";
import type { RiskKind } from "./tabs/SettingsTab";
import type { TabProps } from "./tabs/types";

type Confirm = "resume" | "archive" | "draft" | "delete" | "review" | null;
type Reasoned = "suspend" | "close" | null;
type Phase = ReturnType<typeof stageState>;

const YELLOW = "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800";

// Abas antigas (links e favoritos) continuam funcionando.
const LEGACY_TABS: Record<string, { tab: string; section?: string }> = {
  overview: { tab: "summary" },
  results: { tab: "voting" },
  schedule: { tab: "settings", section: "period" },
  history: { tab: "settings", section: "history" },
  reports: { tab: "settings", section: "reports" },
};

const stageOf = (stages: AdminStageRow[], k: AdminStageRow["stage_key"]) => stages.find((s) => s.stage_key === k);

// ───────────────────────────── Situação atual (selo de fase) ─────────────────────────────

function phaseBadge(
  c: AdminCampaign, display: DisplayState, results: AdminResults | null, regState: Phase, votState: Phase,
): { label: string; className: string } | null {
  if (display === "closed" || display === "archived" || display === "unpublished") return null;
  if (display === "draft") return regState === "unset" ? { label: "Sem datas", className: PHASE_STATE.unset.className } : null;
  const rs = results?.status ?? "none";
  if (c.features.voting) {
    if (rs === "announced") return { label: "Resultado divulgado", className: RESULT_STATUS.announced.className };
    if (rs === "confirmed" && results?.announce_at) return { label: "Divulgação programada", className: PHASE_STATE.upcoming.className };
    if (rs === "confirmed") return { label: "Vencedor confirmado", className: RESULT_STATUS.confirmed.className };
    if (rs === "tie_pending") return { label: "Empate a decidir", className: RESULT_STATUS.tie_pending.className };
    if (rs === "preliminary") return { label: "Resultado pronto", className: RESULT_STATUS.preliminary.className };
    if (votState === "closed") return { label: "Votação encerrada", className: PHASE_STATE.closed.className };
    if (votState === "open") return { label: "Votação aberta", className: PHASE_STATE.open.className };
    if (votState === "paused") return { label: "Votação pausada", className: PHASE_STATE.paused.className };
  }
  if (regState === "open") return { label: "Participação aberta", className: PHASE_STATE.open.className };
  if (regState === "paused") return { label: "Participação pausada", className: PHASE_STATE.paused.className };
  if (regState === "closed") return { label: "Participação encerrada", className: PHASE_STATE.closed.className };
  if (regState === "upcoming") return { label: "Começa em breve", className: PHASE_STATE.upcoming.className };
  return { label: "Sem datas", className: PHASE_STATE.unset.className };
}

// ─────────────────────────────── Período (uma linha) ───────────────────────────────

/** "faltam 3 dias" / "termina hoje" (o encerramento vale até o fim do dia). */
function daysLeftText(ends: string): string | null {
  const ms = new Date(ends).getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.ceil(ms / 86_400_000);
  return days <= 1 ? "termina hoje" : `faltam ${days} dias`;
}

function PeriodLine({
  display, stages, hasVoting, results,
}: { display: DisplayState; stages: AdminStageRow[]; hasVoting: boolean; results: AdminResults | null }) {
  const reg = stageOf(stages, "registration");
  const vot = stageOf(stages, "voting");
  const regState = stageState(reg);
  const votState = stageState(vot);
  const live = display === "published" || display === "scheduled";
  let status: string;
  if (display === "closed") status = "Encerrada";
  else if (display === "archived") status = "Arquivada";
  else if (display === "draft") status = reg?.starts_at ? "Rascunho" : "Defina o período";
  else if (display === "unpublished") status = "Não publicada";
  else if (regState === "unset") status = "Sem datas";
  else if (regState === "upcoming") status = `Começa em ${fmtShort(reg?.starts_at)}`;
  else if (regState === "open") status = "Aberta";
  else if (regState === "paused") status = "Pausada";
  else status = "Encerrada";
  const left = live && (regState === "open" || regState === "paused") && reg?.ends_at ? daysLeftText(reg.ends_at) : null;
  const votStatus = !live ? null : votState === "unset" ? null : PHASE_STATE[votState].label;
  const scheduledAt = hasVoting && results?.status === "confirmed" ? results.announce_at ?? null : null;

  return (
    <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border p-3.5 hover:shadow-sm" data-tutorial="camp-panel-cycle">
      <CalendarDays size={18} className="shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5 text-sm text-foreground">
        <p>
          {hasVoting && <span className="text-muted-foreground">Participação </span>}
          <b>{fmtRange(reg?.starts_at, reg?.ends_at)}</b>
          <span className="text-muted-foreground"> · {status}{left ? ` · ${left}` : ""}</span>
        </p>
        {hasVoting && (
          <p>
            <span className="text-muted-foreground">Votação </span>
            <b>{fmtRange(vot?.starts_at, vot?.ends_at)}</b>
            {votStatus && <span className="text-muted-foreground"> · {votStatus}</span>}
          </p>
        )}
        {scheduledAt && (
          <p className="text-[13px] text-muted-foreground">Divulgação do resultado: <b className="text-foreground">{fmtDayTime(scheduledAt)}</b></p>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────── Próximo passo ───────────────────────────────────

type NextAction = { label: string; onClick: () => void; primary?: boolean };
type NextStep = { tone: "info" | "warn" | "ok"; title: string; text?: string; actions: NextAction[] };

const NEXT_TONE = {
  info: { box: "border-blue-200 bg-blue-50/70 dark:border-blue-800 dark:bg-blue-950/20", dot: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
  warn: { box: "border-yellow-200 bg-yellow-50/70 dark:border-yellow-800 dark:bg-yellow-950/20", dot: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300" },
  ok: { box: "border-green-200 bg-green-50/70 dark:border-green-800 dark:bg-green-950/20", dot: "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300" },
} as const;

/**
 * "Próximo passo": só existe quando há UMA ação concreta e pendente para a gestão — e nunca para algo que não vale
 * para a campanha (sem votação, nada de votação/resultado). Sem ação pendente, retorna null e o cartão some.
 * Rascunho sem datas → definir período · rascunho pronto → publicar · votação encerrada sem ganhador confirmado →
 * ver ganhador · ganhador confirmado e não divulgado (nem programado) → divulgar · receitas aguardando análise.
 */
function buildNext(x: {
  c: AdminCampaign; display: DisplayState; stages: AdminStageRow[]; results: AdminResults | null;
  dash: AdminDashboard | null; check: PublishCheck | null; perms: Record<string, boolean>;
  goTab: (tab: string, section?: string) => void; openPublish: () => void;
}): NextStep | null {
  const { c, display, stages, results, dash, check, perms, goTab, openPublish } = x;
  const f = c.features;
  const reg = stageOf(stages, "registration");
  const vot = stageOf(stages, "voting");
  const regState = stageState(reg);
  const votState = stageState(vot);
  const rs = results?.status ?? "none";

  if (display === "draft") {
    if (regState === "unset" && perms.campaigns_schedule) {
      return { tone: "warn", title: "Defina o período", text: "Sem datas, a campanha não pode ser publicada.", actions: [{ label: "Definir período", onClick: () => goTab("settings", "period"), primary: true }] };
    }
    if (check?.ok && perms.campaigns_publish) {
      return {
        tone: "ok", title: "Pronta para publicar",
        text: `Ao publicar, ${plural(check.eligible_count, "colaborador elegível passa", "colaboradores elegíveis passam")} a ver a campanha.`,
        actions: [{ label: "Publicar", onClick: openPublish, primary: true }],
      };
    }
    return null;
  }
  if (display !== "published" && display !== "scheduled") return null;

  const canVotingTab = !!perms.campaigns_schedule || !!perms.campaigns_votes_view || !!perms.campaigns_results;
  if (f.voting && canVotingTab) {
    if (rs === "confirmed" && f.announcement && !results?.announce_at && perms.campaigns_announce) {
      return {
        tone: "warn", title: "Divulgue o resultado",
        text: "O ganhador está confirmado. Divulgue agora ou programe um horário.",
        actions: [{ label: "Divulgar resultado", onClick: () => goTab("voting"), primary: true }],
      };
    }
    if ((rs === "none" || rs === "preliminary" || rs === "tie_pending") && votState === "closed" && perms.campaigns_results) {
      return {
        tone: "warn", title: rs === "tie_pending" ? "Empate: decida o ganhador" : "Votação encerrada",
        text: rs === "tie_pending" ? "Registre a decisão, com justificativa, para continuar." : "Veja o ganhador, confira os números e confirme.",
        actions: [{ label: "Ver ganhador", onClick: () => goTab("voting"), primary: true }],
      };
    }
  }

  const pending = dash?.pending ?? 0;
  const reviewOpen = !(f.voting && votState === "closed");
  if (pending > 0 && perms.campaigns_review && reviewOpen) {
    return {
      tone: "warn", title: `${plural(pending, "receita aguarda", "receitas aguardam")} análise`,
      text: f.voting ? "As aprovadas já podem receber votos; as pendentes ficam de fora até a análise." : "Aprove ou reprove as receitas pendentes.",
      actions: [{ label: "Analisar receitas", onClick: () => goTab("submissions"), primary: true }],
    };
  }
  return null;
}

function NextStepCard({ next, busy }: { next: NextStep; busy: boolean }) {
  const tone = NEXT_TONE[next.tone];
  return (
    <Card className={cn("rounded-3xl border p-4 hover:shadow-sm", tone.box)} data-tutorial="camp-panel-next">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", tone.dot)}><Compass size={18} /></span>
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Próximo passo</p>
          <p className="text-sm font-bold text-foreground">{next.title}</p>
          {next.text && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{next.text}</p>}
        </div>
        {next.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {next.actions.map((a) => (
              <Button key={a.label} size="sm" variant={a.primary ? "primary" : "outline"} className="rounded-xl" disabled={busy} onClick={a.onClick}>{a.label}</Button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ───────────────────────────────────── Painel ─────────────────────────────────────

export function AdminCampaignPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { perms, loading: permsLoading, isAdmin } = useCampaignPerms();
  const detail = useLoader<AdminCampaignDetail>(() => campaignsApi.get(`/admin/campaigns/${id}`), [id]);
  const dashboard = useLoader<AdminDashboard>(() => campaignsApi.get(`/admin/campaigns/${id}/dashboard`), [id]);
  const { busy, run } = useBusy();

  const [publishOpen, setPublishOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [reasoned, setReasoned] = useState<Reasoned>(null);
  // "Ver tour" (sempre visível, para qualquer perfil) sobe este contador: a aba aberta reabre a própria tour.
  // Cada aba cuida da sua tour e abre sozinha só na primeira visita àquela aba.
  const [tourSignal, setTourSignal] = useState(0);

  const c = detail.data?.campaign;

  // Checklist de publicação: só para rascunhos e para quem pode editar (mesma fonte do diálogo Publicar).
  const stagesKey = JSON.stringify(detail.data?.stages ?? []);
  const checkEnabled = !!c && (c.status === "draft" || c.status === "in_review") && !!perms.campaigns_edit && isAdmin;
  const check = useLoader<PublishCheck | null>(
    () => (checkEnabled ? campaignsApi.get<PublishCheck>(`/admin/campaigns/${id}/publish-check`) : Promise.resolve(null)),
    [id, checkEnabled, stagesKey, c?.version],
  );

  // `short` só aparece em telas estreitas (5 abas lado a lado, sem rolagem lateral); o nome acessível é sempre o completo.
  const tabs = useMemo(() => {
    if (!c) return [] as { value: string; label: string; short: string; icon: React.ReactNode }[];
    const f = c.features;
    const list: { value: string; label: string; short: string; icon: React.ReactNode; show: boolean }[] = [
      { value: "summary", label: "Resumo", short: "Resumo", icon: <BarChart3 size={18} />, show: true },
      { value: "submissions", label: "Receitas", short: "Receitas", icon: <ChefHat size={18} />, show: !!perms.campaigns_review && f.submission },
      { value: "participants", label: "Participantes", short: "Pessoas", icon: <Users size={18} />, show: !!perms.campaigns_participants },
      { value: "voting", label: "Votação", short: "Votação", icon: <Vote size={18} />, show: f.voting && (!!perms.campaigns_schedule || !!perms.campaigns_votes_view || !!perms.campaigns_results) },
      { value: "settings", label: "Configurações", short: "Ajustes", icon: <Settings size={18} />, show: true },
    ];
    return list.filter((t) => t.show);
  }, [c, perms]);

  if (permsLoading || (detail.loading && !detail.data)) return <LoadingBox />;
  if (!isAdmin) return <RestrictedBox />;
  if (detail.error && !detail.data) return <ErrorBox message={detail.error} onRetry={detail.reload} />;
  if (!detail.data || !c) return null;

  const { stages, results } = detail.data;
  const rawTab = params.get("tab") ?? "summary";
  const legacy = LEGACY_TABS[rawTab];
  const requested = legacy ? legacy.tab : rawTab;
  const tab = tabs.some((t) => t.value === requested) ? requested : "summary";
  const section = params.get("section") ?? legacy?.section ?? null;
  const goTab = (v: string, sec?: string) => {
    const next: Record<string, string> = { tab: v };
    if (sec) next.section = sec;
    setParams(next, { replace: true });
  };

  const display = campaignDisplayState(c);
  const state = DISPLAY_STATE[display];
  const isDraft = display === "draft";
  const finished = display === "closed" || display === "archived";
  const regState = stageState(stageOf(stages, "registration"));
  const votState = stageState(stageOf(stages, "voting"));
  const phase = phaseBadge(c, display, results, regState, votState);
  const base = `/admin/campaigns/${c.id}`;
  const refreshAll = () => { detail.reload(); dashboard.reload(); };
  const live = regState === "open" || regState === "paused" || votState === "open" || votState === "paused";

  const doAction = async (key: string, fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    const r = await run(key, fn, ok);
    if (r.ok) { refreshAll(); after?.(); }
    return r.ok;
  };

  const onConfirm = async () => {
    const kind = confirm;
    setConfirm(null);
    if (kind === "resume") await doAction("resume", () => campaignsApi.post(`${base}/resume`), "Campanha republicada: voltou a aparecer para os colaboradores.");
    if (kind === "archive") await doAction("archive", () => campaignsApi.post(`${base}/archive`), "Campanha arquivada.");
    if (kind === "draft") await doAction("draft", () => campaignsApi.post(`${base}/return-to-draft`), "A campanha voltou a rascunho e está oculta dos colaboradores.");
    if (kind === "review") await doAction("review", () => campaignsApi.post(`${base}/submit-for-review`), "Enviada para revisão.");
    if (kind === "delete") {
      const r = await run("delete", () => campaignsApi.del(`${base}`), "Rascunho excluído.");
      if (r.ok) navigate("/admin/campaigns");
    }
  };

  const onReason = async (reason: string) => {
    const kind = reasoned;
    if (!kind) return;
    const ok = await doAction(kind, () => campaignsApi.post(`${base}/${kind}`, { reason: reason || null }),
      kind === "suspend" ? "Campanha despublicada: saiu de exibição e continua salva." : "Campanha encerrada.");
    if (ok) setReasoned(null);
  };

  const onRisk = (kind: RiskKind) => {
    if (kind === "close") setReasoned("close");
    else setConfirm(kind);
  };

  const tabProps: TabProps = { campaignId: c.id, campaign: c, stages, results, perms, onChanged: refreshAll, goTab, tourUserId: user?.id, tourSignal };

  // Botão principal: muda conforme a situação da campanha.
  type Primary = { label: string; icon: React.ReactNode; onClick: () => void; outline?: boolean };
  let primary: Primary | null = null;
  if (display === "draft") {
    if (perms.campaigns_publish) primary = { label: "Publicar", icon: <Rocket size={14} />, onClick: () => setPublishOpen(true) };
    else if (perms.campaigns_edit && c.status === "draft") primary = { label: "Enviar para revisão", icon: <Send size={14} />, onClick: () => setConfirm("review") };
  } else if (display === "published" || display === "scheduled") {
    if (perms.campaigns_publish) primary = { label: "Despublicar", icon: <EyeOff size={14} />, onClick: () => setReasoned("suspend"), outline: true };
  } else if (display === "unpublished") {
    if (perms.campaigns_publish) primary = { label: "Republicar", icon: <Play size={14} />, onClick: () => setConfirm("resume") };
  }

  const next = buildNext({
    c, display, stages, results, dash: dashboard.data, check: check.data, perms, goTab,
    openPublish: () => setPublishOpen(true),
  });

  // Avisos longos, ciclo e próximo passo ficam DENTRO da aba Resumo (o cabeçalho e as abas ficam enxutos).
  const summaryTop = (
    <div className="space-y-4">
      {isDraft && (
        <Notice tone="info">Os colaboradores só veem a campanha — e o menu Campanhas — depois que alguém com permissão clicar em Publicar.</Notice>
      )}
      {display === "unpublished" && (
        <Notice tone="warn">Está oculta dos colaboradores. Receitas, votos e histórico continuam salvos; use Republicar para voltar a exibi-la.</Notice>
      )}
      {display === "scheduled" && (
        <Notice tone="info">Os colaboradores passam a ver esta campanha em {fmtDateTime(c.visible_from)}.</Notice>
      )}
      <PeriodLine display={display} stages={stages} hasVoting={!!c.features.voting} results={results} />
      {next && <NextStepCard next={next} busy={busy !== null} />}
    </div>
  );

  const CONFIRM_COPY: Record<Exclude<Confirm, null>, { title: string; description: string; label: string; destructive?: boolean }> = {
    resume: { title: "Republicar a campanha?", description: "Ela volta a aparecer para os colaboradores elegíveis, com tudo o que já estava salvo.", label: "Republicar" },
    archive: { title: "Arquivar a campanha?", description: "Ela sai da lista principal. Os dados e o histórico são preservados.", label: "Arquivar" },
    draft: { title: "Voltar a rascunho?", description: "A campanha deixa de ser visível para os colaboradores. Só é possível se ainda não houver receitas enviadas.", label: "Voltar a rascunho" },
    review: { title: "Enviar para revisão?", description: "Quem tem permissão de publicar poderá revisar e publicar a campanha.", label: "Enviar para revisão" },
    delete: { title: "Excluir este rascunho?", description: "A exclusão é definitiva. Só é possível para rascunhos sem nenhuma receita enviada.", label: "Excluir rascunho", destructive: true },
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho enxuto: nome, situação e ações. As abas vêm logo abaixo. */}
      <div className="space-y-2.5 sm:space-y-3">
        {/* Linha 1: voltar (esquerda) + Ver tour (direita, pequeno) */}
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => navigate("/admin/campaigns")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft size={12} /> Todas as campanhas
          </button>
          <TourButton className="h-8 px-2.5 text-[11px]" onClick={() => setTourSignal((n) => n + 1)} />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2.5">
          <div className="min-w-0 space-y-1 sm:space-y-1.5">
            <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
              <Megaphone className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
              <span className="min-w-0 break-words">{c.name}</span>
            </h1>
            <div data-tutorial="camp-panel-state" className="flex flex-wrap items-center gap-2">
              <Badge className={cn("border px-3 py-1 text-xs", state.className)} title={state.hint}>{state.label}</Badge>
              {phase && <Badge className={cn("border text-[10px]", phase.className)}>{phase.label}</Badge>}
              {c.status === "in_review" && !perms.campaigns_publish && <Badge className={cn("border text-[10px]", YELLOW)}>Aguardando publicação</Badge>}
            </div>
          </div>

          {/* Ações numa linha só: principal (ocupa o espaço) + Editar (só ícone no celular) + ⋯ */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {perms.campaigns_duplicate && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="order-3 shrink-0 rounded-xl sm:order-1" aria-label="Mais ações" disabled={busy !== null}>
                    {busy !== null ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => setDupOpen(true)} className="cursor-pointer gap-2"><Copy size={14} /> Duplicar campanha</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {perms.campaigns_edit && !finished && (
              <Button
                data-tutorial="camp-panel-edit"
                variant="outline"
                aria-label="Editar campanha"
                className="order-2 w-11 shrink-0 gap-2 rounded-xl px-0 sm:w-auto sm:px-6"
                onClick={() => navigate(`${base}/edit`)}
                disabled={busy !== null}
              >
                <Pencil size={14} /> <span className="hidden sm:inline">Editar</span>
              </Button>
            )}
            {primary && (
              <Button
                data-tutorial="camp-panel-primary"
                variant={primary.outline ? "outline" : "primary"}
                className="order-1 min-w-0 flex-1 gap-2 rounded-xl sm:order-3 sm:flex-none"
                onClick={primary.onClick}
                disabled={busy !== null}
              >
                {primary.icon} {primary.label}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Abas: logo abaixo do cabeçalho, grandes, e fixas no topo enquanto a página rola */}
      <Tabs value={tab} onValueChange={(v) => goTab(v)} className="gap-4">
        <StickyBar>
          <TabsList
            data-tutorial="camp-panel-tabs"
            aria-label="Áreas da campanha"
            className="grid h-auto w-full gap-1 rounded-2xl p-1"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                aria-label={t.label}
                data-tutorial={`camp-tab-${t.value}`}
                className="h-auto min-w-0 flex-col gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold sm:flex-row sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm dark:data-[state=active]:border-primary/30 dark:data-[state=active]:bg-primary/15 dark:data-[state=active]:text-primary"
              >
                {t.icon}
                <span className="truncate sm:hidden" aria-hidden="true">{t.short}</span>
                <span className="hidden truncate sm:inline" aria-hidden="true">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </StickyBar>

        <TabsContent value="summary">
          <SummaryTab
            {...tabProps}
            dashboard={dashboard.data}
            dashboardLoading={dashboard.loading}
            dashboardError={dashboard.error}
            onReloadDashboard={dashboard.reload}
            display={display}
            publishCheck={check.data}
            top={summaryTop}
          />
        </TabsContent>
        {tabs.some((t) => t.value === "submissions") && <TabsContent value="submissions"><SubmissionsTab {...tabProps} /></TabsContent>}
        {tabs.some((t) => t.value === "participants") && <TabsContent value="participants"><ParticipantsTab {...tabProps} /></TabsContent>}
        {tabs.some((t) => t.value === "voting") && <TabsContent value="voting"><VotingTab {...tabProps} /></TabsContent>}
        <TabsContent value="settings">
          <SettingsTab {...tabProps} section={section} onAction={onRisk} display={display} dashboard={dashboard.data} />
        </TabsContent>
      </Tabs>

      {publishOpen && (
        <PublishDialog
          campaignId={c.id}
          campaignName={c.name}
          open={publishOpen}
          onOpenChange={setPublishOpen}
          onPublished={(r) => {
            refreshAll();
            if (r.module_enabled_now) toast.info("O módulo de campanhas foi ligado ao publicar.");
          }}
        />
      )}
      {dupOpen && (
        <DuplicateDialog
          open
          onOpenChange={(o) => !o && setDupOpen(false)}
          campaignId={c.id}
          campaignName={c.name}
          hasVoting={!!c.features.voting}
          onDuplicated={(newId) => navigate(`/admin/campaigns/${newId}`)}
        />
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? CONFIRM_COPY[confirm].title : ""}
        description={confirm ? CONFIRM_COPY[confirm].description : ""}
        confirmLabel={confirm ? CONFIRM_COPY[confirm].label : "Confirmar"}
        variant={confirm && CONFIRM_COPY[confirm].destructive ? "destructive" : "default"}
        onConfirm={onConfirm}
      />
      <ReasonDialog
        open={reasoned !== null}
        onOpenChange={(o) => !o && setReasoned(null)}
        title={reasoned === "close" ? "Encerrar a campanha?" : "Despublicar a campanha?"}
        description={reasoned === "close"
          ? "A campanha deixa de receber receitas e votos para todos e não pode ser reaberta (você pode duplicá-la depois). Dados e histórico são preservados."
          : `A campanha some para os colaboradores até você republicá-la. Nada é apagado: receitas, votos e histórico continuam salvos.${live ? " Enquanto estiver não publicada, ninguém consegue enviar receitas nem votar." : ""}`}
        placeholder="Motivo (opcional)"
        confirmLabel={reasoned === "close" ? "Encerrar campanha" : "Despublicar"}
        destructive={reasoned === "close"}
        pending={busy === "suspend" || busy === "close"}
        onConfirm={onReason}
      />
    </div>
  );
}

// ─────────────────────────────── Barra de abas fixa ───────────────────────────────

/**
 * Mantém as abas visíveis ao rolar. `position: sticky` não funciona aqui porque o contêiner de conteúdo do admin
 * tem `overflow: auto` (o sticky ficaria preso a ele), então a barra vira `fixed` logo abaixo da barra superior
 * do admin (h-16) quando seu lugar original sai da tela, alinhada à largura da coluna de conteúdo.
 * Se algo falhar, ela simplesmente continua no fluxo normal, no topo da página.
 */
const ADMIN_TOP_BAR = 64;

function StickyBar({ children }: { children: React.ReactNode }) {
  const slot = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState({ fixed: false, left: 0, width: 0, height: 0 });

  useEffect(() => {
    const update = () => {
      const s = slot.current;
      const b = bar.current;
      if (!s || !b) return;
      const r = s.getBoundingClientRect();
      const height = b.offsetHeight;
      const fixed = r.top <= ADMIN_TOP_BAR;
      setPin((p) => (p.fixed === fixed && p.left === r.left && p.width === r.width && p.height === height ? p : { fixed, left: r.left, width: r.width, height }));
    };
    update();
    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro && bar.current) ro.observe(bar.current);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, []);

  return (
    <div ref={slot} style={pin.fixed ? { height: pin.height } : undefined}>
      <div
        ref={bar}
        className={cn(pin.fixed && "fixed z-20 rounded-b-2xl border-b border-border bg-background/95 py-2 shadow-sm backdrop-blur")}
        style={pin.fixed ? { top: ADMIN_TOP_BAR, left: pin.left, width: pin.width } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
