import { Megaphone } from "lucide-react";
import { cn } from "../../lib/utils";
import { BANNER_DEFAULT_BG, BANNER_OBJECT_POSITION, BANNER_TEXT_MASK, bannerHasText, bannerPillTextColor, readBannerText } from "../../lib/campaigns/banner";
import { BANNER_ASPECT } from "./campaignInfo";
import { BANNER_PILL_CLASSES, BannerTextLayer } from "./BannerTextLayer";

/**
 * Capa da campanha = banner da Home: a MESMA caixa responsiva (2:1 no celular → 3:1 no tablet → 3,5:1 no computador) e a
 * MESMA regra de imagem dos banners comuns de só imagem (`object-cover`, posição `center right`). Uma imagem para todos os
 * aparelhos: se a proporção da capa for diferente da caixa, as bordas são cortadas, como em qualquer banner. Sem imagem,
 * usa o laranja do site. Vale para a página da campanha e para os cartões da lista.
 *
 * Com `banner` (texto configurado no cadastro: título, descrição, botão, fundo e cor do texto) desenha o MESMO banner da
 * Home, com o texto por cima da imagem (a lateral esquerda esmaece, como nos banners comuns). Só a página da campanha
 * passa `banner`; os cartões da lista (pequenos) seguem só com a imagem. Sem texto configurado nada muda.
 */
export function CampaignCover({ url, className, eager = false, banner }: { url?: string | null; className?: string; eager?: boolean; banner?: unknown }) {
  const text = readBannerText(banner);
  if (bannerHasText(text)) {
    const bg = text.background ?? BANNER_DEFAULT_BG;
    const color = text.text_color;
    return (
      <div className={cn("relative flex w-full items-center overflow-hidden", BANNER_ASPECT, className)} style={{ background: bg }}>
        {url && (
          <img
            src={url}
            alt=""
            draggable={false}
            loading={eager ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full select-none object-cover opacity-90"
            style={{ objectPosition: BANNER_OBJECT_POSITION, maskImage: BANNER_TEXT_MASK, WebkitMaskImage: BANNER_TEXT_MASK }}
          />
        )}
        <BannerTextLayer title={text.title} description={text.description} textColor={color}>
          {text.button_text && (
            <span className={BANNER_PILL_CLASSES} style={{ backgroundColor: color || "#FFFFFF", color: bannerPillTextColor(bg) }}>{text.button_text}</span>
          )}
        </BannerTextLayer>
      </div>
    );
  }
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
