import { useEffect, useRef, useState, type ReactNode } from "react";
import { UtensilsCrossed } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * Foto de receita no padrão ÚNICO da plataforma: sempre 4:3, centralizada (object-cover + object-center), sem
 * deformar e sem reduzir a qualidade (o arquivo é exibido como veio; só o recorte muda). É a mesma peça nas
 * campanhas ativas e encerradas, na galeria, em Minhas receitas, na votação, no resultado e no Livro.
 *
 * Variantes (todas 4:3):
 * - `tile`  : preenche a largura do cartão (galeria, votação, resultado). Quem recorta cantos é o cartão.
 * - `row`   : miniatura de lista (80 px de largura).
 * - `thumb` : miniatura para trocar a foto grande (64 px de largura).
 * - `hero`  : foto grande da receita; centralizada, no máximo 560 px de largura, cantos arredondados.
 *
 * Carregamento preguiçoso (`loading="lazy"`; use `eager` para a foto grande da tela), esqueleto enquanto carrega e
 * ícone no lugar quando não há foto ou ela falha. `children` são selos por cima da foto (canto superior).
 */
export type RecipePhotoVariant = "tile" | "row" | "thumb" | "hero";

const FRAME: Record<RecipePhotoVariant, string> = {
  tile: "relative aspect-[4/3] w-full overflow-hidden bg-muted",
  row: "relative aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-xl bg-muted",
  thumb: "relative aspect-[4/3] w-16 shrink-0 overflow-hidden rounded-xl bg-muted",
  hero: "relative mx-auto aspect-[4/3] w-full max-w-[560px] overflow-hidden rounded-3xl bg-muted",
};

const ICON_SIZE: Record<RecipePhotoVariant, number> = { tile: 30, row: 22, thumb: 16, hero: 54 };

export type RecipePhotoProps = {
  /** URL da foto. Vazio/nulo = mostra o ícone. */
  src?: string | null;
  /** Texto alternativo. Vazio = decorativa (o título já está ao lado). */
  alt?: string;
  variant?: RecipePhotoVariant;
  /** Carrega já (foto grande acima da dobra). Padrão: preguiçoso. */
  eager?: boolean;
  className?: string;
  /** Selos desenhados por cima da foto (posicione com `absolute`). */
  children?: ReactNode;
};

export function RecipePhoto({ src, alt = "", variant = "tile", eager, className, children }: RecipePhotoProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(src ? "loading" : "error");
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Trocou a foto (ex.: miniatura escolhida): recomeça o ciclo.
  useEffect(() => { setStatus(src ? "loading" : "error"); }, [src]);

  // Imagem que já veio do cache pode ter terminado antes de o React anexar o onLoad.
  useEffect(() => {
    const el = imgRef.current;
    if (src && el && el.complete) setStatus(el.naturalWidth > 0 ? "ready" : "error");
  }, [src]);

  return (
    <div className={cn(FRAME[variant], className)}>
      {src && status !== "error" && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
          className={cn("absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300", status === "ready" ? "opacity-100" : "opacity-0")}
        />
      )}
      {src && status === "loading" && <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-muted" />}
      {status === "error" && (
        <div
          role={alt ? "img" : undefined}
          aria-label={alt ? `${alt} (sem foto)` : undefined}
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-100 to-amber-100 text-orange-400 dark:from-orange-950/40 dark:to-amber-950/30"
        >
          <UtensilsCrossed size={ICON_SIZE[variant]} strokeWidth={variant === "hero" ? 1.5 : 2} aria-hidden="true" />
        </div>
      )}
      {children}
    </div>
  );
}
