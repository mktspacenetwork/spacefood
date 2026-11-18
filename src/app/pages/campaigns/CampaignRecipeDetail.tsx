import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { User, Vote } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/skeleton";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { VoteConfirmDialog } from "../../components/campaigns/VoteConfirmDialog";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { useCampaignCtx } from "./CampaignLayout";
import { useAuth } from "../../context/Store";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { RECIPE_DETAIL_TOUR } from "../../lib/campaigns/tours-collab";
import type { RecipeDetail } from "../../lib/campaigns/types";

export function CampaignRecipeDetail() {
  const { campaign, state, refresh, slug } = useCampaignCtx();
  const { user } = useAuth();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voting, setVoting] = useState(false);
  const inflight = useRef(false);
  const api = `/campaigns/${encodeURIComponent(slug)}`;

  const load = useCallback(async (silent = false) => {
    if (!silent) { setError(null); setRecipe(null); }
    try {
      setRecipe(await campaignsApi.get<RecipeDetail>(`${api}/recipes/${encodeURIComponent(id)}`));
    } catch (e) {
      if (!silent) setError({ message: errMsg(e, "Não foi possível carregar a receita."), notFound: e instanceof CampaignApiError && e.status === 404 });
    }
  }, [api, id]);

  useEffect(() => { void load(); }, [load]);

  const photo = useMemo(() => {
    const list = (recipe?.media ?? []).filter((m) => m.kind !== "video" && m.url);
    return list.find((m) => m.kind === "main_photo") ?? list[0];
  }, [recipe]);

  // Chave por tela (não por receita): vista em uma receita, não abre sozinha nas outras.
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "recipe", campaign.id, state.tour?.version),
    enabled: !!state.tour?.enabled && !!user && !!recipe && !error,
  });

  const vote = async () => {
    if (!recipe || inflight.current) return;
    inflight.current = true;
    setVoting(true);
    try {
      await campaignsApi.post(`${api}/votes`, { submission_id: recipe.id, confirm: true });
      toast.success("Voto registrado!");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setConfirmOpen(false);
      inflight.current = false;
      setVoting(false);
      await Promise.all([load(true), refresh()]);
    }
  };

  const back = (
    <Button variant="outline" size="sm" className="h-11 rounded-xl px-4" onClick={() => navigate(`/campanhas/${slug}/receitas`)}>
      Ver receitas
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
        <Skeleton className="h-14 w-full rounded-2xl" />
        <span className="sr-only">Carregando receita…</span>
      </div>
    );
  }

  const ingredients = (recipe.ingredients ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const preparation = (recipe.preparation ?? "").trim();

  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex justify-end"><TourButton onClick={tour.start} /></div>

      {photo && (
        <div className="overflow-hidden rounded-3xl bg-muted" data-tutorial="camp-recipe-media">
          <img src={photo.url} alt={`Foto de ${recipe.dish_name}`} className="aspect-[4/3] w-full object-cover" />
        </div>
      )}

      <header className="space-y-1">
        <h2 className="text-2xl font-bold leading-tight text-foreground">{recipe.dish_name}</h2>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <User size={14} aria-hidden="true" />
          {recipe.mine ? "Você" : recipe.author}
        </p>
      </header>

      {recipe.description?.trim() && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">História e memória afetiva</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{recipe.description}</p>
        </section>
      )}

      {/* Receitas antigas podem ter ingredientes e preparo; as novas não pedem esses campos (nada aparece vazio). */}
      {ingredients.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ingredientes</h3>
          <ul className="space-y-1.5">
            {ingredients.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-foreground">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {preparation && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Modo de preparo</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{preparation}</p>
        </section>
      )}

      {recipe.can_vote && (
        <div className="sticky bottom-[4.75rem] z-10 -mx-4 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-2 pt-4 md:bottom-4 md:mx-0 md:px-0">
          <Button size="lg" data-tutorial="camp-recipe-vote" onClick={() => setConfirmOpen(true)} disabled={voting} className="h-14 w-full gap-2 rounded-2xl text-base font-bold">
            <Vote size={18} aria-hidden="true" /> Votar nesta receita
          </Button>
        </div>
      )}

      <VoteConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} dishName={recipe.dish_name} loading={voting} onConfirm={() => void vote()} />

      <CampaignTour steps={RECIPE_DETAIL_TOUR} tour={tour} />
    </motion.article>
  );
}
