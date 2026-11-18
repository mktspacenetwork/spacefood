import { BookOpen, Eye, MoreHorizontal, Search, Trash2, Undo2 } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";
import { EmptyBox } from "../campaigns/shared";
import type { AdminBookItem } from "../../../lib/campaigns/types";

export type BookFilter = "all" | "in_book" | "removed" | "manual";

const FILTERS: { key: BookFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "in_book", label: "No livro" },
  { key: "removed", label: "Removidas" },
  { key: "manual", label: "Manuais" },
];

export function matchesBookFilter(f: BookFilter, it: AdminBookItem): boolean {
  switch (f) {
    case "all": return true;
    case "in_book": return it.status === "in_book";
    case "removed": return it.status === "removed";
    case "manual": return it.source === "manual";
  }
}

const CHIP = "inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-[11px] font-medium";

/** Origem e situação em selos curtos (a lista é única: a mesma receita nunca aparece duas vezes). */
export function BookBadges({ it }: { it: AdminBookItem }) {
  return (
    <span className="mt-1.5 flex flex-wrap gap-1">
      {it.source === "manual" ? (
        <span className={cn(CHIP, "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300")}>Manual</span>
      ) : (
        <span className={cn(CHIP, "max-w-[12rem] border-border bg-muted text-muted-foreground")}>Campanha: {it.campaign_name ?? "—"}</span>
      )}
      {it.source === "campaign" && it.via && (
        <span className={cn(CHIP, "border-border bg-card text-muted-foreground")}>{it.via === "auto" ? "Automática" : "Adicionada"}</span>
      )}
      {it.edited && (
        <span className={cn(CHIP, "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200")}>Editada</span>
      )}
      {it.status === "removed" && (
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
  items: AdminBookItem[];
  total: number;
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

export function BookRows({ items, total, filter, onFilter, query, onQuery, canManage, busy, onOpen, onRemove, onRestore }: Props) {
  return (
    <div className="space-y-3" data-tutorial="camp-book-list">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar receitas do livro">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => onFilter(f.key)}
              className={cn(
                "inline-flex h-10 items-center rounded-xl border px-3.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar por nome, autor ou campanha"
            aria-label="Buscar no livro"
            className="h-11 rounded-xl pl-9"
          />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyBox
          icon={<BookOpen size={36} />}
          title={total === 0 ? "O livro ainda não tem receitas" : "Nenhuma receita encontrada"}
          hint={total === 0 ? "Receitas aprovadas entram sozinhas. Você também pode adicionar uma." : "Mude o filtro ou a busca."}
        />
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
                  <BookBadges it={it} />
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
                      <Trash2 size={14} /> Remover do livro
                    </DropdownMenuItem>
                  )}
                  {canManage && it.status === "removed" && (
                    <DropdownMenuItem onSelect={() => onRestore(it)} className="cursor-pointer gap-2">
                      <Undo2 size={14} /> Readicionar ao livro
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
