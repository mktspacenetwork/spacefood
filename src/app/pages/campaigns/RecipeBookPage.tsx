import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { BookOpen, ChevronLeft, LayoutGrid, List as ListIcon, Search } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { BookReader } from "../../components/campaigns/book/BookReader";
import { RecipePhoto } from "../../components/campaigns/RecipePhoto";
import { BookPdfButton, BookPdfStatus } from "../../components/campaigns/book/BookPdfControl";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { useBookPdf } from "../../lib/campaigns/useBookPdf";
import { normText } from "../../lib/campaigns/bookText";
import { plural } from "../../lib/campaigns/format";
import { cn } from "../../lib/utils";
import type { RecipeBookRecipe, RecipeBookView } from "../../lib/campaigns/types";

const VIEW_KEY = "spacefood_book_view";
/** Acima disso o PDF (montado no celular) pode demorar: avisamos antes. */
const BIG_BOOK = 30;

type Mode = { kind: "browse" } | { kind: "read"; page: number };

/**
 * Livro de Receitas (`/campanhas/livro`): acervo único das receitas aprovadas, só quando o administrador publica.
 * Busca por nome, leitura página a página e PDF do livro inteiro montado na hora, no aparelho (nada fica guardado no
 * servidor). O "Baixar PDF" existe na lista E na leitura e usa o mesmo estado (`useBookPdf`).
 */
export function RecipeBookPage() {
  const navigate = useNavigate();
  const [book, setBook] = useState<RecipeBookView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "browse" });
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"cards" | "list">(() => {
    try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards"; } catch { return "cards"; }
  });
  const pdf = useBookPdf(book);

  const load = useCallback(async () => {
    setError(null);
    setUnavailable(false);
    setBook(null);
    try {
      setBook(await campaignsApi.get<RecipeBookView>("/recipe-book"));
    } catch (e) {
      if (e instanceof CampaignApiError && (e.code === "BOOK_UNAVAILABLE" || e.status === 404 || e.status === 403)) setUnavailable(true);
      else setError(errMsg(e, "Não foi possível carregar o Livro de Receitas."));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const changeView = (v: "cards" | "list") => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* sem armazenamento: só não lembra */ }
  };

  const filtered = useMemo(() => {
    if (!book) return [];
    const q = normText(query);
    if (!q) return book.recipes;
    return book.recipes.filter((r) => normText(`${r.dish_name} ${r.author} ${r.campaign_name ?? ""}`).includes(q));
  }, [book, query]);

  const openAt = (r: RecipeBookRecipe) => {
    const idx = book ? book.recipes.findIndex((x) => x.id === r.id) : -1;
    setMode({ kind: "read", page: idx >= 0 ? idx + 1 : 0 });
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const header = (
    <header className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => (mode.kind === "read" ? setMode({ kind: "browse" }) : navigate("/campanhas"))}
        className="h-11 w-11 shrink-0 rounded-full"
        aria-label={mode.kind === "read" ? "Voltar para a lista" : "Voltar para Campanhas"}
      >
        <ChevronLeft size={24} />
      </Button>
      <h1 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-bold text-foreground">
        <BookOpen size={20} className="shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">Livro de Receitas</span>
      </h1>
    </header>
  );

  if (unavailable) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 pt-1">
        {header}
        <EmptyState icon={<BookOpen size={22} aria-hidden="true" />} title="O Livro de Receitas ainda não está disponível" description="Quando for publicado, ele aparece aqui." />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 pt-1">
        {header}
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }
  if (!book) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 pt-1" aria-busy="true" aria-live="polite">
        {header}
        <Skeleton className="h-12 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/5] w-full rounded-2xl" />)}
        </div>
        <span className="sr-only">Carregando o Livro de Receitas…</span>
      </div>
    );
  }

  const total = book.recipes.length;
  if (total === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 pt-1">
        {header}
        <EmptyState icon={<BookOpen size={22} aria-hidden="true" />} title="O Livro de Receitas ainda não tem receitas" description="As receitas aprovadas aparecem aqui." />
      </div>
    );
  }

  if (mode.kind === "read") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 pt-1">
        {header}
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">Quer guardar? Baixe o Livro de Receitas inteiro em PDF.</p>
          <BookPdfButton pdf={pdf} className="shrink-0" />
        </div>
        <BookPdfStatus pdf={pdf} />
        <BookReader key={mode.page} book={book} initialPage={mode.page} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pt-1">
      {header}

      <p className="px-1 text-sm text-muted-foreground">Leia as receitas aqui ou baixe o Livro de Receitas inteiro em PDF, com as fotos.</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-11 flex-1 gap-2 rounded-xl sm:flex-none" onClick={() => setMode({ kind: "read", page: 0 })}>
          <BookOpen size={16} aria-hidden="true" /> Ler o Livro de Receitas
        </Button>
        <BookPdfButton pdf={pdf} className="flex-1 sm:flex-none" />
        <p className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">{plural(total, "receita", "receitas")}</p>
      </div>

      <BookPdfStatus pdf={pdf} />
      {pdf.state.kind === "idle" && total > BIG_BOOK && <p className="text-xs text-muted-foreground">Livro de Receitas grande: o PDF é montado no seu aparelho e pode levar alguns minutos.</p>}

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar receita" aria-label="Buscar receita no Livro de Receitas" className="h-11 rounded-xl pl-9" />
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-xl border border-border" role="group" aria-label="Forma de exibir">
          {([["cards", LayoutGrid, "Cartões"], ["list", ListIcon, "Lista"]] as const).map(([k, Icon, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={view === k}
              aria-label={label}
              onClick={() => changeView(k)}
              className={cn("flex h-11 w-11 items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === k ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent")}
            >
              <Icon size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Search size={22} aria-hidden="true" />} title="Nenhuma receita encontrada" description="Tente outro nome." />
      ) : view === "cards" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => openAt(r)} className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <RecipePhoto src={r.photos[0]?.url} variant="tile" />
                <span className="flex flex-1 flex-col gap-0.5 p-3">
                  <span className="line-clamp-2 font-serif text-[15px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{r.dish_name}</span>
                  <span className="truncate text-xs text-muted-foreground">por {r.author}</span>
                  {r.campaign_name && <span className="truncate text-[11px] text-muted-foreground/80">{r.campaign_name}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => openAt(r)} className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <RecipePhoto src={r.photos[0]?.url} variant="row" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-[15px] font-semibold text-foreground">{r.dish_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">por {r.author}</span>
                  {r.campaign_name && <span className="block truncate text-[11px] text-muted-foreground/80">{r.campaign_name}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
