import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { BANNER_DEFAULT_TEXT } from "../../lib/campaigns/banner";

/**
 * Camada de texto do banner de CAMPANHA (título, descrição e botão por cima da imagem), com as MESMAS classes do
 * `BannerItem` dos banners comuns (components/menu/BannerCarousel.tsx): mesmos paddings, tamanhos de letra por faixa
 * de tela (celular → `md:` → `lg:`), limite de 2 linhas e largura máxima de ~60%. A prévia do admin
 * (`BannerTextOverlay`) reproduz estas medidas em `cqw`; se mudar aqui, ajuste lá.
 */
export function BannerTextLayer({
  title, description, textColor, className, children,
}: {
  title?: string;
  description?: string;
  textColor?: string;
  className?: string;
  /** O botão (opcional), já com o estilo de pílula. */
  children?: ReactNode;
}) {
  const color = textColor || BANNER_DEFAULT_TEXT;
  return (
    <div className={cn("relative z-10 flex h-full w-full max-w-[62%] flex-col items-start justify-center gap-1.5 overflow-hidden px-5 py-4 md:max-w-[60%] md:gap-4 md:px-10 md:py-8 lg:px-12", className)}>
      {title && (
        <h2 className="line-clamp-2 text-base font-extrabold leading-tight tracking-tight drop-shadow-sm sm:text-lg md:text-3xl lg:text-4xl [overflow-wrap:anywhere]" style={{ color }}>
          {title}
        </h2>
      )}
      {description && (
        <p className="line-clamp-2 text-[11px] font-medium leading-snug opacity-90 drop-shadow-sm sm:text-xs md:text-sm lg:text-base [overflow-wrap:anywhere]" style={{ color }}>
          {description}
        </p>
      )}
      {children && <div className="mt-0.5 shrink-0 md:mt-2">{children}</div>}
    </div>
  );
}

/** Tamanho e forma do botão (igual ao `buttonText` dos banners comuns); as cores vêm de quem usa. */
export const BANNER_PILL_CLASSES =
  "inline-block rounded-full px-3.5 py-1.5 text-[11px] font-bold shadow-lg sm:text-xs md:px-6 md:py-2.5 md:text-sm";
