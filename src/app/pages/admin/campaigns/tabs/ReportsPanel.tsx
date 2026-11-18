import { useEffect, useState } from "react";
import { BookOpen, FileDown, History as HistoryIcon } from "lucide-react";
import { CampaignTour } from "../../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_TABS } from "../../../../lib/campaigns/tours-admin";
import { BookManager } from "./BookManager";
import { HistoryTab } from "./HistoryTab";
import { ReportsTab } from "./ReportsTab";
import type { TabProps } from "./types";
import { Fold } from "./ui";
import { useTabTour } from "./useTabTour";

/**
 * RELATÓRIOS — tudo o que se baixa ou se consulta DEPOIS: planilhas da campanha (só as que valem para ela),
 * o Livro de Receitas (gerar, prévia, publicar, retirar) e o histórico completo.
 * `?section=book|history` abre direto a seção pedida.
 */
export function ReportsPanel(props: TabProps & { section?: string | null }) {
  const { section, ...tabProps } = props;
  const { campaign: c, perms, tourUserId, tourSignal } = tabProps;
  const showBook = c.features.submission && c.features.approval && (!!perms.campaigns_review || !!perms.campaigns_publish);
  const [bookOpen, setBookOpen] = useState(section !== "history");
  const [historyOpen, setHistoryOpen] = useState(section === "history");
  const tour = useTabTour("reports", { tourUserId, tourSignal, ready: true });

  // Link direto para uma seção: abre o item e rola até ele.
  useEffect(() => {
    if (section === "history") { setHistoryOpen(true); setBookOpen(false); }
    else if (section === "book") { setBookOpen(true); setHistoryOpen(false); }
    else return;
    const t = setTimeout(() => document.getElementById(`camp-rep-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => clearTimeout(t);
  }, [section]);

  return (
    <div className="space-y-4">
      <div data-tutorial="camp-rep-list" className="space-y-3">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><FileDown size={14} aria-hidden="true" /> Planilhas</p>
        <ReportsTab {...tabProps} />
      </div>

      {showBook && (
        <Fold
          anchorId="camp-rep-book"
          tutorial="camp-rep-book"
          icon={<BookOpen size={18} />}
          title="Livro de Receitas"
          hint="Reúne as receitas aprovadas num livro digital."
          open={bookOpen}
          onOpenChange={setBookOpen}
        >
          <BookManager {...tabProps} />
        </Fold>
      )}

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
