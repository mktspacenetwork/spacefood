import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ChefHat, ListChecks, NotebookPen, User, Vote } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/skeleton";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "../../components/ui/carousel";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { RECIPE_DETAIL_TOUR } from "../../lib/campaigns/tours-collab";
import type { RecipeDetail } from "../../lib/campaigns/types";

export function CampaignRecipeDetail() {
  const { campaign, state, slug } = useCampaignCtx();
  const { user } = useAuth();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRecipe(null);
    try {
      setRecipe(await campaignsApi.get<RecipeDetail>(`/campaigns/${encodeURIComponent(slug)}/recipes/${encodeURIComponent(id)}`));
    } catch (e) {
      setError({ message: errMsg(e, "Não foi possível carregar a receita."), notFound: e instanceof CampaignApiError && e.status === 404 });
    }
  }, [slug, id]);

  useEffect(() => { void load(); }, [load]);

  const photos = useMemo(() => {
    const list = (recipe?.media ?? []).filter((m) => m.kind !== "video" && m.url);
    return [...list.filter((m) => m.kind === "main_photo"), ...list.filter((m) => m.kind === "photo")];
  }, [recipe]);
  const video = useMemo(() => (recipe?.media ?? []).find((m) => m.kind === "video" && m.url), [recipe]);

  // Chave por tela (não por receita): vista em uma receita, não abre sozinha nas outras.
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "recipe", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user && !!recipe && !error,
  });

  const back = (
    <Button variant="outline" size="sm" className="h-11 rounded-xl px-4" onClick={() => navigate(`/campanhas/${slug}/receitas`)}>
      Ver todas as receitas
    </Button>
  );

  if (error) {
    return (
      <ErrorState title={error.notFound ? "Receita não encontrada" : "Não foi possível carregar"} message={error.message} onRetry={error.notFound ? undefined : () => void load()}>
        {back}
      </ErrorState>
    );
  }

  if (!recipe) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-24 w-full rounded-3xl" />
        <span className="sr-only">Carregando receita…</span>
      </div>
    );
  }

  const ingredients = recipe.ingredients.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex justify-end">
        <TourButton onClick={tour.start} />
      </div>

      {photos.length > 0 && (
        <Carousel opts={{ loop: photos.length > 1 }} className="w-full" aria-label="Fotos da receita" data-tutorial="camp-recipe-media">
          <CarouselContent>
            {photos.map((p, i) => (
              <CarouselItem key={p.id}>
                <div className="overflow-hidden rounded-3xl bg-muted">
                  <img
                    src={p.url}
                    alt={`${recipe.dish_name} — foto ${i + 1} de ${photos.length}`}
                    loading={i === 0 ? "eager" : "lazy"}
                    className="aspect-[4/3] w-full object-cover"
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          {photos.length > 1 && (
            <>
              <CarouselPrevious className="left-2 h-11 w-11" aria-label="Foto anterior" />
              <CarouselNext className="right-2 h-11 w-11" aria-label="Próxima foto" />
            </>
          )}
        </Carousel>
      )}

      {video && (
        <div className="overflow-hidden rounded-3xl bg-black" data-tutorial={photos.length === 0 ? "camp-recipe-media" : undefined}>
          <video
            src={video.url}
            poster={photos[0]?.url}
            controls
            preload="metadata"
            playsInline
            className="aspect-video w-full bg-black"
            aria-label={`Vídeo da receita ${recipe.dish_name}`}
          />
        </div>
      )}

      <header className="space-y-1">
        <h2 className="text-2xl font-bold leading-tight text-foreground">{recipe.dish_name}</h2>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <User size={14} aria-hidden="true" />
          {recipe.mine ? "Você" : recipe.author}
        </p>
      </header>

      {recipe.can_vote && (
        <Button size="lg" data-tutorial="camp-recipe-vote" onClick={() => navigate(`/campanhas/${slug}/votacao`)} className="h-14 w-full gap-2 rounded-2xl text-base font-bold">
          <Vote size={18} aria-hidden="true" />
          Votar nesta receita
        </Button>
      )}

      <Card className="rounded-3xl p-5 hover:shadow-sm">
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <ChefHat size={14} className="text-primary" aria-hidden="true" />
          Sobre o prato
        </p>
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{recipe.description}</p>
      </Card>

      <Card className="rounded-3xl p-5 hover:shadow-sm" data-tutorial="camp-recipe-ingredients">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <ListChecks size={14} className="text-primary" aria-hidden="true" />
          Ingredientes
        </p>
        <ul className="space-y-2">
          {ingredients.map((line, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-foreground">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="rounded-3xl p-5 hover:shadow-sm">
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <NotebookPen size={14} className="text-primary" aria-hidden="true" />
          Modo de preparo
        </p>
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{recipe.preparation}</p>
      </Card>

      <CampaignTour steps={RECIPE_DETAIL_TOUR} tour={tour} />
    </motion.article>
  );
}
