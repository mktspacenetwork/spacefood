import { useEffect, useMemo, useState } from "react";
import { ChefHat, ListChecks, Quote } from "lucide-react";
import { Card } from "../ui/Card";
import { cn } from "../../lib/utils";
import type { MediaItem } from "../../lib/campaigns/types";

/** Linhas do texto, sem espaços nas pontas e sem linhas vazias. */
export function splitLines(text: string | null | undefined): string[] {
  return (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

const BULLET = /^([-•*–—]|\d+\s*[.)\-–])\s+/;
const STEP_NUM = /^(passo\s*)?\d+\s*[.)\-–:]\s*/i;

const SECTION_CARD = "space-y-3 rounded-3xl p-5 hover:shadow-sm";
const SECTION_TITLE = "flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground";

/** Fotos da receita: a principal grande e, se houver mais, miniaturas para trocar a foto grande. */
export function RecipePhotos({ media, alt, className }: { media: MediaItem[]; alt: string; className?: string }) {
  const photos = useMemo(() => {
    const list = (media ?? []).filter((m) => m.kind !== "video" && m.url);
    return [...list].sort((a, b) => (a.kind === "main_photo" ? 0 : 1) - (b.kind === "main_photo" ? 0 : 1));
  }, [media]);
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [photos.length]);
  if (photos.length === 0) return null;
  const current = photos[Math.min(index, photos.length - 1)];
  return (
    <div className={cn("space-y-2", className)} data-tutorial="camp-recipe-media">
      <div className="overflow-hidden rounded-3xl bg-muted">
        <img src={current.url} alt={`Foto de ${alt}`} className="aspect-[4/3] w-full object-cover" />
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2" role="tablist" aria-label="Fotos da receita">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Ver a foto ${i + 1} de ${photos.length}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-muted transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                i === index ? "border-primary" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Texto da receita: história, ingredientes (lista) e modo de preparo (etapas numeradas quando há mais de uma linha).
 * Nada aparece vazio: seção sem conteúdo some. Receitas antigas, sem ingredientes/preparo, continuam bonitas.
 * As quebras de linha do texto original são preservadas e não há corte de tamanho.
 */
export function RecipeText({ story, ingredients, preparation }: { story?: string | null; ingredients?: string | null; preparation?: string | null }) {
  const ing = splitLines(ingredients).map((l) => l.replace(BULLET, ""));
  const prepLines = splitLines(preparation);
  const asSteps = prepLines.length > 1;
  return (
    <div className="space-y-4">
      {story?.trim() && (
        <Card className={SECTION_CARD}>
          <h3 className={SECTION_TITLE}><Quote size={14} aria-hidden="true" /> História e memória afetiva</h3>
          <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">{story.trim()}</p>
        </Card>
      )}

      {ing.length > 0 && (
        <Card className={SECTION_CARD}>
          <h3 className={SECTION_TITLE}><ListChecks size={14} aria-hidden="true" /> Ingredientes</h3>
          <ul className="space-y-2">
            {ing.map((line, i) => (
              <li key={i} className="flex gap-3 break-words text-sm leading-snug text-foreground">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {prepLines.length > 0 && (
        <Card className={SECTION_CARD}>
          <h3 className={SECTION_TITLE}><ChefHat size={14} aria-hidden="true" /> Modo de preparo</h3>
          {asSteps ? (
            <ol className="space-y-3">
              {prepLines.map((line, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground">
                  <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                  <span className="min-w-0 break-words pt-0.5">{line.replace(STEP_NUM, "")}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">{prepLines[0]}</p>
          )}
        </Card>
      )}
    </div>
  );
}
