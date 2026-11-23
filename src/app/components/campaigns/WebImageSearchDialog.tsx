import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ImageOff, Loader2, RefreshCw, Search, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "../ui/sheet";
import { Input } from "../ui/input";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/skeleton";
import { RecipePhoto } from "./RecipePhoto";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import type { WebImageResult, WebImageSearch, WebImportedMedia } from "../../lib/campaigns/types";

const MIN_Q = 2;
const MAX_Q = 80;
const DEBOUNCE_MS = 600;
const FALLBACK_HINT = "Você também pode enviar a foto do seu aparelho.";

type Status = "idle" | "loading" | "ready" | "error";

/** Mensagens amigáveis para os erros que a busca pode devolver (o servidor já manda texto pronto; estas cobrem o resto). */
function searchErrorMessage(e: unknown): string {
  if (e instanceof CampaignApiError) {
    if (e.code === "RATE_LIMIT" || e.status === 429) return "Muitas buscas seguidas. Aguarde um instante e tente de novo.";
    if (e.code === "IMAGE_SEARCH_UNAVAILABLE" || e.status === 502) return e.message || "A busca de imagens não está disponível agora.";
  }
  return errMsg(e, "Não foi possível pesquisar agora.");
}

/**
 * Pesquisa de imagens na internet (Wikimedia Commons, licenças livres) para a foto da receita.
 * Nada é copiado até a pessoa escolher uma: aí o servidor busca a imagem na fonte, confere o formato e o tamanho e devolve a
 * mídia com o crédito (`POST /campaigns/:slug/media/from-web`), que entra no conjunto de fotos como se fosse enviada do aparelho.
 * Folha na parte de baixo (mesmo padrão da folha de receita): busca fixa no topo, miniaturas no miolo, aviso de licença no rodapé.
 */
