import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/skeleton";
import { Card } from "../../components/ui/Card";
import { CampaignCard } from "../../components/campaigns/CampaignCard";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { CampaignTour, TourButton, tourKey, useTour } from "../../components/campaigns/CampaignTour";
import { campaignsApi, errMsg, fetchCampaignAvailability } from "../../lib/campaigns/api";
import { LIST_TOUR } from "../../lib/campaigns/tours-collab";
import { useAuth } from "../../context/Store";
import { cn } from "../../lib/utils";
import type { CollabCampaignListItem } from "../../lib/campaigns/types";

/**
 * Campanhas encerradas: um controle discreto e recolhido (sem cartão em volta). Toque abre/fecha a lista; o conteúdo
 * fechado fica invisível (fora da ordem de foco e do leitor de tela). Animação leve, desligada em "reduzir movimento".
 */
function EndedCampaigns({ items }: { items: CollabCampaignListItem[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section aria-label="Campanhas encerradas">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-1.5 rounded-xl px-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span>Campanhas encerradas ({items.length})</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn("shrink-0 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      <div
        id={panelId}
        className={cn(
          "grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out motion-reduce:transition-none",
          open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 pb-1 pt-2">
            {items.map((c) => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Tela inicial de Campanhas:
 *   1. Campanhas ativas (cada cartão tem o seu botão: Ver campanha / Participar da campanha / Votar / Ver resultado);
 *   2. Livro de Receitas (só quando o administrador publicou);
 *   3. "Campanhas encerradas (n)": controle recolhido, só se houver encerradas.
 * Não há botão "Cadastrar receita" no topo: ele repetia o botão do cartão (pedido do usuário). Enviar receita é o botão da página da campanha.
 */
export function Campaigns() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<CollabCampaignListItem[] | null>(null);
  const [book, setBook] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setItems(null);
    try {
      const [list, avail] = await Promise.all([
        campaignsApi.get<CollabCampaignListItem[]>("/campaigns"),
        fetchCampaignAvailability(),
      ]);
      setItems(Array.isArray(list) ? list : []);
      setBook(avail.book);
    } catch (e) {
      setError(errMsg(e, "Não foi possível carregar as campanhas."));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const { active, ended } = useMemo(() => {
    const all = items ?? [];
    return {
      active: all.filter((c) => !c.ended),
      ended: all.filter((c) => c.ended),
    };
  }, [items]);

  const tourEnabled = !!items && items.length > 0 && items.some((c) => c.features?.tour?.enabled);
  const tourVersion = items ? Math.max(1, ...items.map((c) => c.features?.tour?.version ?? 1)) : 1;
  const tour = useTour({
    storageKey: tourKey("collab", user?.id, "list", undefined, tourVersion),
    enabled: tourEnabled && !!user,
  });

  const noCampaigns = items !== null && items.length === 0;

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
        ) : (
          <>
            {active.length > 0 && (
              <section className="space-y-3" aria-label="Campanhas ativas">
                <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Campanhas ativas</h2>
                {active.map((c, i) => <CampaignCard key={c.id} campaign={c} first={i === 0} />)}
              </section>
            )}

            {noCampaigns && !book && (
              <EmptyState icon={<Megaphone size={24} aria-hidden="true" />} title="Nenhuma campanha por enquanto" description="Quando houver uma para você, ela aparece aqui." />
            )}
            {/* Sem campanha ativa, mas há Livro e/ou encerradas: aviso curto no lugar da lista de ativas */}
            {active.length === 0 && !(noCampaigns && !book) && (
              <p className="px-1 text-sm text-muted-foreground">Nenhuma campanha ativa no momento.</p>
            )}

            {book && (
              <Link
                to="/campanhas/livro"
                data-tutorial="camp-book-card"
                aria-label="Abrir o Livro de Receitas"
                className="block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card className="flex items-center gap-3 rounded-3xl border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <BookOpen size={24} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold leading-tight text-foreground">Livro de Receitas</span>
                    <span className="block text-xs text-muted-foreground">Leia as receitas ou baixe o Livro de Receitas em PDF.</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                </Card>
              </Link>
            )}

            {ended.length > 0 && <EndedCampaigns items={ended} />}
          </>
        )}
      </motion.div>

      <CampaignTour steps={LIST_TOUR} tour={tour} />
    </div>
  );
}
