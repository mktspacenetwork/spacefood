import { Link } from "react-router";
import { BookOpen, Megaphone } from "lucide-react";
import { cn } from "../../../lib/utils";

export type SectionKey = "campaigns" | "book";

/**
 * Abas da área "Campanhas": Campanhas | Livro de Receitas. São duas rotas (a aba muda a URL), por isso são links, não `Tabs`.
 * A aba do Livro só existe para quem pode revisar ou publicar (mesma regra que antes liberava o item do menu);
 * sem ela não há o que alternar e a barra some.
 */
export function SectionNav({ active, showBook }: { active: SectionKey; showBook: boolean }) {
  if (!showBook) return null;
  const items: { key: SectionKey; label: string; to: string; icon: typeof Megaphone }[] = [
    { key: "campaigns", label: "Campanhas", to: "/admin/campaigns", icon: Megaphone },
    { key: "book", label: "Livro de Receitas", to: "/admin/campaigns/livro", icon: BookOpen },
  ];
  return (
    <nav aria-label="Áreas de Campanhas" data-tutorial="camp-section-nav" className="grid w-full grid-cols-2 gap-1 rounded-2xl bg-muted p-1 sm:inline-grid sm:w-fit">
      {items.map(({ key, label, to, icon: Icon }) => {
        const on = key === active;
        return (
          <Link
            key={key}
            to={to}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-transparent px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-5",
              on
                ? "border-primary/30 bg-primary/10 text-primary shadow-sm dark:bg-primary/15"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon size={16} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
