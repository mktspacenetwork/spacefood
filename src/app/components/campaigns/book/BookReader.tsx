import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { cn } from "../../../lib/utils";
import { RecipePhoto } from "../RecipePhoto";
import { describeBook, ingredientItems, preparationSteps, recipeCampaign, storyParagraphs } from "../../../lib/campaigns/bookText";
import type { AnyBook } from "../../../lib/campaigns/bookText";
import { plural } from "../../../lib/campaigns/format";
import type { BookRecipe } from "../../../lib/campaigns/types";

/**
 * Leitor do Livro de Receitas (colaborador e prévia do administrador).
 *
 * Página 0 = capa + sumário; páginas 1..N = uma receita cada. Pensado para o celular: uma receita por tela,
 * botões grandes, deslizar para os lados e setas do teclado. Na impressão (Ctrl+P) todas as páginas saem,
 * uma receita por folha, sem os botões. O texto das receitas nunca é cortado.
 */
export function BookReader({ book, className, initialPage = 0 }: { book: AnyBook; className?: string; initialPage?: number }) {
  const total = book.recipes.length;
  const [page, setPage] = useState(() => Math.min(Math.max(initialPage, 0), total));
  const topRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback(
    (p: number) => {
      setPage(Math.min(Math.max(p, 0), total));
      // volta ao começo da página nova (a rolagem pode estar no fim da anterior)
      requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
    },
    [total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowRight") go(page + 1);
      else if (e.key === "ArrowLeft") go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, page]);

  return (
    <div
      ref={topRef}
      className={cn("book-reader scroll-mt-20 space-y-5", className)}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = t.x - e.changedTouches[0].clientX;
        const dy = t.y - e.changedTouches[0].clientY;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) go(page + (dx > 0 ? 1 : -1));
      }}
    >
      <style>{`@media print{.book-reader .book-page{display:block!important;break-after:page;page-break-after:always}.book-reader .book-nav{display:none!important}.book-reader .book-page:last-child{break-after:auto}}`}</style>

      <section className={cn("book-page", page === 0 ? "block" : "hidden")} aria-hidden={page !== 0}>
        <Cover book={book} />
        <Summary recipes={book.recipes} onOpen={(i) => go(i + 1)} />
      </section>

      {book.recipes.map((r, i) => (
        <section key={r.id} className={cn("book-page", page === i + 1 ? "block" : "hidden")} aria-hidden={page !== i + 1}>
          <RecipePage recipe={r} index={i} total={total} />
        </section>
      ))}

      <nav className="book-nav flex items-center gap-2" aria-label="Navegação do livro">
        {page === 0 ? (
          total > 0 ? (
            <button type="button" onClick={() => go(1)} className="btn-book-primary">
              Começar a ler <ChevronRight size={18} aria-hidden="true" />
            </button>
          ) : null
        ) : (
          <>
            <button type="button" onClick={() => go(page - 1)} className="btn-book" aria-label={page === 1 ? "Voltar para a capa" : "Receita anterior"}>
              <ChevronLeft size={18} aria-hidden="true" />
              <span className="hidden sm:inline">{page === 1 ? "Capa" : "Anterior"}</span>
            </button>
            <button type="button" onClick={() => go(0)} className="btn-book" aria-label="Ir para o sumário">
              <List size={18} aria-hidden="true" />
              <span className="hidden sm:inline">Sumário</span>
            </button>
            <span className="min-w-[3.5rem] text-center text-xs font-semibold tabular-nums text-muted-foreground" aria-live="polite">
              {page} / {total}
            </span>
            <button
              type="button"
              onClick={() => go(page + 1)}
              disabled={page >= total}
              className="btn-book-primary ml-auto"
              aria-label="Próxima receita"
            >
              Próxima <ChevronRight size={18} aria-hidden="true" />
            </button>
          </>
        )}
      </nav>
      <ReaderButtonStyles />
    </div>
  );
}

/** Estilos dos botões do leitor (tamanho de toque ≥ 44 px) num lugar só. */
function ReaderButtonStyles() {
  return (
    <style>{`
      .book-reader .btn-book,.book-reader .btn-book-primary{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-height:48px;padding:0 1rem;border-radius:1rem;font-size:.875rem;font-weight:700;transition:transform .12s, background-color .12s}
      .book-reader .btn-book{border:1px solid var(--border);background:var(--background);color:var(--foreground)}
      .book-reader .btn-book:hover{background:var(--accent)}
      .book-reader .btn-book-primary{background:var(--primary);color:var(--primary-foreground)}
      .book-reader .btn-book-primary:hover{filter:brightness(1.05)}
      .book-reader .btn-book-primary:disabled{opacity:.5;pointer-events:none}
      .book-reader .btn-book:active,.book-reader .btn-book-primary:active{transform:scale(.97)}
      .book-reader button:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
    `}</style>
  );
}

// ───────────────────────────── Capa e sumário ─────────────────────────────

