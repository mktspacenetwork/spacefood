import { Megaphone } from "lucide-react";
import { cn } from "../../lib/utils";
import { BANNER_OBJECT_POSITION } from "../../lib/campaigns/banner";
import { BANNER_ASPECT } from "./campaignInfo";

/**
 * Capa da campanha = banner da Home: a MESMA caixa responsiva (2:1 no celular → 3:1 no tablet → 3,5:1 no computador) e a
 * MESMA regra de imagem dos banners comuns de só imagem (`object-cover`, posição `center right`). Uma imagem para todos os
 * aparelhos: se a proporção da capa for diferente da caixa, as bordas são cortadas, como em qualquer banner. Sem imagem,
 * usa o laranja do site. Vale para a página da campanha e para os cartões da lista.
 */
export function CampaignCover({ url, className, eager = false }: { url?: string | null; className?: string; eager?: boolean }) {
  return (
    <div className={cn("relative w-full overflow-hidden bg-muted", BANNER_ASPECT, className)}>
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          loading={eager ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full select-none object-cover"
          style={{ objectPosition: BANNER_OBJECT_POSITION }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500 text-white/90">
          <Megaphone size={40} strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
