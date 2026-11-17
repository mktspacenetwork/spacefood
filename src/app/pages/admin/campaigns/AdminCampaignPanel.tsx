import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  Archive, ArrowLeft, BarChart3, CalendarClock, ChefHat, Copy, FileDown, History as HistoryIcon, Loader2, MoreHorizontal,
  Pencil, PauseCircle, PlayCircle, Rocket, Send, Trash2, Trophy, Undo2, Users, Vote, XCircle, Megaphone,
} from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../context/auth-context";
import { campaignsApi } from "../../../lib/campaigns/api";
import { CAMPAIGN_STATUS, fmtDateTime } from "../../../lib/campaigns/format";
import type { AdminCampaignDetail } from "../../../lib/campaigns/types";
import { CampaignTour, TourButton, tourKey, useTour } from "../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_PANEL } from "../../../lib/campaigns/tours-admin";
import { useCampaignPerms } from "./useCampaignPerms";
import { PublishDialog } from "./PublishDialog";
import { DuplicateDialog } from "./DuplicateDialog";
import { ErrorBox, LoadingBox, Notice, ReasonDialog, RestrictedBox, stageState, useBusy, useLoader } from "./shared";
import { OverviewTab } from "./tabs/OverviewTab";
import { SubmissionsTab } from "./tabs/SubmissionsTab";
import { ParticipantsTab } from "./tabs/ParticipantsTab";
import { VotingTab } from "./tabs/VotingTab";
import { ResultsTab } from "./tabs/ResultsTab";
import { ScheduleTab } from "./tabs/ScheduleTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { ReportsTab } from "./tabs/ReportsTab";
import type { TabProps } from "./tabs/types";

type Confirm = "resume" | "archive" | "draft" | "delete" | "review" | null;
type Reasoned = "suspend" | "close" | null;

const STATE_WORD: Record<string, string> = {
  unset: "sem datas", upcoming: "em breve", open: "abertas", paused: "pausadas", closed: "encerradas",
};
const VOTE_WORD: Record<string, string> = {
  unset: "sem datas", upcoming: "em breve", open: "aberta", paused: "pausada", closed: "encerrada",
};

