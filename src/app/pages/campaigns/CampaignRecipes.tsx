import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, Lock } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/skeleton";
import { RecipeCard } from "../../components/campaigns/RecipeCard";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { useCampaignCtx } from "./CampaignLayout";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { plural } from "../../lib/campaigns/format";
import type { RecipeListItem } from "../../lib/campaigns/types";

type Page = { total: number; items: RecipeListItem[] };

export function CampaignRecipes() {
  const { slug } = useCampaignCtx();
  const [items, setItems] = useState<RecipeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [initial, setInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const inflight = useRef(false);
  const itemsRef = useRef<RecipeListItem[]>([]);
  itemsRef.current = items;

  const load = useCallback(
    async (reset: boolean) => {
      if (inflight.current) return;
      inflight.current = true;
      if (reset) { setInitial(true); setError(null); setLocked(false); } else setLoadingMore(true);
      try {
        const offset = reset ? 0 : itemsRef.current.length;
        const r = await campaignsApi.get<Page>(`/campaigns/${encodeURIComponent(slug)}/recipes?offset=${offset}`);
        setTotal(r.total);
        setItems((prev) => {
          const base = reset ? [] : prev;
          const seen = new Set(base.map((x) => x.id));
          return [...base, ...r.items.filter((x) => !seen.has(x.id))];
        });
      } catch (e) {
        if (e instanceof CampaignApiError && e.code === "GALLERY_HIDDEN") setLocked(true);
        else if (reset) setError(errMsg(e, "Não foi possível carregar as receitas."));
        else setError(errMsg(e, "Não foi possível carregar mais receitas."));
      } finally {
        inflight.current = false;
        setInitial(false);
        setLoadingMore(false);
      }
    },
    [slug],
  );

  useEffect(() => { void load(true); }, [load]);

  if (initial) {
    return (
      <div className="grid grid-cols-2 gap-3" aria-busy="true" aria-live="polite">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
        <span className="sr-only">Carregando receitas…</span>
      </div>
    );
  }

  if (locked) {
    return (
      <EmptyState
        icon={<Lock size={22} aria-hidden="true" />}
        title="A galeria ainda não está disponível"
        description="As receitas aparecem aqui assim que a campanha liberar a galeria. Acompanhe as datas na página inicial da campanha."
      />
    );
  }

  if (error && items.length === 0) return <ErrorState message={error} onRetry={() => void load(true)} />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen size={22} aria-hidden="true" />}
        title="Ainda não há receitas aprovadas"
        description="Quando as primeiras receitas forem aprovadas, elas aparecem aqui."
      />
    );
  }

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4" aria-label="Galeria de receitas">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{plural(total, "receita aprovada", "receitas aprovadas")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((r) => (
          <RecipeCard key={r.id} recipe={r} to={`/campanhas/${slug}/receitas/${r.id}`} />
        ))}
      </div>
      {error && <p role="alert" className="text-center text-xs font-medium text-destructive">{error}</p>}
      {items.length < total && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" onClick={() => void load(false)} disabled={loadingMore} className="h-11 gap-2 rounded-xl px-6">
            {loadingMore && <Loader2 size={16} className="animate-spin" />}
            {loadingMore ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      )}
    </motion.section>
  );
}
