import { useEffect, useState } from "react";
import { FileDown, History as HistoryIcon } from "lucide-react";
import { CampaignTour } from "../../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_TABS } from "../../../../lib/campaigns/tours-admin";
import { HistoryTab } from "./HistoryTab";
import { ReportsTab } from "./ReportsTab";
import type { TabProps } from "./types";
import { Fold } from "./ui";
import { useTabTour } from "./useTabTour";

/**
 * RELATÓRIOS — o que se baixa ou se consulta DEPOIS: planilhas da campanha (só as que valem para ela) e o
 * histórico completo. (O Livro de Receitas é um acervo único e tem área própria no menu do Acesso Admin.)
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
    <div className="space-y-4">
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
