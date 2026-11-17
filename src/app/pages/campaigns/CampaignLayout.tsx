import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router";
import { BookOpen, ChevronLeft, ClipboardList, Home, ListOrdered, Send, Trophy, Vote } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/skeleton";
import { StageBadge } from "../../components/campaigns/StageBadge";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { cn } from "../../lib/utils";
import type { CollabState, PublicCampaign } from "../../lib/campaigns/types";

/** Contexto entregue às telas filhas da campanha (via <Outlet context>). */
export type CampaignCtx = {
  campaign: PublicCampaign;
  state: CollabState;
  /** recarrega campanha + estado sem mostrar tela de carregamento */
  refresh: () => Promise<void>;
  slug: string;
};

export function useCampaignCtx(): CampaignCtx {
  return useOutletContext<CampaignCtx>();
}

type Loaded = { campaign: PublicCampaign; state: CollabState };

export function CampaignLayout() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const r = await campaignsApi.get<Loaded>(`/campaigns/${encodeURIComponent(slug)}`);
        setData(r);
        setError(null);
      } catch (e) {
        // Recarga silenciosa que falha mantém a tela atual; só a carga inicial mostra erro.
        if (!silent) setError(e);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    setData(null);
    void load(false);
  }, [load]);

  const refresh = useCallback(async () => { await load(true); }, [load]);

  const ctx = useMemo<CampaignCtx | null>(
    () => (data ? { campaign: data.campaign, state: data.state, refresh, slug } : null),
    [data, refresh, slug],
  );

  const toList = (
    <Button variant="outline" size="sm" className="h-11 rounded-xl px-4" onClick={() => navigate("/campanhas")}>
      Ver todas as campanhas
    </Button>
  );

  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 pt-2" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-11 w-full rounded-full" />
        <Skeleton className="aspect-video w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-3xl" />
        <span className="sr-only">Carregando a campanha…</span>
      </div>
    );
  }

  if (error || !ctx) {
    const unavailable = error instanceof CampaignApiError && (error.status === 404 || error.code === "CAMPAIGN_UNAVAILABLE");
    return (
      <div className="mx-auto w-full max-w-2xl pt-2">
        {unavailable ? (
          <ErrorState title="Campanha indisponível" message="Esta campanha não está disponível para você agora. Ela pode ter sido encerrada ou ainda não ter sido aberta.">
            {toList}
          </ErrorState>
        ) : (
          <ErrorState message={errMsg(error)} onRetry={() => void load(false)}>
            {toList}
          </ErrorState>
        )}
      </div>
    );
  }

  const { campaign, state } = ctx;
  const base = `/campanhas/${slug}`;
  const sections: { to: string; label: string; icon: React.ElementType; end?: boolean }[] = [
    { to: base, label: "Início", icon: Home, end: true },
  ];
  if (state.gallery_visible) sections.push({ to: `${base}/receitas`, label: "Receitas", icon: BookOpen });
  if (state.can_submit && !state.my_submission_id) sections.push({ to: `${base}/enviar`, label: "Enviar receita", icon: Send });
  if (state.my_submission_id) sections.push({ to: `${base}/participacao`, label: "Minha participação", icon: ClipboardList });
  if (campaign.features.voting && state.released) sections.push({ to: `${base}/votacao`, label: "Votação", icon: Vote });
  if (state.ranking_visible) sections.push({ to: `${base}/ranking`, label: "Ranking", icon: ListOrdered });
  if (state.results_visible) sections.push({ to: `${base}/resultado`, label: "Resultado", icon: Trophy });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pt-2">
      <header className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/campanhas")} className="h-11 w-11 shrink-0 rounded-full" aria-label="Voltar para a lista de campanhas">
          <ChevronLeft size={24} />
        </Button>
        <div className="min-w-0 flex-1 pt-0.5">
          <h1 className="text-xl font-bold leading-tight text-foreground">{campaign.name}</h1>
          <div className="mt-1.5">
            <StageBadge stage={state.stage} />
          </div>
        </div>
      </header>

      {sections.length > 1 && (
        <nav
          aria-label="Seções da campanha"
          data-tutorial="camp-sections"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                cn(
                  "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <s.icon size={16} aria-hidden="true" />
              {s.label}
            </NavLink>
          ))}
        </nav>
      )}

      <Outlet context={ctx} />
    </div>
  );
}
