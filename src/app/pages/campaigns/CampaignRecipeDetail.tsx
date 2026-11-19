import { useNavigate, useParams } from "react-router";
import { User, Vote } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { VoteConfirmDialog } from "../../components/campaigns/VoteConfirmDialog";
import { RecipeDetailBody, RecipeDetailSkeleton, useRecipeDetail, useRecipeVote } from "../../components/campaigns/RecipeSheet";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { RECIPE_DETAIL_TOUR } from "../../lib/campaigns/tours-collab";

/**
 * Receita aprovada em tela cheia (`/campanhas/:slug/receitas/:id`): endereço direto/compartilhável, e destino de
 * "Ver a receita completa" no resultado. Mostra exatamente o mesmo conteúdo da folha (`RecipeDetailBody`).
 */
export function CampaignRecipeDetail() {
  const { campaign, state, refresh, slug } = useCampaignCtx();
  const { user } = useAuth();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { recipe, error, reload } = useRecipeDetail(slug, id);
  const v = useRecipeVote(slug, recipe, async () => { await Promise.all([reload(true), refresh()]); });

  // Chave por tela (não por receita): vista em uma receita, não abre sozinha nas outras.
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "recipe", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user && !!recipe && !error,
  });

  const back = (
    <Button variant="outline" size="sm" className="h-11 rounded-xl px-4" onClick={() => navigate(`/campanhas/${slug}/receitas`)}>
      Ver receitas
    </Button>
  );

  if (error) {
    return (
      <ErrorState title={error.notFound ? "Receita não encontrada" : "Não foi possível carregar"} message={error.message} onRetry={error.notFound ? undefined : () => void reload()}>
        {back}
      </ErrorState>
    );
  }

  if (!recipe) return <RecipeDetailSkeleton />;

  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex justify-end"><TourButton onClick={tour.start} /></div>

      <RecipeDetailBody
        recipe={recipe}
        heading={
          <header className="space-y-1">
            <h2 className="text-2xl font-bold leading-tight text-foreground">{recipe.dish_name}</h2>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <User size={14} aria-hidden="true" />
              {recipe.mine ? "Você" : recipe.author}
            </p>
          </header>
        }
      />

      {recipe.can_vote && (
        <div className="sticky bottom-[4.75rem] z-10 -mx-4 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-2 pt-4 md:bottom-4 md:mx-0 md:px-0">
          <Button size="lg" data-tutorial="camp-recipe-vote" onClick={() => v.setConfirmOpen(true)} disabled={v.voting} className="h-14 w-full gap-2 rounded-2xl text-base font-bold">
            <Vote size={18} aria-hidden="true" /> Votar nesta receita
          </Button>
        </div>
      )}

      <VoteConfirmDialog open={v.confirmOpen} onOpenChange={v.setConfirmOpen} dishName={recipe.dish_name} loading={v.voting} onConfirm={() => void v.vote()} />

      <CampaignTour steps={RECIPE_DETAIL_TOUR} tour={tour} />
    </motion.article>
  );
}