export function WebImageSearchDialog({
  open, onOpenChange, slug, kind, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  /** Tipo que a foto terá na receita (a 1ª é a principal). */
  kind: "main_photo" | "photo";
  onImported: (picked: WebImageResult, media: WebImportedMedia) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [items, setItems] = useState<WebImageResult[]>([]);
  const [searched, setSearched] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const valid = (v: string) => v.trim().length >= MIN_Q && v.trim().length <= MAX_Q;

  const run = useCallback(
    async (term: string) => {
      const query = term.trim();
      if (query.length < MIN_Q || query.length > MAX_Q) return;
      const mine = ++seq.current;
      setStatus("loading");
      setError(null);
      setAddError(null);
      try {
        const r = await campaignsApi.get<WebImageSearch>(`/campaigns/${encodeURIComponent(slug)}/image-search?q=${encodeURIComponent(query)}`);
        if (mine !== seq.current) return;
        setItems(Array.isArray(r.items) ? r.items : []);
        setSearched(query);
        setStatus("ready");
      } catch (e) {
        if (mine !== seq.current) return;
        setItems([]);
        setError(searchErrorMessage(e));
        setStatus("error");
      }
    },
    [slug],
  );

  // Busca sozinha depois que a pessoa para de digitar (Enter busca na hora).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!open) return;
    if (!valid(q)) {
      seq.current++;
      if (status !== "idle") { setStatus("idle"); setItems([]); setError(null); }
      return;
    }
    if (q.trim() === searched && status === "ready") return;
    timer.current = setTimeout(() => void run(q), DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    if (valid(q)) void run(q);
    else inputRef.current?.focus();
  };

  const pick = async (item: WebImageResult) => {
    if (addingId) return;
    setAddingId(item.id);
    setAddError(null);
    try {
      const media = await campaignsApi.post<WebImportedMedia>(`/campaigns/${encodeURIComponent(slug)}/media/from-web`, { id: item.id, kind });
      onImported(item, media);
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof CampaignApiError && (e.code === "RATE_LIMIT" || e.status === 429)
        ? "Muitas tentativas seguidas. Aguarde um instante e tente de novo."
        : errMsg(e, "Não foi possível adicionar esta imagem.");
      setAddError(msg);
    } finally {
      setAddingId(null);
    }
  };

  const trimmed = q.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_Q;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!addingId) onOpenChange(o); }}>
      <SheetContent
        side="bottom"
        hideClose
        data-web-image-search
        onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
        className="mx-auto flex max-h-[90dvh] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-t-3xl p-0"
      >
        <div className="shrink-0 space-y-3 border-b border-border px-4 pb-3 pt-3">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-base leading-snug">Pesquisar imagem na internet</SheetTitle>
            <SheetClose
              aria-label="Fechar"
              disabled={!!addingId}
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
            >
              <X size={20} aria-hidden="true" />
            </SheetClose>
          </div>
          <SheetDescription className="sr-only">Pesquise uma imagem com licença livre e escolha a que quiser usar na receita.</SheetDescription>
          <form onSubmit={submit} role="search" className="flex gap-2">
            <label htmlFor="web-image-q" className="sr-only">Buscar imagem</label>
            <Input
              id="web-image-q"
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={MAX_Q}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Ex.: bolo de fubá"
              disabled={!!addingId}
              className="h-11 flex-1 rounded-xl"
            />
            <Button type="submit" size="icon" aria-label="Pesquisar" disabled={!!addingId || !valid(q)} className="h-11 w-11 shrink-0 rounded-xl">
              {status === "loading" ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
            </Button>
          </form>
        </div>

        <div data-web-image-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {addError && (
            <p role="alert" className="mb-3 rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-900 dark:bg-red-950/20 dark:text-red-100">
              {addError} {FALLBACK_HINT}
            </p>
          )}

          {status === "idle" && (
            <p className={`py-8 text-center text-sm ${tooShort ? "text-foreground" : "text-muted-foreground"}`} aria-live="polite">
              {tooShort ? `Digite pelo menos ${MIN_Q} letras.` : "Digite o nome do prato ou do ingrediente para ver imagens."}
            </p>
          )}

          {status === "loading" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy="true" aria-live="polite">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
              <span className="sr-only">Pesquisando imagens…</span>
            </div>
          )}

          {status === "error" && (
            <div role="alert" className="space-y-3 rounded-2xl bg-muted p-4 text-center">
              <ImageOff size={22} className="mx-auto text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">{error}</p>
              <p className="text-xs text-muted-foreground">{FALLBACK_HINT}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" className="h-11 gap-1.5 rounded-xl px-4" onClick={() => void run(q)} disabled={!valid(q)}>
                  <RefreshCw size={14} aria-hidden="true" /> Tentar de novo
                </Button>
                <Button variant="ghost" size="sm" className="h-11 rounded-xl px-4" onClick={() => onOpenChange(false)}>Fechar</Button>
              </div>
            </div>
          )}

          {status === "ready" && items.length === 0 && (
            <div className="space-y-2 py-8 text-center" role="status">
              <ImageOff size={22} className="mx-auto text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">Nenhuma imagem encontrada para “{searched}”.</p>
              <p className="text-xs text-muted-foreground">Tente outra palavra. {FALLBACK_HINT}</p>
            </div>
          )}

          {status === "ready" && items.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={`Imagens para ${searched}`}>
              {items.map((it) => {
                const adding = addingId === it.id;
                return (
                  <li key={it.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => void pick(it)}
                      disabled={!!addingId}
                      aria-label={`Usar a imagem “${it.title}”${it.creator ? `, de ${it.creator}` : ""}${it.license ? `, licença ${it.license}` : ""}`}
                      className="group block w-full rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                    >
                      <span className="relative block overflow-hidden rounded-2xl border border-border">
                        <RecipePhoto src={it.thumb_url} variant="tile" className="transition-transform group-hover:scale-[1.02]" />
                        {adding && (
                          <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/80 text-xs font-bold text-foreground" aria-live="polite">
                            <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Adicionando…
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block px-0.5">
                        <span className="line-clamp-1 text-xs font-semibold text-foreground">{it.title}</span>
                        <span className="line-clamp-1 text-[10px] text-muted-foreground">{[it.creator, it.license].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="shrink-0 border-t border-border bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 text-[11px] leading-snug text-muted-foreground">
          Imagens com licença livre (Wikimedia Commons). O crédito é guardado com a foto.
        </p>
      </SheetContent>
    </Sheet>
  );
}
