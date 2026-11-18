import { useEffect, useRef } from "react";
import { tourKey, useTour } from "../../../../components/campaigns/CampaignTour";
import type { TourController } from "../../../../components/campaigns/CampaignTour";

export type PanelTabKey = "summary" | "submissions" | "participants" | "voting" | "draw" | "reports" | "settings";

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
    storageKey: tourKey("admin", p.tourUserId, `panel-${tab}`),
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
