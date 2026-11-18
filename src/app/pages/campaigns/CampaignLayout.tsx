import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/skeleton";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import { submissionsCount } from "../../components/campaigns/campaignInfo";
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
  const { pathname } = useLocation();
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
      Ver campanhas
    </Button>
  );

  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 pt-2" aria-busy="true" aria-live="polite">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="aspect-[2/1] w-full rounded-3xl" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <span className="sr-only">Carregando a campanha…</span>
      </div>
    );
  }

  if (error || !ctx) {
    const unavailable = error instanceof CampaignApiError && (error.status === 404 || error.code === "CAMPAIGN_UNAVAILABLE");
    return (
      <div className="mx-auto w-full max-w-2xl pt-2">
        {unavailable ? (
          <ErrorState title="Campanha indisponível" message="Ela não está aberta para você agora.">
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
  const isHome = pathname.replace(/\/+$/, "") === base;
  const isForm = /\/enviar(\/|$)/.test(pathname);

  // Seções: só as que existem para esta campanha e esta pessoa agora.
  // "Minhas receitas" aparece para quem já enviou ou ainda pode enviar (é a porta de entrada para cadastrar).
  // "Votação" só existe em campanha COM votação; "Resultado" quando a votação e/ou o sorteio foram divulgados;
  // "Livro de Receitas" só depois que o administrador publica o livro.
  const hasVoting = !!campaign.features.voting;
  const hasDraw = !!campaign.features.draw;
  const sections: { to: string; label: string; short?: string; end?: boolean }[] = [{ to: base, label: "Início", end: true }];
  if (state.gallery_visible) sections.push({ to: `${base}/receitas`, label: "Receitas" });
  if (state.released && (submissionsCount(state) > 0 || state.can_submit)) {
    sections.push({ to: `${base}/participacao`, label: "Minhas receitas" });
  }
  if (hasVoting && !state.results_visible && state.released && (state.voting === "open" || state.has_voted || state.voting === "closed")) {
    sections.push({ to: `${base}/votacao`, label: state.can_vote ? "Votar" : "Votação" });
  }
  if ((hasVoting && state.results_visible) || (hasDraw && state.draw_visible)) {
    sections.push({ to: `${base}/resultado`, label: "Resultado" });
  }
  if (state.book_published) {
    sections.push({ to: `${base}/livro`, label: "Livro de Receitas", short: "Livro" });
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pt-1">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(isHome ? "/campanhas" : base)}
          className="h-11 w-11 shrink-0 rounded-full"
          aria-label={isHome ? "Voltar para as campanhas" : "Voltar para a campanha"}
        >
          <ChevronLeft size={24} />
        </Button>
        {!isHome && <p className="min-w-0 flex-1 truncate text-base font-bold text-foreground">{campaign.name}</p>}
      </header>

      {sections.length > 1 && !isForm && (
        <nav
          aria-label="Seções da campanha"
          data-tutorial="camp-sections"
          className="flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                cn(
                  "flex h-10 flex-1 shrink-0 items-center justify-center whitespace-nowrap rounded-xl font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  // com 5 ou mais seções o menu fica mais compacto para caber no celular sem rolagem
                  sections.length >= 5 ? "px-1.5 text-[12px]" : "px-3 text-[13px]",
                  isActive ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {s.short ? (<><span className="sm:hidden" aria-hidden="true">{s.short}</span><span className="sr-only sm:not-sr-only">{s.label}</span></>) : s.label}
            </NavLink>
          ))}
        </nav>
      )}

      <Outlet context={ctx} />
    </div>
  );
}
