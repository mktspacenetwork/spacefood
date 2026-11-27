import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { BANNER_DEFAULT_TEXT } from "../../lib/campaigns/banner";

/**
 * Camada de texto do banner de CAMPANHA (título, descrição e botão por cima da imagem), com as MESMAS classes do
 * `BannerItem` dos banners comuns (components/menu/BannerCarousel.tsx): mesmos paddings, tamanhos de letra por faixa
 * de tela (celular → `md:` → `lg:`), limite de 2 linhas e largura máxima de ~60%. A prévia do admin
 * (`BannerTextOverlay`) reproduz estas medidas em `cqw`; se mudar aqui, ajuste lá.
 *
 * `fit`:
 *  - "viewport" (Home): exatamente as classes dos banners comuns, que dependem da largura da TELA. O banner da Home ocupa
 *    a largura da página (até ~1216 px).
 *  - "container" (Home e área de Campanhas): as medidas seguem a largura do PRÓPRIO banner (`cqw`). Na Home o banner é mais
 *    estreito que a tela sempre que o menu lateral está aberto (tablet e computador), e as medidas por tela cortavam o texto
 *    (título de 30 px num banner de ~630 px). No computador (`lg`) as proporções são as da Home de 1216 px; na faixa de tablet
 *    (`md`, banner 3:1, que é BAIXO) as medidas são mais enxutas e a descrição fica em 1 linha, para título (2 linhas) + descrição
 *    + botão caberem do banner mais estreito (~450 px) ao mais largo (~700 px) sem cortar. Piso de 12 px nos textos pequenos para
 *    continuarem legíveis. No celular as classes são as mesmas (2:1, banner alto). O banner precisa ser um `@container`
 *    (ver `CampaignBannerSlide`). A prévia do admin (`BannerTextOverlay`) reproduz estas medidas.
 */
export type BannerFit = "viewport" | "container";

const LAYER = {
  viewport: "px-5 py-4 md:max-w-[60%] md:gap-4 md:px-10 md:py-8 lg:px-12",
  container: "px-5 py-4 md:max-w-[60%] md:gap-[1.7cqw] md:px-[5.68cqw] md:py-[3.4cqw] lg:gap-[1.32cqw] lg:px-[3.95cqw] lg:py-[2.63cqw]",
} as const;
const TITLE = {
  viewport: "sm:text-lg md:text-3xl lg:text-4xl",
  container: "sm:text-lg md:text-[3.6cqw] lg:text-[2.96cqw]",
} as const;
const DESC = {
  viewport: "sm:text-xs md:text-sm lg:text-base",
  container: "sm:text-xs md:text-[max(12px,1.8cqw)] lg:text-[max(12px,1.32cqw)]",
} as const;
/** Limite de linhas da descrição: no tablet (banner 3:1, baixo) só 1 linha; nas demais faixas, 2. */
const DESC_CLAMP = {
  viewport: "line-clamp-2",
  container: "line-clamp-2 md:line-clamp-1 lg:line-clamp-2",
} as const;
const PILL_WRAP = {
  viewport: "md:mt-2",
  container: "md:mt-[0.9cqw] lg:mt-[0.66cqw]",
} as const;
const PILL = {
  viewport: "sm:text-xs md:px-6 md:py-2.5 md:text-sm",
  container: "sm:text-xs md:px-[3cqw] md:py-[1.2cqw] md:text-[max(12px,1.8cqw)] lg:px-[max(14px,1.97cqw)] lg:py-[max(7px,0.82cqw)] lg:text-[max(12px,1.15cqw)]",
} as const;

export function BannerTextLayer({
  title, description, textColor, className, fit = "viewport", children,
}: {
  title?: string;
  description?: string;
  textColor?: string;
  className?: string;
  fit?: BannerFit;
  /** O botão (opcional), já com o estilo de pílula. */
  children?: ReactNode;
}) {
  const color = textColor || BANNER_DEFAULT_TEXT;
  return (
    <div className={cn("relative z-10 flex h-full w-full max-w-[62%] flex-col items-start justify-center gap-1.5 overflow-hidden", LAYER[fit], className)}>
      {title && (
        <h2 className={cn("line-clamp-2 text-base font-extrabold leading-tight tracking-tight drop-shadow-sm [overflow-wrap:anywhere]", TITLE[fit])} style={{ color }}>
          {title}
        </h2>
      )}
      {description && (
        <p className={cn("text-[11px] font-medium leading-snug opacity-90 drop-shadow-sm [overflow-wrap:anywhere]", DESC_CLAMP[fit], DESC[fit])} style={{ color }}>
          {description}
        </p>
      )}
      {children && <div className={cn("mt-0.5 shrink-0", PILL_WRAP[fit])}>{children}</div>}
    </div>
  );
}

/** Tamanho e forma do botão (igual ao `buttonText` dos banners comuns); as cores vêm de quem usa. */
export function bannerPillClasses(fit: BannerFit = "viewport"): string {
  return cn("inline-block rounded-full px-3.5 py-1.5 text-[11px] font-bold shadow-lg", PILL[fit]);
}
/** Versão da Home (compatível com quem já importava a constante). */
export const BANNER_PILL_CLASSES = bannerPillClasses("viewport");
