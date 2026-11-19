import { useEffect, useRef } from "react";
import { tourKey, useTour } from "../../../../components/campaigns/CampaignTour";
import type { TourController } from "../../../../components/campaigns/CampaignTour";

export type PanelTabKey = "summary" | "submissions" | "participants" | "results" | "reports" | "settings";

/**
 * Versão da tour de cada aba. Subir o número de uma aba faz a tour dela abrir UMA vez de novo para quem já a viu
 * (a chave de "vista" muda); depois volta a abrir só por "Ver tour". Suba SÓ a da aba cujo conteúdo ou alvos mudaram.
 *  - rodada 5 (v2): summary (sem card Status; atividades no fim), submissions e participants ("Fora do prazo"),
 *    results (ranking ao vivo e chave "Mostrar aos colaboradores"), reports (dashboard ao vivo e período do download),
 *    settings (três datas em sequência).
 *  - rodada 5b (v3): summary (o interruptor agora fala em desativar/reativar e Histórico) e settings (zona de risco:
 *    exclusão sempre lógica, em Histórico › Excluídas).
 */
export const TAB_TOUR_VERSION: Record<PanelTabKey, number> = {
  summary: 3,
  submissions: 2,
  participants: 2,
  results: 2,
  reports: 2,
  settings: 3,
};

/**
 * Tour de UMA aba do painel, igual para qualquer perfil:
 *  - abre sozinha na primeira vez que a pessoa entra na aba (e só depois de os dados da aba carregarem,
 *    para os alvos existirem) e nunca mais abre sozinha — `useTour` grava "vista" ao abrir;
 *  - o botão "Ver tour" do cabeçalho do painel muda `tourSignal` e reabre a tour da aba que está aberta.
 * Cada aba só existe na tela enquanto está ativa, então o hook de cada aba roda apenas nela.
 */
export function useTabTour(
  tab: PanelTabKey,
  p: { tourUserId?: string; tourSignal?: number; ready: boolean },
): TourController {
  const tour = useTour({
    storageKey: tourKey("admin", p.tourUserId, `panel-${tab}`, undefined, TAB_TOUR_VERSION[tab]),
    enabled: p.ready && !!p.tourUserId,
  });
  const seen = useRef(p.tourSignal ?? 0);
  const { start } = tour;
  useEffect(() => {
    const s = p.tourSignal ?? 0;
    if (s !== seen.current) {
      seen.current = s;
      start();
    }
  }, [p.tourSignal, start]);
  return tour;
}