export function AdminCampaignPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { perms, loading: permsLoading, isAdmin } = useCampaignPerms();
  const detail = useLoader<AdminCampaignDetail>(() => campaignsApi.get(`/admin/campaigns/${id}`), [id]);
  const { busy, run } = useBusy();

  const [publishOpen, setPublishOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [reasoned, setReasoned] = useState<Reasoned>(null);

  const c = detail.data?.campaign;
  const tour = useTour({
    storageKey: tourKey("admin", user?.id, "panel"),
    enabled: !permsLoading && isAdmin && !!c,
  });

  const tabs = useMemo(() => {
    if (!c) return [] as { value: string; label: string; icon: React.ReactNode }[];
    const f = c.features;
    const list: { value: string; label: string; icon: React.ReactNode; show: boolean }[] = [
      { value: "overview", label: "Visão geral", icon: <BarChart3 size={14} />, show: true },
      { value: "submissions", label: "Receitas", icon: <ChefHat size={14} />, show: !!perms.campaigns_review && f.submission },
      { value: "participants", label: "Participantes", icon: <Users size={14} />, show: !!perms.campaigns_participants },
      { value: "voting", label: "Votação", icon: <Vote size={14} />, show: f.voting && (!!perms.campaigns_schedule || !!perms.campaigns_votes_view || !!perms.campaigns_results) },
      { value: "results", label: "Resultado", icon: <Trophy size={14} />, show: f.voting && !!perms.campaigns_results },
      { value: "schedule", label: "Calendário", icon: <CalendarClock size={14} />, show: !!perms.campaigns_schedule },
      { value: "history", label: "Histórico", icon: <HistoryIcon size={14} />, show: true },
      { value: "reports", label: "Relatórios", icon: <FileDown size={14} />, show: !!perms.campaigns_export },
    ];
    return list.filter((t) => t.show);
  }, [c, perms]);

  if (permsLoading || (detail.loading && !detail.data)) return <LoadingBox />;
  if (!isAdmin) return <RestrictedBox />;
  if (detail.error && !detail.data) return <ErrorBox message={detail.error} onRetry={detail.reload} />;
  if (!detail.data || !c) return null;

  const { stages, results } = detail.data;
  const requested = params.get("tab") ?? "overview";
  const tab = tabs.some((t) => t.value === requested) ? requested : "overview";
  const goTab = (v: string) => setParams({ tab: v }, { replace: true });

  const status = CAMPAIGN_STATUS[c.status];
  const suspended = !!c.suspended_at;
  const isDraft = c.status === "draft";
  const inReview = c.status === "in_review";
  const published = c.status === "authorized";
  const closed = c.status === "closed" || c.status === "archived";
  const regState = stageState(stages.find((s) => s.stage_key === "registration"));
  const votState = stageState(stages.find((s) => s.stage_key === "voting"));
  const base = `/admin/campaigns/${c.id}`;
  const scheduled = published && c.visible_from && new Date(c.visible_from).getTime() > Date.now();

  const doAction = async (key: string, fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    const r = await run(key, fn, ok);
    if (r.ok) { detail.reload(); after?.(); }
    return r.ok;
  };

  const onConfirm = async () => {
    const kind = confirm;
    setConfirm(null);
    if (kind === "resume") await doAction("resume", () => campaignsApi.post(`${base}/resume`), "Campanha retomada: voltou a aparecer para os colaboradores.");
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
      kind === "suspend" ? "Campanha suspensa: oculta dos colaboradores." : "Campanha encerrada.");
    if (ok) setReasoned(null);
  };

  const tabProps: TabProps = { campaignId: c.id, campaign: c, stages, results, perms, onChanged: detail.reload, goTab };

  const menuItems: { key: string; label: string; icon: React.ReactNode; show: boolean; danger?: boolean; onSelect: () => void }[] = [
    { key: "review", label: "Enviar para revisão", icon: <Send size={14} />, show: isDraft && !!perms.campaigns_edit, onSelect: () => setConfirm("review") },
    { key: "suspend", label: "Suspender", icon: <PauseCircle size={14} />, show: published && !suspended && !!perms.campaigns_publish, onSelect: () => setReasoned("suspend") },
    { key: "resume", label: "Retomar", icon: <PlayCircle size={14} />, show: published && suspended && !!perms.campaigns_publish, onSelect: () => setConfirm("resume") },
    { key: "duplicate", label: "Duplicar", icon: <Copy size={14} />, show: !!perms.campaigns_duplicate, onSelect: () => setDupOpen(true) },
    { key: "draft", label: "Voltar a rascunho", icon: <Undo2 size={14} />, show: (inReview || published) && !!perms.campaigns_edit, onSelect: () => setConfirm("draft") },
    { key: "archive", label: "Arquivar", icon: <Archive size={14} />, show: (isDraft || c.status === "closed") && !!perms.campaigns_edit, onSelect: () => setConfirm("archive") },
    { key: "close", label: "Encerrar campanha", icon: <XCircle size={14} />, show: published && !!perms.campaigns_publish, danger: true, onSelect: () => setReasoned("close") },
    { key: "delete", label: "Excluir rascunho", icon: <Trash2 size={14} />, show: isDraft && !!perms.campaigns_edit, danger: true, onSelect: () => setConfirm("delete") },
  ];
  const visibleMenu = menuItems.filter((m) => m.show);

  const CONFIRM_COPY: Record<Exclude<Confirm, null>, { title: string; description: string; label: string; destructive?: boolean }> = {
    resume: { title: "Retomar a campanha?", description: "Ela volta a aparecer para os colaboradores elegíveis.", label: "Retomar" },
    archive: { title: "Arquivar a campanha?", description: "Ela sai da lista principal. Os dados e o histórico são preservados.", label: "Arquivar" },
    draft: { title: "Voltar a rascunho?", description: "A campanha deixa de ser visível para os colaboradores. Só é possível se ainda não houver receitas enviadas.", label: "Voltar a rascunho" },
    review: { title: "Enviar para revisão?", description: "Quem tem permissão de publicar poderá revisar e publicar a campanha.", label: "Enviar para revisão" },
    delete: { title: "Excluir este rascunho?", description: "A exclusão é definitiva. Só é possível para rascunhos sem nenhuma receita enviada.", label: "Excluir rascunho", destructive: true },
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="space-y-4">
        <button type="button" onClick={() => navigate("/admin/campaigns")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft size={12} /> Todas as campanhas
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Megaphone size={24} className="text-primary shrink-0" />
              <span className="min-w-0 break-words">{c.name}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn("border text-[10px]", status.className)}>{status.label}</Badge>
              {suspended && (
                <Badge className="border text-[10px] gap-1 bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-800">
                  <PauseCircle size={10} /> Suspensa
                </Badge>
              )}
              {inReview && !perms.campaigns_publish && (
                <Badge className="border text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">Aguardando publicação</Badge>
              )}
              <span className="text-[11px] text-muted-foreground font-mono">/campanhas/{c.slug}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {c.features.submission && <>Inscrições {STATE_WORD[regState]}</>}
              {c.features.submission && c.features.voting && " · "}
              {c.features.voting && <>Votação {VOTE_WORD[votState]}</>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TourButton onClick={tour.start} />
            {perms.campaigns_edit && !closed && (
              <Button variant="outline" className="gap-2 rounded-xl" onClick={() => navigate(`${base}/edit`)}>
                <Pencil size={14} /> Editar
              </Button>
            )}
            {(isDraft || inReview) && perms.campaigns_publish && (
              <Button data-tutorial="camp-panel-publish" className="gap-2 rounded-xl" onClick={() => setPublishOpen(true)} disabled={busy !== null}>
                <Rocket size={14} /> Publicar
              </Button>
            )}
            {isDraft && !perms.campaigns_publish && perms.campaigns_edit && (
              <Button data-tutorial="camp-panel-publish" className="gap-2 rounded-xl" onClick={() => setConfirm("review")} disabled={busy !== null}>
                <Send size={14} /> Enviar para revisão
              </Button>
            )}
            {visibleMenu.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-xl" aria-label="Mais ações" disabled={busy !== null}>
                    {busy !== null ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {visibleMenu.map((m, i) => (
                    <Fragment key={m.key}>
                      {m.danger && i > 0 && !visibleMenu[i - 1].danger && <DropdownMenuSeparator />}
                      <DropdownMenuItem onSelect={m.onSelect} className={cn("gap-2 cursor-pointer", m.danger && "text-destructive focus:text-destructive")}>
                        {m.icon} {m.label}
                      </DropdownMenuItem>
                    </Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Quem enxerga o quê */}
        {isDraft || inReview ? (
          <Notice tone="info" title="Esta campanha ainda não foi publicada">
            Somente a gestão a enxerga. Os colaboradores só passam a ver a campanha — e o menu Campanhas — depois que alguém com permissão clicar em Publicar.
          </Notice>
        ) : suspended ? (
          <Notice tone="warn" title="Campanha suspensa">Está oculta dos colaboradores. Os dados foram preservados; use "Retomar" para voltar a exibi-la.</Notice>
        ) : scheduled ? (
          <Notice tone="info" title="Publicação agendada">Os colaboradores passam a ver esta campanha em {fmtDateTime(c.visible_from)}.</Notice>
        ) : null}
      </div>

      {/* Abas */}
      <Tabs value={tab} onValueChange={goTab} className="gap-4">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList data-tutorial="camp-panel-tabs" className="h-10 w-max min-w-full justify-start">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} data-tutorial={`camp-tab-${t.value}`} className="flex-none px-3.5">
                {t.icon} {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview"><OverviewTab {...tabProps} /></TabsContent>
        {tabs.some((t) => t.value === "submissions") && <TabsContent value="submissions"><SubmissionsTab {...tabProps} /></TabsContent>}
        {tabs.some((t) => t.value === "participants") && <TabsContent value="participants"><ParticipantsTab {...tabProps} /></TabsContent>}
        {tabs.some((t) => t.value === "voting") && <TabsContent value="voting"><VotingTab {...tabProps} /></TabsContent>}
        {tabs.some((t) => t.value === "results") && <TabsContent value="results"><ResultsTab {...tabProps} /></TabsContent>}
        {tabs.some((t) => t.value === "schedule") && <TabsContent value="schedule"><ScheduleTab {...tabProps} /></TabsContent>}
        <TabsContent value="history"><HistoryTab {...tabProps} /></TabsContent>
        {tabs.some((t) => t.value === "reports") && <TabsContent value="reports"><ReportsTab {...tabProps} /></TabsContent>}
      </Tabs>

      {publishOpen && (
        <PublishDialog
          campaignId={c.id}
          campaignName={c.name}
          open={publishOpen}
          onOpenChange={setPublishOpen}
          onPublished={(r) => {
            detail.reload();
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
        title={reasoned === "close" ? "Encerrar a campanha?" : "Suspender a campanha?"}
        description={reasoned === "close"
          ? "A campanha deixa de receber receitas e votos para todos e não pode ser reaberta (você pode duplicá-la depois). Dados e histórico são preservados."
          : "A campanha some para os colaboradores até você retomá-la. Nada é apagado."}
        placeholder="Motivo (opcional)"
        confirmLabel={reasoned === "close" ? "Encerrar campanha" : "Suspender"}
        destructive={reasoned === "close"}
        pending={busy === "suspend" || busy === "close"}
        onConfirm={onReason}
      />

      <CampaignTour steps={ADMIN_TOUR_PANEL} tour={tour} />
    </div>
  );
}
