import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft, ChefHat, Compass, Copy, FileDown, LayoutDashboard, Loader2, Megaphone, MoreHorizontal, Pencil, Rocket,
  Send, Settings, Trash2, Trophy,
} from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Switch } from "../../../components/ui/switch";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../context/auth-context";
import { campaignsApi } from "../../../lib/campaigns/api";
import {
  DISPLAY_STATE, PHASE_STATE, RESULT_STAGE, campaignDisplayState, fmtDateTime, plural,
} from "../../../lib/campaigns/format";
import type { DisplayState } from "../../../lib/campaigns/format";
import type {
  AdminCampaign, AdminCampaignDetail, AdminDashboard, AdminResults, AdminStageRow, PublishCheck,
} from "../../../lib/campaigns/types";
import { TourButton } from "../../../components/campaigns/CampaignTour";
import { useCampaignPerms } from "./useCampaignPerms";
import { PublishDialog } from "./PublishDialog";
import { DuplicateDialog } from "./DuplicateDialog";
import { DeleteCampaignDialog, LiveCampaignDeleteNotice } from "./DeleteCampaignDialog";
import { ErrorBox, LoadingBox, Notice, ReasonDialog, RestrictedBox, stageState, useBusy, useLoader } from "./shared";
import { SummaryTab } from "./tabs/SummaryTab";
import { RecipesTab, recipesViews } from "./tabs/RecipesTab";
import { ResultsTab } from "./tabs/ResultsTab";
import { ReportsPanel } from "./tabs/ReportsPanel";
import { SettingsTab } from "./tabs/SettingsTab";
import type { RiskKind } from "./tabs/SettingsTab";
import type { TabProps } from "./tabs/types";
import { SWITCH_HIT } from "../../../lib/campaigns/touch";

type Confirm = "resume" | "archive" | "draft" | "review" | "restore" | null;
type Reasoned = "suspend" | "close" | null;
type Phase = ReturnType<typeof stageState>;

const YELLOW = "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800";

