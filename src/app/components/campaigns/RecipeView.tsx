import { useCallback, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { LayoutGrid, List, User } from "lucide-react";
import { Card } from "../ui/Card";
import { RecipePhoto } from "./RecipePhoto";
import { cn } from "../../lib/utils";
import type { SubmissionStatus } from "../../lib/campaigns/types";

export type RecipeLayout = "cards" | "list";

const STORAGE_KEY = "spacefood_camp_recipe_view";

/** Cards ou lista: a preferência fica guardada no aparelho e vale para "Receitas" e "Minhas receitas". */
export function useRecipeView(): [RecipeLayout, (v: RecipeLayout) => void] {
  const [view, setView] = useState<RecipeLayout>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "list" ? "list" : "cards"; } catch { return "cards"; }
  });
  const change = useCallback((v: RecipeLayout) => {
    setView(v);
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* sem armazenamento: vale só nesta visita */ }
  }, []);
  return [view, change];
}

/** Alternância Cards | Lista (alvos de toque de 44 px). */
export function RecipeViewToggle({ view, onChange }: { view: RecipeLayout; onChange: (v: RecipeLayout) => void }) {
  const opt = (value: RecipeLayout, label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => onChange(value)}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        view === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Modo de exibição" data-tutorial="camp-view-toggle" className="inline-flex rounded-xl bg-muted p-0.5">
      {opt("cards", "Cards", <LayoutGrid size={14} aria-hidden="true" />)}
      {opt("list", "Lista", <List size={14} aria-hidden="true" />)}
    </div>
  );
}

const STATUS_MINI: Record<SubmissionStatus, { text: string; className: string }> = {
  pending_media: { text: "Falta a foto", className: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-100" },
  submitted: { text: "Em análise", className: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-100" },
  in_review: { text: "Em análise", className: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-100" },
  approved: { text: "Aprovada", className: "bg-green-100 text-green-900 dark:bg-green-950/40 dark:text-green-100" },
  rejected: { text: "Não aprovada", className: "bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-100" },
};

/** Selo curto da situação da receita (usado em "Minhas receitas"). */
export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const s = STATUS_MINI[status] ?? STATUS_MINI.submitted;
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold leading-none", s.className)}>{s.text}</span>;
}

type TileProps = {
  layout: RecipeLayout;
  title: string;
  /** Linha secundária: autor ("Enviada por você" em Minhas receitas). */
  subtitle: string;
  photoUrl: string | null;
  /** A foto veio da internet: selo discreto "Foto da internet" (só o ícone na lista). */
  photoWeb?: boolean;
  badge?: ReactNode;
  /** Abre outra tela… */
  to?: string;
  /** …ou executa uma ação (ex.: abrir a receita numa folha). */
  onClick?: () => void;
  first?: boolean;
  ariaLabel: string;
};

/** Receita como cartão (2 colunas no celular) ou como linha de lista (miniatura + nome + autor). */
export function RecipeTile({ layout, title, subtitle, photoUrl, photoWeb, badge, to, onClick, first, ariaLabel }: TileProps) {
  const focus = "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  const inner =
    layout === "cards" ? (
      <Card className="h-full overflow-hidden rounded-2xl transition-all group-active:scale-[0.98]">
        <RecipePhoto src={photoUrl} variant="tile" web={photoWeb}>
          {badge && <span className="absolute left-2 top-2">{badge}</span>}
        </RecipePhoto>
        <div className="space-y-1 p-3">
          <p className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{title}</p>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <User size={11} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{subtitle}</span>
          </p>
        </div>
      </Card>
    ) : (
      <Card className="flex items-center gap-3 rounded-2xl p-2.5 transition-all group-active:scale-[0.99]">
        <RecipePhoto src={photoUrl} variant="row" web={photoWeb} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{title}</p>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <User size={11} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{subtitle}</span>
          </p>
        </div>
        {badge}
      </Card>
    );

  const tutorial = first ? "camp-recipe-card" : undefined;
  if (to) {
    return (
      <Link to={to} data-tutorial={tutorial} aria-label={ariaLabel} className={cn("group block rounded-2xl", focus)}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} data-tutorial={tutorial} aria-label={ariaLabel} className={cn("group block w-full rounded-2xl text-left", focus)}>
      {inner}
    </button>
  );
}
