import { RecipeTile, type RecipeLayout } from "./RecipeView";
import type { RecipeListItem } from "../../lib/campaigns/types";

/** Receita aprovada da galeria (cartão de 2 colunas no celular, ou linha de lista). */
export function RecipeCard({
  recipe, to, first, layout = "cards",
}: { recipe: RecipeListItem; to: string; first?: boolean; layout?: RecipeLayout }) {
  return (
    <RecipeTile
      layout={layout}
      title={recipe.dish_name}
      subtitle={recipe.author}
      photoUrl={recipe.photo_url}
      to={to}
      first={first}
      ariaLabel={`Ver a receita ${recipe.dish_name}, de ${recipe.author}`}
    />
  );
}
