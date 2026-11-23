import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { User, Vote, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/skeleton";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "../ui/sheet";
import { RecipePhotos, RecipeText, LateNote } from "./RecipeBody";
import { VoteConfirmDialog } from "./VoteConfirmDialog";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import type { CollabState, RecipeDetail } from "../../lib/campaigns/types";

// ───────────────────── Votação começou: sem enviar nem editar ─────────────────────

export const VOTING_LOCKED_MSG = "A votação começou: não é mais possível enviar nem editar receitas.";

/**
 * A campanha já está na votação (aberta, em pausa ou encerrada), a participação não está aberta, não há janela de atraso e o
 * servidor não permite enviar nem editar (`can_submit`/`can_edit` falsos). Nesse caso a tela explica o motivo com a mensagem
 * acima (em vez de "A participação foi encerrada.") e esconde/desabilita Editar e o botão de novo envio.
 * Servidor antigo (sem essas informações) nunca cai aqui: a tela se comporta como antes.
 */
export function votingLocked(state: Pick<CollabState, "voting" | "registration" | "late_window" | "can_submit" | "can_edit">): boolean {
  const started = state.voting === "open" || state.voting === "paused" || state.voting === "closed";
  return started && state.registration === "closed" && !state.late_window && !state.can_submit && !state.can_edit;
}

// ───────────────────────── Folha única de receita ─────────────────────────

/**
 * Folha (bottom sheet) ÚNICA para ver uma receita completa: usada em Receitas, Minhas receitas e Votação.
 * Largura máxima de 672 px e centralizada (nunca estoura no computador), altura de até 90 % da tela, cabeçalho
 * (nome + botão de fechar de 44 px) e rodapé de ações fixos, só o miolo rola. Respeita a área segura do iPhone.
 */
export function RecipeSheet({
  open, onOpenChange, title, subtitle, children, footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Linha abaixo do nome (autor). */
  subtitle?: ReactNode;
  /** Miolo rolável. */
  children: ReactNode;
  /** Ações fixas no rodapé (votar, editar). */
  footer?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        data-recipe-sheet
        className="mx-auto flex max-h-[90dvh] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-t-3xl p-0"
      >
        <div className="flex shrink-0 items-start gap-2 border-b border-border py-3 pl-5 pr-2">
          <div className="min-w-0 flex-1 space-y-0.5 pt-1.5">
            <SheetTitle className="break-words text-lg leading-snug">{title}</SheetTitle>
            {subtitle && <div className="flex items-center gap-1.5 text-sm text-muted-foreground">{subtitle}</div>}
          </div>
          <SheetClose
            aria-label="Fechar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <X size={20} aria-hidden="true" />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">Receita completa</SheetDescription>
        <div
          data-recipe-sheet-body
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 ${footer ? "pb-4" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]"}`}
        >
          <div className="space-y-4">{children}</div>
        </div>
        {footer && (
          <div className="shrink-0 border-t border-border bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Qual receita está aberta na folha, guardada na URL (`?receita=<id>`): o botão "voltar" do celular fecha a folha em
 * vez de sair da tela, e a folha reabre ao voltar de "Editar". Abrir empilha no histórico; fechar volta um passo
 * (ou, se a pessoa já chegou com o endereço pronto, só remove o parâmetro).
 */
const SHEET_PARAM = "receita";
export function useRecipeSheetParam(): [string | null, (id: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const openedHere = useRef(false);
  const id = params.get(SHEET_PARAM);
  const set = useCallback(
    (next: string | null) => {
      if (next) {
        openedHere.current = true;
        setParams((p) => { const n = new URLSearchParams(p); n.set(SHEET_PARAM, next); return n; });
      } else if (openedHere.current) {
        openedHere.current = false;
        navigate(-1);
      } else {
        setParams((p) => { const n = new URLSearchParams(p); n.delete(SHEET_PARAM); return n; }, { replace: true });
      }
    },
    [navigate, setParams],
  );
  return [id, set];
}

// ─────────────────── Receita da galeria (página e folha) ───────────────────

/** Carrega `GET /campaigns/:slug/recipes/:id` (receita aprovada, com `can_vote`/`mine`). */
export function useRecipeDetail(slug: string, id: string | null) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const seq = useRef(0);
  const load = useCallback(
    async (silent = false) => {
      if (!id) return;
      const mine = ++seq.current;
      if (!silent) { setError(null); setRecipe(null); }
      try {
        const r = await campaignsApi.get<RecipeDetail>(`/campaigns/${encodeURIComponent(slug)}/recipes/${encodeURIComponent(id)}`);
        if (mine === seq.current) setRecipe(r);
      } catch (e) {
        if (!silent && mine === seq.current) {
          setError({ message: errMsg(e, "Não foi possível carregar a receita."), notFound: e instanceof CampaignApiError && e.status === 404 });
        }
      }
    },
    [slug, id],
  );
  useEffect(() => { void load(); }, [load]);
  return { recipe, error, reload: load };
}

/** Voto na receita aberta: confirmação, envio sem duplo clique e recarga do que o servidor decidiu. */
export function useRecipeVote(slug: string, recipe: RecipeDetail | null, afterVote: () => Promise<unknown> | void) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voting, setVoting] = useState(false);
  const inflight = useRef(false);
  const vote = async () => {
    if (!recipe || inflight.current) return;
    inflight.current = true;
    setVoting(true);
    try {
      await campaignsApi.post(`/campaigns/${encodeURIComponent(slug)}/votes`, { submission_id: recipe.id, confirm: true });
      toast.success("Voto registrado!");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setConfirmOpen(false);
      inflight.current = false;
      setVoting(false);
      await afterVote();
    }
  };
  return { confirmOpen, setConfirmOpen, voting, vote };
}

/**
 * Foto, nome (`heading`, só na tela cheia: na folha o nome já está no cabeçalho fixo), aviso de "fora do prazo"
 * (só o autor vê) e texto completo de uma receita da galeria. Ordem: foto → nome → ingredientes → preparo → história.
 */
export function RecipeDetailBody({ recipe, heading }: { recipe: RecipeDetail; heading?: ReactNode }) {
  return (
    <>
      <RecipePhotos media={recipe.media} alt={recipe.dish_name} />
      {heading}
      {recipe.mine && recipe.is_late && <LateNote />}
      <RecipeText story={recipe.description} ingredients={recipe.ingredients} preparation={recipe.preparation} />
    </>
  );
}

export function RecipeDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <Skeleton className="mx-auto aspect-[4/3] w-full max-w-[560px] rounded-3xl" />
      <Skeleton className="h-24 w-full rounded-3xl" />
      <Skeleton className="h-24 w-full rounded-3xl" />
      <span className="sr-only">Carregando receita…</span>
    </div>
  );
}

/**
 * Folha de uma receita da galeria (Receitas e Votação). `id` vem de `useRecipeSheetParam`; `onChanged` roda depois de
 * um voto (recarregar o estado da campanha e a lista da tela).
 */
export function GalleryRecipeSheet({
  slug, id, onClose, onChanged,
}: { slug: string; id: string | null; onClose: () => void; onChanged?: () => Promise<unknown> | void }) {
  // Mantém a última receita enquanto a folha fecha (sem piscar o conteúdo durante a animação).
  const last = useRef<string | null>(id);
  if (id) last.current = id;
  const { recipe, error, reload } = useRecipeDetail(slug, last.current);
  const v = useRecipeVote(slug, recipe, async () => { await Promise.all([reload(true), onChanged?.()]); });

  const footer = recipe?.can_vote ? (
    <Button size="lg" onClick={() => v.setConfirmOpen(true)} disabled={v.voting} className="h-14 w-full gap-2 rounded-2xl text-base font-bold">
      <Vote size={18} aria-hidden="true" /> Votar nesta receita
    </Button>
  ) : undefined;

  return (
    <>
      <RecipeSheet
        open={!!id}
        onOpenChange={(o) => { if (!o) onClose(); }}
        title={recipe?.dish_name ?? "Receita"}
        subtitle={recipe ? <><User size={14} aria-hidden="true" className="shrink-0" /><span className="truncate">{recipe.mine ? "Você" : recipe.author}</span></> : undefined}
        footer={footer}
      >
        {error ? (
          <div role="alert" className="space-y-3 rounded-2xl bg-muted p-4 text-center">
            <p className="text-sm text-foreground">{error.message}</p>
            {!error.notFound && <Button variant="outline" size="sm" className="h-11 rounded-xl px-4" onClick={() => void reload()}>Tentar de novo</Button>}
          </div>
        ) : recipe ? (
          <RecipeDetailBody recipe={recipe} />
        ) : (
          <RecipeDetailSkeleton />
        )}
      </RecipeSheet>
      <VoteConfirmDialog open={v.confirmOpen} onOpenChange={v.setConfirmOpen} dishName={recipe?.dish_name ?? ""} loading={v.voting} onConfirm={() => void v.vote()} />
    </>
  );
}
