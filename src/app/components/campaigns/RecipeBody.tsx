import { useEffect, useMemo, useState } from "react";
import { ChefHat, Clock, ExternalLink, ListChecks, Quote } from "lucide-react";
import { Card } from "../ui/Card";
import { RecipePhoto, WEB_PHOTO_LABEL } from "./RecipePhoto";
import { cn } from "../../lib/utils";
import { ingredientItems, preparationSteps, storyParagraphs } from "../../lib/campaigns/bookText";
import type { MediaItem, WebPhotoCredit } from "../../lib/campaigns/types";

const SECTION_CARD = "space-y-3 rounded-3xl p-5 hover:shadow-sm";
const SECTION_TITLE = "flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground";

/** Só abre links https (a fonte vem de um serviço externo: nunca `javascript:` nem outros esquemas). */
const httpsOnly = (u: string | null | undefined): string | null => (u && /^https:\/\//i.test(u) ? u : null);

const CREDIT_LINK = "inline-flex items-center gap-0.5 rounded underline underline-offset-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/**
 * Crédito de uma foto da internet, em letra miúda sob a foto grande: "Foto da internet · autor · licença · Fonte".
 * A licença abre a página da licença e "Fonte" abre a página da imagem (Wikimedia Commons), sempre em nova aba e com
 * `rel="noopener noreferrer"`. O crédito é a condição de uso das licenças livres.
 */
export function PhotoCredit({ web, className }: { web: WebPhotoCredit; className?: string }) {
  const license = web.license?.trim();
  const licenseUrl = httpsOnly(web.license_url);
  const sourceUrl = httpsOnly(web.source_url);
  const sep = <span aria-hidden="true">·</span>;
  return (
    <p data-photo-credit className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 text-[11px] leading-snug text-muted-foreground", className)}>
      <span className="font-medium">{WEB_PHOTO_LABEL}</span>
      {web.creator?.trim() && <>{sep}<span className="min-w-0 break-words">{web.creator.trim()}</span></>}
      {license && (
        <>
          {sep}
          {licenseUrl
            ? <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className={CREDIT_LINK}>{license}</a>
            : <span>{license}</span>}
        </>
      )}
      {sourceUrl && (
        <>
          {sep}
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir a página da foto na fonte (nova aba)" className={CREDIT_LINK}>
            Fonte <ExternalLink size={10} aria-hidden="true" />
          </a>
        </>
      )}
    </p>
  );
}

/** Fotos da receita: a principal em destaque (4:3, centralizada) e, se houver mais, miniaturas para trocar a foto grande. */
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
    <div className={cn("mx-auto w-full max-w-[560px] space-y-2", className)} data-tutorial="camp-recipe-media">
      <RecipePhoto key={current.id} src={current.url} alt={`Foto de ${alt}`} variant="hero" eager web={!!current.web} />
      {current.web && <PhotoCredit web={current.web} />}
      {photos.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Fotos da receita">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Ver a foto ${i + 1} de ${photos.length}`}
              onClick={() => setIndex(i)}
              className={cn(
                "shrink-0 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                i === index ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100",
              )}
            >
              <RecipePhoto src={p.url} variant="thumb" eager web={!!p.web} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Selo curto "Fora do prazo" (receita enviada depois do encerramento da participação). */
export function LateBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold leading-none text-orange-900 dark:bg-orange-950/40 dark:text-orange-100", className)}>
      Fora do prazo
    </span>
  );
}

/** Aviso para o AUTOR de uma receita fora do prazo: ela fica na campanha, mas não concorre à votação. */
export function LateNote({ className }: { className?: string }) {
  return (
    <p role="note" className={cn("flex items-start gap-2 rounded-2xl bg-orange-50 p-4 text-sm text-orange-900 dark:bg-orange-950/20 dark:text-orange-100", className)}>
      <Clock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>Enviada <strong>fora do prazo</strong>. Ela fica na campanha, mas não concorre à votação.</span>
    </p>
  );
}

const EMPTY = <p className="text-sm italic text-muted-foreground">Não informado</p>;

/**
 * Texto da receita, SEMPRE com as três seções, nesta ordem: Ingredientes, Modo de preparo e História e memória afetiva.
 * Seção sem conteúdo mostra "Não informado" (receitas antigas, sem ingredientes/preparo, continuam coerentes).
 * Usa o MESMO fatiamento do Livro (`bookText.ts`): uma linha = um ingrediente; o preparo vira etapas numeradas.
 * Quantidades como "2.5 xícaras", "30-40 minutos" e "1 - 2 colheres" ficam intactas e as quebras de linha são
 * preservadas; não há corte de tamanho.
 */
export function RecipeText({ story, ingredients, preparation }: { story?: string | null; ingredients?: string | null; preparation?: string | null }) {
  const ing = ingredientItems(ingredients ?? "");
  const { steps, numbered } = preparationSteps(preparation ?? "");
  const paragraphs = storyParagraphs(story ?? "");
  return (
    <div className="space-y-4">
      <Card className={SECTION_CARD}>
        <h3 className={SECTION_TITLE}><ListChecks size={14} aria-hidden="true" /> Ingredientes</h3>
        {ing.length === 0 ? EMPTY : (
          <ul className="space-y-2">
            {ing.map((line, i) => (
              <li key={i} className="flex gap-3 break-words text-sm leading-snug text-foreground">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className={SECTION_CARD}>
        <h3 className={SECTION_TITLE}><ChefHat size={14} aria-hidden="true" /> Modo de preparo</h3>
        {steps.length === 0 ? EMPTY : numbered ? (
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground">
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                <span className="min-w-0 whitespace-pre-line break-words pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">{steps[0]}</p>
        )}
      </Card>

      <Card className={SECTION_CARD}>
        <h3 className={SECTION_TITLE}><Quote size={14} aria-hidden="true" /> História e memória afetiva</h3>
        {paragraphs.length === 0 ? EMPTY : (
          <div className="space-y-3">
            {paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">{p}</p>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
