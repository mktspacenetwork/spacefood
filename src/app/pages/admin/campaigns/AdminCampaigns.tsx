import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Copy, History as HistoryIcon, Loader2, Megaphone, PauseCircle, Pencil, Plus, Power, Search, Settings2, ShieldCheck,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/input";
import { Switch } from "../../../components/ui/switch";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../context/auth-context";
import { campaignsApi } from "../../../lib/campaigns/api";
import { AUDIT_ACTION, CAMPAIGN_STATUS, fmtDateTime, fmtShort, plural } from "../../../lib/campaigns/format";
import type { AdminCampaignListItem, AdminOverview, CampaignStatus } from "../../../lib/campaigns/types";
import { CampaignTour, TourButton, tourKey, useTour } from "../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_OVERVIEW } from "../../../lib/campaigns/tours-admin";
import { useCampaignPerms } from "./useCampaignPerms";
import { AccessTab } from "./tabs/AccessTab";
import { DuplicateDialog } from "./DuplicateDialog";
import { EmptyBox, ErrorBox, LoadingBox, RestrictedBox, Stat, useBusy, useLoader } from "./shared";

const STATUS_FILTERS: { value: "all" | CampaignStatus; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "draft", label: "Rascunhos" },
  { value: "in_review", label: "Em revisão" },
  { value: "authorized", label: "Publicadas" },
  { value: "closed", label: "Encerradas" },
  { value: "archived", label: "Arquivadas" },
];

function stageRange(c: AdminCampaignListItem, key: "registration" | "voting"): string {
  const s = c.stages.find((x) => x.stage_key === key);
  if (!s || (!s.starts_at && !s.ends_at)) return "Datas não definidas";
  return `${fmtShort(s.starts_at)} → ${fmtShort(s.ends_at)}`;
}

