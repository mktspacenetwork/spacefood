import { useEffect, useRef, useState, type ReactNode } from "react";
import { Globe, UtensilsCrossed } from "lucide-react";
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
 *
 * `web` (foto que veio da internet): selo pequeno e discreto "Foto da internet" no canto inferior esquerdo; nas variantes
 * pequenas (`row`, `thumb`) só um ícone com título acessível. O crédito completo (autor, licença, fonte) fica na linha
 * `PhotoCredit` sob a foto grande (RecipeBody) e no Livro.
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
  /** Foto que veio da internet (busca no cadastro): mostra o selo "Foto da internet". */
  web?: boolean;
};

export const WEB_PHOTO_LABEL = "Foto da internet";

/** Selo discreto de foto da internet (texto nas variantes grandes, só ícone nas pequenas). */
export function WebPhotoBadge({ variant = "tile", className }: { variant?: RecipePhotoVariant; className?: string }) {
  const small = variant === "row" || variant === "thumb";
  return (
    <span
      title={WEB_PHOTO_LABEL}
      aria-label={small ? WEB_PHOTO_LABEL : undefined}
      className={cn(
        "pointer-events-none absolute z-[1] inline-flex items-center gap-1 rounded-md bg-black/55 text-white backdrop-blur-[2px]",
        small ? "bottom-1 left-1 h-4 w-4 justify-center rounded-full" : "bottom-1.5 left-1.5 px-1.5 py-0.5 text-[10px] font-medium leading-none",
        className,
      )}
    >
      <Globe size={10} aria-hidden="true" />
      {!small && <span>{WEB_PHOTO_LABEL}</span>}
    </span>
  );
}

export function RecipePhoto({ src, alt = "", variant = "tile", eager, className, children, web }: RecipePhotoProps) {
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
      {web && status !== "error" && <WebPhotoBadge variant={variant} />}
      {children}
    </div>
  );
}
