import { Suspense, lazy, useEffect, useState } from "react";
import { FileDown, History as HistoryIcon } from "lucide-react";
import { CampaignTour } from "../../../../components/campaigns/CampaignTour";
import { ErrorBoundary } from "../../../../components/ui/ErrorBoundary";
import { ADMIN_TOUR_TABS } from "../../../../lib/campaigns/tours-admin";
import { ErrorBox, LoadingBox } from "../shared";
import { HistoryTab } from "./HistoryTab";
import { ReportsTab } from "./ReportsTab";
import type { TabProps } from "./types";
import { Fold } from "./ui";
import { useTabTour } from "./useTabTour";

// O dashboard (gráficos) é baixado só quando a pessoa abre Relatórios: as telas de uso diário não pagam por ele.
const DashboardTab = lazy(() => import("./dashboard/DashboardTab"));

/**
 * RELATÓRIOS — três blocos, nesta ordem: o DASHBOARD (números e gráficos ao vivo), as PLANILHAS (download com período)
 * e o HISTÓRICO completo. (O Livro de Receitas é um acervo único e tem área própria em Campanhas.)
 * `?section=history` abre direto o histórico.
 */
export function ReportsPanel(props: TabProps & { section?: string | null }) {
  const { section, ...tabProps } = props;
  const { tourUserId, tourSignal } = tabProps;
  const [historyOpen, setHistoryOpen] = useState(section === "history");
  const tour = useTabTour("reports", { tourUserId, tourSignal, ready: true });

  // Link direto para o histórico: abre o item e rola até ele.
  useEffect(() => {
    if (section !== "history") return;
    setHistoryOpen(true);
    const t = setTimeout(() => document.getElementById("camp-rep-history")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => clearTimeout(t);
  }, [section]);

  return (
    <div className="space-y-6">
      <section aria-label="Dashboard">
        {/* Se o pedaço do dashboard falhar ao baixar (rede), as planilhas e o histórico continuam funcionando. */}
        <ErrorBoundary
          fallback={<ErrorBox message="Não foi possível abrir o dashboard agora. As planilhas e o histórico seguem disponíveis." onRetry={() => window.location.reload()} />}
        >
          <Suspense fallback={<LoadingBox label="Carregando o dashboard..." />}>
            <DashboardTab {...tabProps} />
          </Suspense>
        </ErrorBoundary>
      </section>

      <div data-tutorial="camp-rep-list" className="space-y-3">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><FileDown size={14} aria-hidden="true" /> Planilhas</p>
        <ReportsTab {...tabProps} />
      </div>

      <Fold
        anchorId="camp-rep-history"
        tutorial="camp-rep-history"
        icon={<HistoryIcon size={18} />}
        title="Histórico"
        hint="Tudo o que foi feito: quem, quando e por quê."
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      >
        <HistoryTab {...tabProps} />
      </Fold>

      <CampaignTour steps={ADMIN_TOUR_TABS.reports} tour={tour} />
    </div>
  );
}
