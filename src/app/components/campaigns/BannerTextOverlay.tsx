import type { BannerPreviewSize } from "./BannerBoxPreview";
import { BANNER_DEFAULT_BG, BANNER_DEFAULT_TEXT, bannerPillTextColor } from "../../lib/campaigns/banner";

/**
 * Texto por cima da imagem na PRÉVIA do admin, na MESMA proporção do slide real da Home
 * (`BannerItem` e `CampaignSlide` em components/menu/BannerCarousel.tsx).
 *
 * Lá os tamanhos são fixos em px por faixa de tela (celular = classes-base, tablet = `md:`, computador = `lg:`) e o banner
 * ocupa a largura da página; aqui a caixa da prévia é menor, então cada medida é convertida para `cqw` (% da largura da
 * caixa) a partir da largura REAL do banner naquela faixa — assim o texto corta (ou não) exatamente como na Home.
 * Larguras de referência: celular 343 (tela de 375 − 2×16), tablet 704 (768 − 2×32), computador 1216 (`max-w-7xl` − 2×32).
 * Se mudar o texto do banner na Home, ajuste `OVERLAY` aqui também.
 */
const OVERLAY: Record<BannerPreviewSize, {
  ref: number; padX: number; padY: number; gap: number; title: number; desc: number;
  btnTop: number; btnX: number; btnY: number; btnText: number; maxW: string;
}> = {
  mobile: { ref: 343, padX: 20, padY: 16, gap: 6, title: 16, desc: 11, btnTop: 2, btnX: 14, btnY: 6, btnText: 11, maxW: "62%" },
  tablet: { ref: 704, padX: 40, padY: 32, gap: 16, title: 30, desc: 14, btnTop: 8, btnX: 24, btnY: 10, btnText: 14, maxW: "60%" },
  desktop: { ref: 1216, padX: 48, padY: 32, gap: 16, title: 36, desc: 16, btnTop: 8, btnX: 24, btnY: 10, btnText: 14, maxW: "60%" },
};

type Props = {
  size: BannerPreviewSize;
  title?: string;
  description?: string;
  /** Texto do botão já resolvido (vazio = sem botão). */
  buttonText?: string;
  textColor?: string;
  background?: string;
};

export function BannerTextOverlay({ size, title, description, buttonText, textColor, background }: Props) {
  const o = OVERLAY[size];
  const cq = (px: number) => `${((px / o.ref) * 100).toFixed(3)}cqw`;
  const txt = textColor || BANNER_DEFAULT_TEXT;
  const pillText = bannerPillTextColor(background || BANNER_DEFAULT_BG);
  return (
    <div
      className="relative z-10 flex h-full w-full flex-col items-start justify-center overflow-hidden"
      style={{ maxWidth: o.maxW, padding: `${cq(o.padY)} ${cq(o.padX)}`, gap: cq(o.gap) }}
    >
      {title && (
        <h3 className="font-extrabold leading-tight tracking-tight drop-shadow-sm line-clamp-2" style={{ color: txt, fontSize: cq(o.title) }}>{title}</h3>
      )}
      {description && (
        <p className="font-medium opacity-90 leading-snug drop-shadow-sm line-clamp-2" style={{ color: txt, fontSize: cq(o.desc) }}>{description}</p>
      )}
      {buttonText && (
        <div className="shrink-0" style={{ marginTop: cq(o.btnTop) }}>
          <span
            className="inline-block rounded-full font-bold shadow-lg"
            style={{ backgroundColor: txt, color: pillText, fontSize: cq(o.btnText), padding: `${cq(o.btnY)} ${cq(o.btnX)}` }}
          >
            {buttonText}
          </span>
        </div>
      )}
    </div>
  );
}
