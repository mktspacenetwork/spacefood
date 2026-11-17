import { Link } from "react-router";
import { UtensilsCrossed, User } from "lucide-react";
import { Card } from "../ui/Card";
import type { RecipeListItem } from "../../lib/campaigns/types";

/** Cartão da galeria de receitas (2 colunas no celular). */
export function RecipeCard({ recipe, to, first }: { recipe: RecipeListItem; to: string; first?: boolean }) {
  return (
    <Link
      to={to}
      data-tutorial={first ? "camp-recipe-card" : undefined}
      aria-label={`Ver a receita ${recipe.dish_name}, de ${recipe.author}`}
      className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full overflow-hidden rounded-2xl transition-all group-active:scale-[0.98]">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {recipe.photo_url ? (
            <img src={recipe.photo_url} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-100 to-amber-100 text-orange-400 dark:from-orange-950/40 dark:to-amber-950/30">
              <UtensilsCrossed size={30} aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="space-y-1 p-3">
          <p className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{recipe.dish_name}</p>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <User size={11} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{recipe.author}</span>
          </p>
        </div>
      </Card>
    </Link>
  );
}
