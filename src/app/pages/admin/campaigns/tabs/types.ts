import type { AdminCampaign, AdminResults, AdminStageRow } from "../../../../lib/campaigns/types";

/** Props comuns das abas do painel de uma campanha. */
export type TabProps = {
  campaignId: string;
  campaign: AdminCampaign;
  stages: AdminStageRow[];
  results: AdminResults | null;
  perms: Record<string, boolean>;
  /** Recarrega os dados do painel (cabeçalho, etapas, resultado) depois de uma ação. */
  onChanged: () => void;
  /** Troca de aba por código (ex.: "Ir para Receitas"). `section` abre uma seção da aba (ex.: settings → schedule). */
  goTab?: (tab: string, section?: string) => void;
  /** Quem está vendo (a tour de cada aba lembra, por pessoa, que já foi mostrada). */
  tourUserId?: string;
  /** Sobe a cada clique em "Ver tour" no cabeçalho: a aba aberta reabre a própria tour. */
  tourSignal?: number;
};