// Abas antigas (links e favoritos) continuam funcionando.
const LEGACY_TABS: Record<string, { tab: string; section?: string }> = {
  overview: { tab: "summary" },
  voting: { tab: "results" }, // "Votação" virou "Resultados"
  draw: { tab: "summary" }, // o sorteio deixou de existir
  schedule: { tab: "settings", section: "period" },
  participants: { tab: "submissions", section: "people" },
  history: { tab: "reports", section: "history" },
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
    // Resultado: Em apuração → Definido (ganhador confirmado) → Divulgado.
    if (rs === "announced") return { label: "Resultado divulgado", className: RESULT_STAGE.announced.className };
    if (rs === "confirmed") return { label: "Resultado definido", className: RESULT_STAGE.confirmed.className };
    if (rs === "tie_pending") return { label: "Empate a decidir", className: RESULT_STAGE.tie_pending.className };
    if (rs === "preliminary") return { label: "Resultado em apuração", className: RESULT_STAGE.preliminary.className };
    if (votState === "closed") return { label: "Votação encerrada", className: PHASE_STATE.closed.className };
    if (votState === "open") {
      // Janela única (campanha antiga): participação e votação abertas ao mesmo tempo.
      if (regState === "open") return { label: "Participação e votação abertas", className: PHASE_STATE.open.className };
      return { label: "Votação aberta", className: PHASE_STATE.open.className };
    }
    if (votState === "paused") return { label: "Votação pausada", className: PHASE_STATE.paused.className };
    if (votState === "upcoming" && regState === "closed") return { label: "Votação em breve", className: PHASE_STATE.upcoming.className };
  }
  if (regState === "open") return { label: "Participação aberta", className: PHASE_STATE.open.className };
  if (regState === "paused") return { label: "Participação pausada", className: PHASE_STATE.paused.className };
  if (regState === "closed") return { label: "Participação encerrada", className: PHASE_STATE.closed.className };
  if (regState === "upcoming") return { label: "Começa em breve", className: PHASE_STATE.upcoming.className };
  return { label: "Sem datas", className: PHASE_STATE.unset.className };
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
    if (f.voting && votState === "unset" && perms.campaigns_schedule) {
      return { tone: "warn", title: "Defina a votação", text: "Sem as datas da votação, a campanha não pode ser publicada.", actions: [{ label: "Definir datas", onClick: () => goTab("settings", "period"), primary: true }] };
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

  if (f.voting) {
    // Ganhador definido e ainda não divulgado: se a divulgação automática já está marcada para o futuro, não há
    // nada a fazer; senão, divulgar é uma ação da gestão (confirmar e divulgar são independentes).
    const autoFuture = !!results?.announce_at && new Date(results.announce_at).getTime() > Date.now();
    if (rs === "confirmed" && f.announcement && !autoFuture && perms.campaigns_announce) {
      return {
        tone: "warn", title: "Divulgue o resultado",
        text: "O ganhador está definido. Divulgue quando quiser: os colaboradores passam a ver e quem participou recebe um aviso.",
        actions: [{ label: "Divulgar resultado", onClick: () => goTab("results"), primary: true }],
      };
    }
    if ((rs === "none" || rs === "preliminary" || rs === "tie_pending") && votState === "closed" && perms.campaigns_results) {
      return {
        tone: "warn", title: rs === "tie_pending" ? "Empate: decida o ganhador" : "Votação encerrada",
        text: rs === "tie_pending" ? "Registre a decisão, com justificativa, para continuar." : "Veja o ganhador, confira os números e confirme.",
        actions: [{ label: "Ver ganhador", onClick: () => goTab("results"), primary: true }],
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [liveDeleteOpen, setLiveDeleteOpen] = useState(false);
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

  // `short` só aparece em telas estreitas (até 5 abas lado a lado, sem rolagem lateral); o nome acessível é sempre o completo.
  const tabs = useMemo(() => {
    if (!c) return [] as { value: string; label: string; short: string; icon: React.ReactNode }[];
    const f = c.features;
    const list: { value: string; label: string; short: string; icon: React.ReactNode; show: boolean }[] = [
      { value: "summary", label: "Visão geral", short: "Geral", icon: <LayoutDashboard size={18} />, show: true },
      { value: "submissions", label: "Receitas", short: "Receitas", icon: <ChefHat size={18} />, show: recipesViews(c, perms).length > 0 },
      { value: "results", label: "Resultados", short: "Resultados", icon: <Trophy size={18} />, show: f.voting },
      { value: "reports", label: "Relatórios", short: "Relatórios", icon: <FileDown size={18} />, show: true },
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
  // Excluída (oculta): o servidor bloqueia qualquer alteração (409 CAMPAIGN_DELETED); aqui só leitura + Restaurar.
  const isDeleted = !!c.deleted_at;
  const state = DISPLAY_STATE[display];
  const isDraft = display === "draft";
  const finished = display === "closed" || display === "archived";
  const regState = stageState(stageOf(stages, "registration"));
  const votState = stageState(stageOf(stages, "voting"));
  const phase = phaseBadge(c, display, results, regState, votState);
  const base = `/admin/campaigns/${c.id}`;
  const refreshAll = () => { detail.reload(); dashboard.reload(); };

  const doAction = async (key: string, fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    const r = await run(key, fn, ok);
    if (r.ok) { refreshAll(); after?.(); }
    return r.ok;
  };

  const onConfirm = async () => {
    const kind = confirm;
    setConfirm(null);
    if (kind === "resume") await doAction("resume", () => campaignsApi.post(`${base}/resume`), "Campanha reativada: voltou a aparecer para os colaboradores.");
    if (kind === "archive") await doAction("archive", () => campaignsApi.post(`${base}/archive`), "Campanha arquivada.");
    if (kind === "draft") await doAction("draft", () => campaignsApi.post(`${base}/return-to-draft`), "A campanha voltou a rascunho e está oculta dos colaboradores.");
    if (kind === "review") await doAction("review", () => campaignsApi.post(`${base}/submit-for-review`), "Enviada para revisão.");
    if (kind === "restore") await doAction("restore", () => campaignsApi.post(`${base}/restore`), "Campanha restaurada: ela voltou para a situação em que estava.");
  };

  const onReason = async (reason: string) => {
    const kind = reasoned;
    if (!kind) return;
    const ok = await doAction(kind, () => campaignsApi.post(`${base}/${kind}`, { reason: reason || null }),
      kind === "suspend" ? "Campanha desativada. Ela está em Histórico de campanhas › Desativadas." : "Campanha encerrada.");
    if (ok) setReasoned(null);
  };

  // "Excluir campanha" = ocultar: some das listas e do site; receitas, votos e histórico ficam guardados e dá para restaurar.
  const doSoftDelete = async (confirmName: string) => {
    const r = await run("softdelete", () => campaignsApi.post(`${base}/soft-delete`, { confirm: confirmName }),
      "Campanha excluída. Ela está em Histórico de campanhas › Excluídas.");
    if (r.ok) { setDeleteOpen(false); navigate("/admin/campaigns"); }
  };

  // Menu "⋯" › Excluir é SEMPRE lógico (nunca apaga registros): no ar → aviso para desativar antes; demais, inclusive rascunho → ocultar.
  const isLive = display === "published" || display === "scheduled";
  const askDelete = () => {
    if (isLive) setLiveDeleteOpen(true);
    else setDeleteOpen(true);
  };
  const canDeleteHere = !!perms.campaigns_edit && !isDeleted;

  const onRisk = (kind: RiskKind) => {
    if (kind === "close") setReasoned("close");
    else if (kind === "softdelete") setDeleteOpen(true);
    else setConfirm(kind);
  };

  const tabProps: TabProps = { campaignId: c.id, campaign: c, stages, results, perms, onChanged: refreshAll, goTab, tourUserId: user?.id, tourSignal };

  // Botão principal: muda conforme a situação da campanha.
  type Primary = { label: string; icon: React.ReactNode; onClick: () => void; outline?: boolean };
  let primary: Primary | null = null;
  if (display === "draft" && !isDeleted) {
    if (perms.campaigns_publish) primary = { label: "Publicar", icon: <Rocket size={14} />, onClick: () => setPublishOpen(true) };
    else if (perms.campaigns_edit && c.status === "draft") primary = { label: "Enviar para revisão", icon: <Send size={14} />, onClick: () => setConfirm("review") };
  }

  // Depois de publicada, "Visível para colaboradores" (Sim/Não) é o único controle: Sim = publicada, Não = desativada.
  // Mesmas ações de sempre (Desativar / Reativar); nada de segunda configuração.
  const visibilityOn = display === "published" || display === "scheduled";
  const showVisibility = !isDeleted && !!perms.campaigns_publish && (visibilityOn || display === "unpublished");
  const onVisibility = (v: boolean) => {
    if (v) setConfirm("resume");
    else setReasoned("suspend");
  };

  const next = buildNext({
    c, display, stages, results, dash: dashboard.data, check: check.data, perms, goTab,
    openPublish: () => setPublishOpen(true),
  });

  // Avisos longos, ciclo e próximo passo ficam DENTRO da aba Resumo (o cabeçalho e as abas ficam enxutos).
  const summaryTop = (
    <div className="space-y-4">
      {display === "unpublished" && (
        <Notice tone="warn">Campanha desativada: os colaboradores não a veem e ninguém participa ou vota. Receitas, votos e histórico continuam salvos.</Notice>
      )}
      {display === "scheduled" && (
        <Notice tone="info">Os colaboradores passam a ver esta campanha em {fmtDateTime(c.visible_from)}.</Notice>
      )}
      {next && <NextStepCard next={next} busy={busy !== null} />}
    </div>
  );

  const CONFIRM_COPY: Record<Exclude<Confirm, null>, { title: string; description: string; label: string; destructive?: boolean }> = {
    resume: { title: "Reativar a campanha?", description: "A campanha volta a ficar visível. Períodos já encerrados NÃO são reabertos.", label: "Reativar" },
    archive: { title: "Arquivar a campanha?", description: "Ela sai da lista principal. Os dados e o histórico são preservados.", label: "Arquivar" },
    draft: { title: "Voltar a rascunho?", description: "A campanha deixa de ser visível para os colaboradores. Só é possível se ainda não houver receitas enviadas.", label: "Voltar a rascunho" },
    review: { title: "Enviar para revisão?", description: "Quem tem permissão de publicar poderá revisar e publicar a campanha.", label: "Enviar para revisão" },
    restore: { title: "Restaurar a campanha?", description: "Ela volta para a lista de campanhas, na mesma situação em que estava. Nada foi perdido.", label: "Restaurar" },
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho enxuto: nome, situação e ações. As abas vêm logo abaixo. */}
      <div className="space-y-2.5 sm:space-y-3">
        {/* Linha 1: voltar (esquerda) + Ver tour (direita, pequeno) */}
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => navigate("/admin/campaigns")} className="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground sm:min-h-0">
            <ArrowLeft size={12} /> Todas as campanhas
          </button>
          <TourButton className="h-11 px-2.5 text-[11px] sm:h-8" onClick={() => setTourSignal((n) => n + 1)} />
        </div>
        {isDeleted && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <Trash2 size={18} className="shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <p className="min-w-0 flex-1 basis-56 text-[13px] leading-snug text-amber-800 dark:text-amber-200">
              <b>Esta campanha está excluída e oculta.</b> Restaure para voltar a alterá-la.
            </p>
            {perms.campaigns_edit && (
              <Button variant="outline" className="h-11 w-full gap-2 rounded-xl sm:w-auto" disabled={busy !== null} onClick={() => setConfirm("restore")}>
                {busy === "restore" ? <Loader2 size={14} className="animate-spin" /> : null} Restaurar
              </Button>
            )}
          </div>
        )}
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
            {showVisibility && (
              <label data-tutorial="camp-panel-primary" className="flex w-fit cursor-pointer items-center gap-2.5 pt-0.5 text-sm">
                <Switch checked={visibilityOn} onCheckedChange={onVisibility} disabled={busy !== null} aria-label="Visível para colaboradores" className={SWITCH_HIT} />
                <span className="font-medium text-foreground">Visível para colaboradores</span>
              </label>
            )}
          </div>

          {/* Ações numa linha só: principal (ocupa o espaço) + Editar (só ícone no celular) + ⋯ */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {(perms.campaigns_duplicate || canDeleteHere) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="order-3 h-11 w-11 shrink-0 rounded-xl sm:order-1 sm:h-10 sm:w-10" aria-label="Mais ações" disabled={busy !== null}>
                    {busy !== null ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {perms.campaigns_duplicate && (
                    <DropdownMenuItem onSelect={() => setDupOpen(true)} className="cursor-pointer gap-2"><Copy size={14} /> Duplicar campanha</DropdownMenuItem>
                  )}
                  {canDeleteHere && (
                    <>
                      {perms.campaigns_duplicate && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onSelect={askDelete}
                        className="min-h-11 cursor-pointer gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                      >
                        <Trash2 size={14} /> Excluir campanha
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {perms.campaigns_edit && !finished && !isDeleted && (
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
                className="h-auto min-w-0 flex-col gap-1 rounded-xl px-0.5 py-2 text-[10.5px] font-semibold sm:flex-row sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm dark:data-[state=active]:border-primary/30 dark:data-[state=active]:bg-primary/15 dark:data-[state=active]:text-primary"
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
        {tabs.some((t) => t.value === "submissions") && <TabsContent value="submissions"><RecipesTab {...tabProps} section={section} /></TabsContent>}
        {tabs.some((t) => t.value === "results") && <TabsContent value="results"><ResultsTab {...tabProps} /></TabsContent>}
        <TabsContent value="reports"><ReportsPanel {...tabProps} section={section} /></TabsContent>
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
      <LiveCampaignDeleteNotice
        open={liveDeleteOpen}
        onOpenChange={setLiveDeleteOpen}
        canUnpublish={!!perms.campaigns_publish}
        onUnpublish={() => { setLiveDeleteOpen(false); setReasoned("suspend"); }}
      />
      <DeleteCampaignDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        campaignName={c.name}
        isDraft={isDraft}
        pending={busy === "softdelete"}
        onConfirm={doSoftDelete}
      />
      <ReasonDialog
        open={reasoned !== null}
        onOpenChange={(o) => !o && setReasoned(null)}
        title={reasoned === "close" ? "Encerrar a campanha?" : "Desativar a campanha?"}
        description={reasoned === "close"
          ? "A campanha deixa de receber receitas e votos para todos e não pode ser reaberta (você pode duplicá-la depois). Dados e histórico são preservados."
          : "Ela sai da lista principal e some para os colaboradores: ninguém mais participa, vota ou vê. Receitas, votos e histórico ficam guardados. Você a encontra em Histórico de campanhas › Desativadas e pode reativá-la (isso não reabre períodos já encerrados)."}
        placeholder="Motivo (opcional)"
        confirmLabel={reasoned === "close" ? "Encerrar campanha" : "Desativar"}
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