export function AdminCampaigns() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { perms, loading: permsLoading, isAdmin } = useCampaignPerms();

  const overview = useLoader<AdminOverview>(() => campaignsApi.get("/admin/overview"), []);
  const list = useLoader<AdminCampaignListItem[]>(() => campaignsApi.get("/admin/campaigns"), []);
  // A tour só começa quando os alvos já estão na tela (senão os passos seriam pulados).
  const tour = useTour({
    storageKey: tourKey("admin", user?.id, "overview"),
    enabled: !permsLoading && isAdmin && !!overview.data && !!list.data,
  });
  const { busy, run } = useBusy();

  const [filter, setFilter] = useState<"all" | CampaignStatus>("all");
  const [search, setSearch] = useState("");
  const [moduleTarget, setModuleTarget] = useState<boolean | null>(null);
  const [dupTarget, setDupTarget] = useState<AdminCampaignListItem | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter(
      (c) => (filter === "all" || c.status === filter) && (!q || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)),
    );
  }, [list.data, filter, search]);

  const toggleModule = async () => {
    const next = moduleTarget;
    setModuleTarget(null);
    if (next === null) return;
    const r = await run("module", () => campaignsApi.put<{ enabled: boolean }>("/admin/module", { enabled: next }),
      next ? "Módulo ligado." : "Módulo desligado.");
    if (r.ok) overview.setData((o) => (o ? { ...o, enabled: r.value.enabled } : o));
  };

  if (permsLoading) return <LoadingBox />;
  if (!isAdmin) return <RestrictedBox />;

  const counts = overview.data?.counts;
  const enabled = overview.data?.enabled ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone size={24} className="text-primary" />
            Campanhas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie e acompanhe campanhas internas, como o concurso de receitas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TourButton onClick={tour.start} />
          {perms.campaigns_create && (
            <Button data-tutorial="camp-new" className="gap-2 rounded-xl" onClick={() => navigate("/admin/campaigns/new")}>
              <Plus size={16} /> Nova campanha
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="campanhas" className="gap-4">
        {perms.campaigns_access && (
          <TabsList className="h-10 w-full sm:w-fit">
            <TabsTrigger value="campanhas" className="px-4"><Megaphone size={14} /> Campanhas</TabsTrigger>
            <TabsTrigger value="acesso" className="px-4"><ShieldCheck size={14} /> Acesso</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="campanhas" className="space-y-6">
          {/* Chave do módulo */}
          <Card data-tutorial="camp-module-switch" className="rounded-3xl border">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={cn("h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center", enabled ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-muted text-muted-foreground")}>
                <Power size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm">Módulo de campanhas {enabled ? "ligado" : "desligado"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {enabled
                    ? "Colaboradores elegíveis veem o menu Campanhas quando existe uma campanha publicada para eles."
                    : "Enquanto estiver desligado, nenhum colaborador vê o menu, as campanhas ou a tour — mesmo que haja campanhas publicadas."}
                </p>
              </div>
              {busy === "module" ? (
                <Loader2 size={18} className="animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  checked={enabled}
                  disabled={!perms.campaigns_publish || overview.loading || !overview.data || busy !== null}
                  onCheckedChange={(v) => setModuleTarget(v)}
                  aria-label="Ligar ou desligar o módulo de campanhas"
                />
              )}
            </CardContent>
          </Card>

          {/* KPIs */}
          {overview.loading && !overview.data ? (
            <LoadingBox />
          ) : overview.error && !overview.data ? (
            <ErrorBox message={overview.error} onRetry={overview.reload} />
          ) : counts ? (
            <div data-tutorial="camp-kpis" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <Stat label="Total" value={counts.total} />
              <Stat label="Rascunhos" value={counts.draft} />
              <Stat label="Agendadas" value={counts.scheduled} />
              <Stat label="Ativas" value={counts.active} />
              <Stat label="Encerradas" value={counts.closed} />
              <Stat label="Com resultado" value={counts.with_results} />
            </div>
          ) : null}

          {/* Lista */}
          <div data-tutorial="camp-list" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou endereço"
                  className="pl-9 rounded-xl h-10"
                  aria-label="Buscar campanha"
                />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger className="rounded-xl h-10 sm:w-48" aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {list.loading && !list.data ? (
              <LoadingBox />
            ) : list.error && !list.data ? (
              <ErrorBox message={list.error} onRetry={list.reload} />
            ) : rows.length === 0 ? (
              <EmptyBox
                icon={<Megaphone size={36} />}
                title={(list.data ?? []).length === 0 ? "Nenhuma campanha criada ainda." : "Nenhuma campanha encontrada com esses filtros."}
                hint={(list.data ?? []).length === 0 && perms.campaigns_create ? "Clique em \"Nova campanha\" para começar." : undefined}
              />
            ) : (
              <div className="space-y-3">
                {rows.map((c) => {
                  const st = CAMPAIGN_STATUS[c.status];
                  const editable = c.status !== "closed" && c.status !== "archived";
                  return (
                    <Card key={c.id} className="rounded-3xl border">
                      <CardContent className="p-5 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <button type="button" className="text-left font-bold text-base text-foreground hover:text-primary transition-colors" onClick={() => navigate(`/admin/campaigns/${c.id}`)}>
                              {c.name}
                            </button>
                            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">/{c.slug}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={cn("border text-[10px]", st.className)}>{st.label}</Badge>
                            {c.suspended_at && (
                              <Badge className="border text-[10px] gap-1 bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-800">
                                <PauseCircle size={10} /> Suspensa
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                          <span><b className="text-foreground/80">Inscrições:</b> {stageRange(c, "registration")}</span>
                          <span><b className="text-foreground/80">Votação:</b> {stageRange(c, "voting")}</span>
                          <span><b className="text-foreground/80">Receitas:</b> {plural(c.submissions, "enviada", "enviadas")}</span>
                        </div>
                        {c.status === "authorized" && c.visible_from && new Date(c.visible_from).getTime() > Date.now() && (
                          <p className="text-[11px] text-muted-foreground">Agendada para aparecer em {fmtDateTime(c.visible_from)}.</p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => navigate(`/admin/campaigns/${c.id}`)}>
                            <Settings2 size={13} /> Gerenciar
                          </Button>
                          {perms.campaigns_edit && editable && (
                            <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={() => navigate(`/admin/campaigns/${c.id}/edit`)}>
                              <Pencil size={13} /> Editar
                            </Button>
                          )}
                          {perms.campaigns_duplicate && (
                            <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={() => setDupTarget(c)}>
                              <Copy size={13} /> Duplicar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="gap-1.5 rounded-xl" onClick={() => navigate(`/admin/campaigns/${c.id}?tab=history`)}>
                            <HistoryIcon size={13} /> Histórico
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Atividade recente */}
          {overview.data && overview.data.recent.length > 0 && (
            <Card className="rounded-3xl border">
              <CardContent className="p-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Atividade recente</p>
                <ul className="divide-y divide-border">
                  {overview.data.recent.map((r, i) => (
                    <li key={`${r.occurred_at}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        <b className="font-medium">{AUDIT_ACTION[r.action] ?? r.action}</b>
                        <span className="text-muted-foreground"> · {r.actor_name || "Sistema"}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDateTime(r.occurred_at)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {perms.campaigns_access && (
          <TabsContent value="acesso">
            <AccessTab currentUserId={user?.id} />
          </TabsContent>
        )}
      </Tabs>

      <ConfirmDialog
        open={moduleTarget !== null}
        onOpenChange={(o) => !o && setModuleTarget(null)}
        title={moduleTarget ? "Ligar o módulo de campanhas?" : "Desligar o módulo de campanhas?"}
        description={
          moduleTarget
            ? "Colaboradores elegíveis passarão a ver o menu Campanhas se houver campanha publicada para eles."
            : "Nenhum colaborador verá o menu, as campanhas ou a tour. Os dados e as campanhas não são apagados e você pode religar quando quiser."
        }
        confirmLabel={moduleTarget ? "Ligar módulo" : "Desligar módulo"}
        variant={moduleTarget ? "default" : "destructive"}
        onConfirm={toggleModule}
      />

      {dupTarget && (
        <DuplicateDialog
          open
          onOpenChange={(o) => !o && setDupTarget(null)}
          campaignId={dupTarget.id}
          campaignName={dupTarget.name}
          onDuplicated={(id) => navigate(`/admin/campaigns/${id}`)}
        />
      )}

      <CampaignTour steps={ADMIN_TOUR_OVERVIEW} tour={tour} />
    </div>
  );
}
