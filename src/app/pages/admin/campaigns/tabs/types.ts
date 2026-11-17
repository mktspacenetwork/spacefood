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
  /** Troca de aba por código (ex.: "Ir para Receitas"). */
  goTab?: (tab: string) => void;
};
