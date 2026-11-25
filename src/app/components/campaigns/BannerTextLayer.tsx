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
 *  - "container" (área de Campanhas): a página é mais estreita (máx. 672 px), então em tablet e computador as medidas
 *    seguem a largura do PRÓPRIO banner (`cqw`, calculadas sobre as larguras reais da Home: 704 px no tablet e 1216 px no
 *    computador), com piso de 12 px nos textos pequenos para continuarem legíveis. No celular as classes são as mesmas da Home
 *    (o banner tem a mesma largura lá). O banner precisa ser um `@container` (ver `CampaignBannerSlide`).
 */
export type BannerFit = "viewport" | "container";

const LAYER = {
  viewport: "px-5 py-4 md:max-w-[60%] md:gap-4 md:px-10 md:py-8 lg:px-12",
  container: "px-5 py-4 md:max-w-[60%] md:gap-[2.27cqw] md:px-[5.68cqw] md:py-[4.55cqw] lg:gap-[1.32cqw] lg:px-[3.95cqw] lg:py-[2.63cqw]",
} as const;
const TITLE = {
  viewport: "sm:text-lg md:text-3xl lg:text-4xl",
  container: "sm:text-lg md:text-[4.26cqw] lg:text-[2.96cqw]",
} as const;
const DESC = {
  viewport: "sm:text-xs md:text-sm lg:text-base",
  container: "sm:text-xs md:text-[max(12px,1.99cqw)] lg:text-[max(12px,1.32cqw)]",
} as const;
const PILL_WRAP = {
  viewport: "md:mt-2",
  container: "md:mt-[1.14cqw] lg:mt-[0.66cqw]",
} as const;
const PILL = {
  viewport: "sm:text-xs md:px-6 md:py-2.5 md:text-sm",
  container: "sm:text-xs md:px-[3.41cqw] md:py-[1.42cqw] md:text-[max(12px,1.99cqw)] lg:px-[max(14px,1.97cqw)] lg:py-[max(7px,0.82cqw)] lg:text-[max(12px,1.15cqw)]",
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
        <p className={cn("line-clamp-2 text-[11px] font-medium leading-snug opacity-90 drop-shadow-sm [overflow-wrap:anywhere]", DESC[fit])} style={{ color }}>
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
