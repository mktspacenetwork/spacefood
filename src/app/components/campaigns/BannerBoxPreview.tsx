import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { BANNER_OBJECT_POSITION } from "../../lib/campaigns/banner";

/**
 * Prévia do banner EXATAMENTE como a exibição real: as mesmas caixas do carrossel da Home
 * (celular 2:1 · tablet 3:1 · computador 3,5:1) e a mesma regra de imagem dos banners comuns (`object-cover`, posição
 * `center right`). É UMA imagem para todos os aparelhos: o seletor só muda a caixa para conferir o enquadramento.
 *
 * Usada pelo cadastro da capa da campanha e pelo formulário do menu Banners — a mesma ideia de configuração nos dois.
 * Quem precisa de texto por cima da imagem (banners comuns) passa `overlay`, que recebe o tamanho escolhido.
 */
export type BannerPreviewSize = "mobile" | "tablet" | "desktop";

const PREVIEW_BOX: Record<BannerPreviewSize, string> = {
  mobile: "aspect-[2/1] max-w-sm",
  tablet: "aspect-[3/1] max-w-2xl",
  desktop: "aspect-[3.5/1]",
};

const SIZE_LABELS: ReadonlyArray<readonly [BannerPreviewSize, string]> = [
  ["mobile", "Celular"], ["tablet", "Tablet"], ["desktop", "Computador"],
];

type Props = {
  url: string | null | undefined;
  /** Conteúdo quando ainda não há imagem (ex.: o nome da campanha). */
  empty?: ReactNode;
  /** Fundo da caixa (cor ou degradê CSS). Sem isto vale o laranja padrão da campanha. */
  background?: string;
  /** Classes extras da imagem (ex.: opacidade, quando há texto por cima). */
  imageClassName?: string;
  /** Estilo extra da imagem (ex.: máscara em degradê, quando há texto por cima). */
  imageStyle?: CSSProperties;
  /** Camada por cima da imagem, desenhada para o tamanho escolhido. */
  overlay?: (size: BannerPreviewSize) => ReactNode;
  /** Rótulo de acessibilidade do bloco. */
  label?: string;
};

export function BannerBoxPreview({ url, empty, background, imageClassName, imageStyle, overlay, label = "Como o banner aparece na Home" }: Props) {
  const [size, setSize] = useState<BannerPreviewSize>(() => (typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop"));
  return (
    <div className="space-y-2" aria-label={label}>
      <div className="inline-flex h-11 items-center rounded-lg border bg-card p-0.5 sm:h-8" role="group" aria-label="Tamanho da prévia">
        {SIZE_LABELS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={size === k}
            onClick={() => setSize(k)}
            className={cn("h-10 rounded-md px-3 text-[11px] font-semibold transition-colors sm:h-7 sm:px-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className={cn("relative w-full overflow-hidden rounded-3xl shadow-sm", !background && "bg-[#FF5A1F]", PREVIEW_BOX[size])}
        // Com texto por cima, a caixa vira "container": o texto escala com a largura (unidades cqw), como na Home real.
        style={background || overlay ? { ...(background ? { background } : null), ...(overlay ? { containerType: "inline-size" as const } : null) } : undefined}
      >
        {url ? (
          <img
            src={url}
            alt=""
            className={cn("absolute inset-0 h-full w-full select-none object-cover", imageClassName)}
            style={{ objectPosition: BANNER_OBJECT_POSITION, ...imageStyle }}
            draggable={false}
          />
        ) : (
          empty && <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm font-bold text-white">{empty}</span>
        )}
        {overlay?.(size)}
      </div>
    </div>
  );
}
