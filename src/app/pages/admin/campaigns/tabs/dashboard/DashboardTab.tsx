import { BarChart3 } from "lucide-react";
import { campaignsApi } from "../../../../../lib/campaigns/api";
import type { AdminAnalytics } from "../../../../../lib/campaigns/types";
import { EmptyBox, ErrorBox, LoadingBox } from "../../shared";
import type { TabProps } from "../types";
import { usePolling } from "../usePolling";
import { EvolutionChart, UnitChart } from "./Charts";
import { KpiCards } from "./KpiCards";
import { Funnel, StagesCard, TopRanking } from "./Lists";
import { LiveStatus } from "./parts";

/** Atualização do dashboard: 20 s. A participação por unidade é mais pesada e muda devagar: 5 min. */
const LIVE_MS = 20_000;
const UNITS_MS = 5 * 60_000;

/**
 * Dashboard da campanha (aba Relatórios). Carregado sob demanda (`React.lazy`) para não pesar as telas de uso diário.
 * Os números vêm de `GET /admin/campaigns/:id/analytics` e se atualizam sozinhos a cada 20 s enquanto a página está
 * visível. É independente do período escolhido nos downloads.
 */
export default function DashboardTab({ campaignId, campaign, stages, results, perms, goTab }: TabProps) {
  const f = campaign.features;
  const isDraft = campaign.status === "draft" || campaign.status === "in_review";
  const finished = campaign.status === "closed" || campaign.status === "archived";

  const main = usePolling<AdminAnalytics>(
    () => campaignsApi.get(`/admin/campaigns/${campaignId}/analytics`),
    { intervalMs: LIVE_MS, resetKey: campaignId, autoRefresh: !finished, enabled: !isDraft },
  );
  // Por unidade só com permissão de ver participantes (o servidor também confere).
  const canUnits = !!perms.campaigns_participants && f.submission;
  const units = usePolling<AdminAnalytics>(
    () => campaignsApi.get(`/admin/campaigns/${campaignId}/analytics?units=1`),
    { intervalMs: UNITS_MS, resetKey: campaignId, autoRefresh: !finished, enabled: canUnits && !isDraft },
  );

  if (isDraft) {
    return (
      <EmptyBox
        icon={<BarChart3 size={34} />}
        title="Sem dados ainda"
        hint="O dashboard aparece depois que a campanha for publicada e as primeiras receitas chegarem."
      />
    );
  }
  if (main.loading && !main.data) return <LoadingBox label="Carregando o dashboard..." />;
  if (!main.data) return <ErrorBox message={main.error ?? "Não foi possível carregar o dashboard."} onRetry={main.reload} />;

  const d = main.data;
  const byUnit = units.data?.by_unit;
  // Cada número leva à tela detalhada, quando a pessoa tem acesso a ela.
  const to = (tab: string, section?: string) => (goTab ? () => goTab(tab, section) : undefined);
  const go = {
    people: perms.campaigns_participants ? to("submissions", "people") : perms.campaigns_review ? to("submissions") : undefined,
    recipes: perms.campaigns_review ? to("submissions") : perms.campaigns_participants ? to("submissions", "people") : undefined,
    results: d.has_voting && perms.campaigns_results ? to("results") : undefined,
  };

  return (
    <div data-tutorial="camp-rep-dashboard" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dashboard</p>
        <LiveStatus
          generatedAt={d.generated_at}
          fetchedAt={main.fetchedAt}
          error={main.error}
          autoRefresh={!finished}
          refreshing={main.refreshing}
          onReload={main.reload}
        />
      </div>

      <KpiCards data={d} campaign={campaign} go={go} />

      {f.submission && <EvolutionChart data={d} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {f.submission && <Funnel data={d} campaign={campaign} />}
        {canUnits && byUnit && byUnit.length > 0 && <UnitChart units={byUnit} withVotes={d.has_voting} />}
        {d.has_voting && <TopRanking data={d} onOpen={go.results} />}
        <StagesCard stages={d.stages.length ? d.stages : stages} campaign={campaign} results={results} hasVoting={d.has_voting} />
      </div>
    </div>
  );
}
