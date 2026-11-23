import { useRef } from "react";
import { BookOpen, Eye, MoreHorizontal, Search, Trash2, Undo2 } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";
import { EmptyBox } from "../campaigns/shared";
import type { AdminBookItem } from "../../../lib/campaigns/types";

/** Um controle só: os próprios números do livro são as abas (cada uma mostra a lista correspondente logo abaixo). */
export type BookFilter = "in_book" | "campaign" | "manual" | "removed";

export const BOOK_FILTERS: { key: BookFilter; label: string }[] = [
  { key: "in_book", label: "No Livro de Receitas" },
  { key: "campaign", label: "De campanhas" },
  { key: "manual", label: "Manuais" },
  { key: "removed", label: "Removidos" },
];

/** Mesmas regras dos números do servidor: "De campanhas" e "Manuais" contam só as que estão no livro; as retiradas ficam em "Removidas". */
export function matchesBookFilter(f: BookFilter, it: AdminBookItem): boolean {
  switch (f) {
    case "in_book": return it.status === "in_book";
    case "campaign": return it.source === "campaign" && it.status === "in_book";
    case "manual": return it.source === "manual" && it.status === "in_book";
    case "removed": return it.status === "removed";
  }
}

export function countByBookFilter(items: AdminBookItem[]): Record<BookFilter, number> {
  const out: Record<BookFilter, number> = { in_book: 0, campaign: 0, manual: 0, removed: 0 };
  for (const it of items) for (const f of BOOK_FILTERS) if (matchesBookFilter(f.key, it)) out[f.key]++;
  return out;
}

/** Texto curto para quando a aba (ou a busca) não tem nada. */
function emptyCopy(filter: BookFilter, searching: boolean, total: number): { title: string; hint?: string } {
  if (searching) return { title: "Nenhuma receita encontrada", hint: "Mude a busca." };
  if (total === 0) return { title: "O Livro de Receitas ainda não tem receitas", hint: "Receitas aprovadas entram sozinhas. Você também pode adicionar uma." };
  switch (filter) {
    case "in_book": return { title: "Nenhuma receita no Livro de Receitas", hint: "Receitas aprovadas entram sozinhas. Você também pode adicionar uma." };
    case "campaign": return { title: "Nenhuma receita de campanha no Livro de Receitas" };
    case "manual": return { title: "Nenhuma receita manual", hint: "Use “Adicionar receita” para cadastrar." };
    case "removed": return { title: "Nenhuma receita removida" };
  }
}

const CHIP = "inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-[11px] font-medium";

/** Origem e situação em selos curtos. O selo que repetiria o nome da aba aberta ("Manual", "Removida") não aparece. */
export function BookBadges({ it, hide }: { it: AdminBookItem; hide?: BookFilter }) {
  return (
    <span className="mt-1.5 flex flex-wrap gap-1">
      {it.source === "manual" ? (
        hide !== "manual" && (
          <span className={cn(CHIP, "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300")}>Manual</span>
        )
      ) : (
        <span className={cn(CHIP, "max-w-[12rem] border-border bg-muted text-muted-foreground")}>Campanha: {it.campaign_name ?? "—"}</span>
      )}
      {it.source === "campaign" && it.via && (
        <span className={cn(CHIP, "border-border bg-card text-muted-foreground")}>{it.via === "auto" ? "Automática" : "Adicionada"}</span>
      )}
      {it.edited && (
        <span className={cn(CHIP, "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200")}>Editada</span>
      )}
      {it.status === "removed" && hide !== "removed" && (
        <span className={cn(CHIP, "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300")}>Removida</span>
      )}
    </span>
  );
}

export function Thumb({ url, className }: { url: string | null; className?: string }) {
  return (
    <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground", className)}>
      {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <BookOpen size={20} aria-hidden="true" />}
    </span>
  );
}

type Props = {
  /** Já filtradas pela aba e pela busca. */
  items: AdminBookItem[];
  /** Todas as receitas do livro (para os números das abas e para o texto de "vazio"). */
  total: number;
  counts: Record<BookFilter, number>;
  filter: BookFilter;
  onFilter: (f: BookFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  canManage: boolean;
  busy: string | null;
  onOpen: (ref: string) => void;
  onRemove: (it: AdminBookItem) => void;
  onRestore: (it: AdminBookItem) => void;
};

export function BookRows({ items, total, counts, filter, onFilter, query, onQuery, canManage, busy, onOpen, onRemove, onRestore }: Props) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const empty = emptyCopy(filter, query.trim() !== "", total);
  // Setas ← → trocam de aba (padrão de abas); Home/End vão às pontas.
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const last = BOOK_FILTERS.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onFilter(BOOK_FILTERS[next].key);
    tabRefs.current[BOOK_FILTERS[next].key]?.focus();
  };
  return (
    <div className="space-y-3" data-tutorial="camp-book-list">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Receitas do Livro de Receitas">
        {BOOK_FILTERS.map((f, i) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              ref={(el) => { tabRefs.current[f.key] = el; }}
              type="button"
              role="tab"
              id={`book-tab-${f.key}`}
              aria-selected={on}
              aria-controls="book-tabpanel"
              tabIndex={on ? 0 : -1}
              onClick={() => onFilter(f.key)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cn(
                "flex min-h-[4.25rem] flex-col items-start justify-center gap-0.5 rounded-2xl border px-4 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on
                  ? "border-primary bg-primary/10 text-foreground shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className={cn("text-[10px] font-bold uppercase leading-tight tracking-wider", on ? "text-primary" : "text-muted-foreground")}>{f.label}</span>
              <span className="text-2xl font-bold tabular-nums leading-none text-foreground">{counts[f.key]}</span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar por nome, autor ou campanha"
          aria-label="Buscar no Livro de Receitas"
          className="h-11 rounded-xl pl-9"
        />
      </div>

      <div role="tabpanel" id="book-tabpanel" aria-labelledby={`book-tab-${filter}`} className="space-y-3">
      {items.length === 0 ? (
        <EmptyBox icon={<BookOpen size={36} />} title={empty.title} hint={empty.hint} />
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.ref} className={cn("flex items-center gap-2 rounded-2xl border border-border bg-card p-2.5 pr-1.5", it.status === "removed" && "opacity-75")}>
              <button
                type="button"
                onClick={() => onOpen(it.ref)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-0.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Thumb url={it.photo_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{it.dish_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{it.source === "manual" ? it.author : `por ${it.author}`}</span>
                  <BookBadges it={it} hide={filter} />
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl" aria-label={`Ações de ${it.dish_name}`} disabled={busy !== null}>
                    <MoreHorizontal size={18} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => onOpen(it.ref)} className="cursor-pointer gap-2">
                    <Eye size={14} /> {canManage ? "Ver e editar" : "Ver detalhes"}
                  </DropdownMenuItem>
                  {canManage && it.status === "in_book" && (
                    <DropdownMenuItem onSelect={() => onRemove(it)} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                      <Trash2 size={14} /> Remover do Livro de Receitas
                    </DropdownMenuItem>
                  )}
                  {canManage && it.status === "removed" && (
                    <DropdownMenuItem onSelect={() => onRestore(it)} className="cursor-pointer gap-2">
                      <Undo2 size={14} /> Readicionar ao Livro de Receitas
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
