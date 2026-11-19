import { Link } from "react-router";
import { BookOpen, History as HistoryIcon, Megaphone } from "lucide-react";
import { cn } from "../../../lib/utils";

export type SectionKey = "campaigns" | "book" | "history";

/**
 * Abas da área "Campanhas": Campanhas | Livro de Receitas | Histórico de campanhas. São rotas (a aba muda a URL),
 * por isso são links, não `Tabs`. A aba do Livro só existe para quem pode revisar ou publicar (mesma regra que antes
 * liberava o item do menu); o Histórico aparece para todo mundo que tem acesso a Campanhas. Com menos de duas abas
 * não há o que alternar e a barra some. No celular as abas viram ícone + rótulo curto (o nome completo fica no
 * `aria-label`), para as três caberem em 375 px com alvo de toque ≥ 44 px.
 */
export function SectionNav({ active, showBook, showHistory = true }: { active: SectionKey; showBook: boolean; showHistory?: boolean }) {
  const all: { key: SectionKey; label: string; short: string; to: string; icon: typeof Megaphone; show: boolean }[] = [
    { key: "campaigns", label: "Campanhas", short: "Campanhas", to: "/admin/campaigns", icon: Megaphone, show: true },
    { key: "book", label: "Livro de Receitas", short: "Livro", to: "/admin/campaigns/livro", icon: BookOpen, show: showBook },
    { key: "history", label: "Histórico de campanhas", short: "Histórico", to: "/admin/campaigns/historico", icon: HistoryIcon, show: showHistory },
  ];
  const items = all.filter((i) => i.show);
  if (items.length < 2) return null;
  return (
    <nav aria-label="Áreas de Campanhas" data-tutorial="camp-section-nav" className="flex w-full gap-1 rounded-2xl bg-muted p-1 sm:inline-flex sm:w-fit">
      {items.map(({ key, label, short, to, icon: Icon }) => {
        const on = key === active;
        return (
          <Link
            key={key}
            to={to}
            aria-current={on ? "page" : undefined}
            aria-label={label}
            className={cn(
              "inline-flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border border-transparent px-1.5 py-1.5 text-[11px] font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex-none sm:flex-row sm:gap-2 sm:px-5 sm:py-0 sm:text-sm",
              on
                ? "border-primary/30 bg-primary/10 text-primary shadow-sm dark:bg-primary/15"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon size={16} className="shrink-0" aria-hidden="true" />
            <span className="max-w-full truncate sm:hidden" aria-hidden="true">{short}</span>
            <span className="hidden truncate sm:inline" aria-hidden="true">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
