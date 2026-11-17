import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, Megaphone } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/skeleton";
import { Card } from "../../components/ui/Card";
import { CampaignCard } from "../../components/campaigns/CampaignCard";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { campaignsApi, errMsg } from "../../lib/campaigns/api";
import { LIST_TOUR } from "../../lib/campaigns/tours-collab";
import { useAuth } from "../../context/Store";
import type { CollabCampaignListItem } from "../../lib/campaigns/types";

export function Campaigns() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<CollabCampaignListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setItems(null);
    try {
      const r = await campaignsApi.get<CollabCampaignListItem[]>("/campaigns");
      setItems(Array.isArray(r) ? r : []);
    } catch (e) {
      setError(errMsg(e, "Não foi possível carregar as campanhas."));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const tourEnabled = !!items && items.length > 0 && items.some((c) => c.features?.tour?.enabled);
  const tourVersion = items ? Math.max(1, ...items.map((c) => c.features?.tour?.version ?? 1)) : 1;
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "list", undefined, tourVersion),
    enabled: tourEnabled && !!user,
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pt-1">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-11 w-11 shrink-0 rounded-full" aria-label="Voltar">
          <ChevronLeft size={24} />
        </Button>
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-bold text-foreground">
          <Megaphone size={20} className="shrink-0 text-primary" aria-hidden="true" />
          Campanhas
        </h1>
        <TourButton onClick={tour.start} />
      </header>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        {error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : items === null ? (
          <div className="space-y-4" aria-busy="true" aria-live="polite">
            {[0, 1].map((i) => (
              <Card key={i} className="overflow-hidden rounded-3xl hover:shadow-sm">
                <Skeleton className="aspect-[2/1] w-full rounded-none" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </Card>
            ))}
            <span className="sr-only">Carregando campanhas…</span>
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Megaphone size={24} aria-hidden="true" />} title="Nenhuma campanha por enquanto" description="Quando houver uma para você, ela aparece aqui." />
        ) : (
          items.map((c, i) => <CampaignCard key={c.id} campaign={c} first={i === 0} />)
        )}
      </motion.div>

      <CampaignTour steps={LIST_TOUR} tour={tour} />
    </div>
  );
}