function Cover({ book }: { book: AnyBook }) {
  const n = book.recipes.length;
  const info = describeBook(book);
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-orange-700 to-orange-800 text-white shadow-lg">
      {info.coverUrl && (
        <img
          src={info.coverUrl}
          alt=""
          className="aspect-[2/1] w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div className="px-6 py-10 text-center sm:py-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-white/85">SpaceFood</p>
        <div className="mx-auto my-5 h-px w-14 bg-white/50" aria-hidden="true" />
        <h2 className="font-serif text-3xl font-bold leading-tight [overflow-wrap:anywhere] sm:text-4xl">{info.title}</h2>
        <p className="mt-3 font-serif text-lg italic text-white/90">{info.subtitle}</p>
        <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-white/85">
          {plural(n, "receita", "receitas")}
        </p>
      </div>
    </div>
  );
}

function Summary({ recipes, onOpen }: { recipes: BookRecipe[]; onOpen: (index: number) => void }) {
  if (recipes.length === 0) {
    return <p className="mt-5 text-center text-sm text-muted-foreground">Este livro ainda não tem receitas.</p>;
  }
  return (
    <nav aria-label="Sumário" className="mt-6">
      <h3 className="mb-1 font-serif text-xl font-bold text-foreground">Sumário</h3>
      <ol className="divide-y divide-border/70">
        {recipes.map((r, i) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(i)}
              className="flex min-h-[56px] w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="w-8 shrink-0 text-sm font-bold tabular-nums text-primary">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-[15px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{r.dish_name}</span>
                <span className="block truncate text-xs text-muted-foreground">por {r.author}</span>
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ──────────────────────────────── Receita ────────────────────────────────

function RecipePage({ recipe, index, total }: { recipe: BookRecipe; index: number; total: number }) {
  const [sel, setSel] = useState(0);
  const photos = recipe.photos.filter((p) => p.url);
  const current = photos[Math.min(sel, Math.max(photos.length - 1, 0))];
  const story = storyParagraphs(recipe.story);
  const ingredients = ingredientItems(recipe.ingredients);
  const { steps, numbered } = preparationSteps(recipe.preparation);
  const campaign = recipeCampaign(recipe);

  return (
    <article aria-labelledby={`livro-r-${recipe.id}`} className="space-y-6">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
          Receita {String(index + 1).padStart(2, "0")} de {String(total).padStart(2, "0")}
        </p>
        <h2 id={`livro-r-${recipe.id}`} className="mt-2 font-serif text-[26px] font-bold leading-tight text-foreground [overflow-wrap:anywhere] sm:text-3xl">
          {recipe.dish_name}
        </h2>
        <p className="mt-1.5 font-serif text-sm italic text-muted-foreground">por {recipe.author}</p>
        {campaign && <p className="mt-1 text-xs font-semibold text-muted-foreground">Campanha: {campaign}</p>}
      </header>

      {current && (
        <figure className="space-y-2">
          {/* Padrão único da plataforma: 4:3, centralizada, com esqueleto enquanto carrega (mesma peça das campanhas) */}
          <RecipePhoto src={current.url} alt={`Foto da receita ${recipe.dish_name}`} variant="hero" className="shadow-sm" />
          {photos.length > 1 && (
            <div className="book-nav flex justify-center gap-2 overflow-x-auto pb-1" role="group" aria-label="Fotos da receita">
              {photos.map((p, i) => (
                <button
                  key={p.url}
                  type="button"
                  onClick={() => setSel(i)}
                  aria-pressed={photos[Math.min(sel, photos.length - 1)] === p}
                  aria-label={`Foto ${i + 1} de ${photos.length}`}
                  className={cn(
                    "shrink-0 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    photos[Math.min(sel, photos.length - 1)] === p ? "border-primary" : "border-transparent opacity-70",
                  )}
                >
                  <RecipePhoto src={p.url} variant="thumb" className="rounded-[10px]" />
                </button>
              ))}
            </div>
          )}
        </figure>
      )}

      {story.length > 0 && (
        <section aria-label="História e memória afetiva" className="border-l-4 border-primary/70 pl-4">
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">História e memória afetiva</h3>
          <div className="space-y-3 font-serif text-base italic leading-7 text-foreground/90">
            {story.map((p, i) => (
              <p key={i} className="whitespace-pre-line [overflow-wrap:anywhere]">{p}</p>
            ))}
          </div>
        </section>
      )}

      {ingredients.length > 0 && (
        <section aria-label="Ingredientes">
          <h3 className="mb-3 border-b border-border pb-2 font-serif text-xl font-bold text-foreground">Ingredientes</h3>
          <ul className="space-y-2.5">
            {ingredients.map((it, i) => (
              <li key={i} className="flex gap-3 text-base leading-relaxed text-foreground">
                <span aria-hidden="true" className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{it}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {steps.length > 0 && (
        <section aria-label="Modo de preparo">
          <h3 className="mb-3 border-b border-border pb-2 font-serif text-xl font-bold text-foreground">Modo de preparo</h3>
          {numbered ? (
            <ol className="space-y-5">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <p className="min-w-0 flex-1 whitespace-pre-line text-base leading-7 text-foreground [overflow-wrap:anywhere]">
                    <span className="sr-only">Passo {i + 1}: </span>
                    {s}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="whitespace-pre-line text-base leading-7 text-foreground [overflow-wrap:anywhere]">{steps[0]}</p>
          )}
        </section>
      )}

      {ingredients.length === 0 && steps.length === 0 && story.length === 0 && (
        <p className="text-sm text-muted-foreground">Esta receita não tem texto cadastrado.</p>
      )}
    </article>
  );
}
