import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/skeleton";
import { EmptyState } from "../../components/campaigns/EmptyState";
import { ErrorState } from "../../components/campaigns/ErrorState";
import { BookReader } from "../../components/campaigns/book/BookReader";
import { useCampaignCtx } from "./CampaignLayout";
import { campaignsApi, CampaignApiError, errMsg } from "../../lib/campaigns/api";
import type { BookView } from "../../lib/campaigns/types";

/**
 * Livro de Receitas da campanha (`/campanhas/:slug/livro`). Só existe depois que o administrador publica:
 * antes disso o servidor responde "indisponível" e a tela explica sem expor nada.
 */
export function CampaignBook() {
  const { slug } = useCampaignCtx();
  const [book, setBook] = useState<BookView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadingRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    setUnavailable(false);
    setBook(null);
    try {
      setBook(await campaignsApi.get<BookView>(`/campaigns/${encodeURIComponent(slug)}/book`));
    } catch (e) {
      if (e instanceof CampaignApiError && (e.code === "BOOK_UNAVAILABLE" || e.status === 404 || e.status === 403)) setUnavailable(true);
      else setError(errMsg(e, "Não foi possível carregar o livro."));
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  /** Pede a URL assinada (curta) e baixa o PDF sem sair da tela: o servidor manda como anexo. */
  const download = async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setDownloading(true);
    try {
      const r = await campaignsApi.get<{ url: string; filename?: string }>(`/campaigns/${encodeURIComponent(slug)}/book/pdf`);
      const filename = r.filename || `livro-de-receitas-${slug}.pdf`;
      const url = r.url.includes("download=") ? r.url : `${r.url}${r.url.includes("?") ? "&" : "?"}download=${encodeURIComponent(filename)}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Baixando o PDF do livro…");
    } catch (e) {
      toast.error(errMsg(e, "Não foi possível baixar o PDF. Tente de novo."));
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  };

  if (unavailable) {
    return (
      <EmptyState
        icon={<BookOpen size={22} aria-hidden="true" />}
        title="O livro ainda não está disponível"
        description="Quando for publicado, ele aparece aqui para você ler e baixar."
      />
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!book) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-3xl" />
        <span className="sr-only">Carregando o livro…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold text-foreground">
          <BookOpen size={18} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">Livro de Receitas</span>
        </h2>
        <Button variant="outline" className="h-11 shrink-0 gap-2 rounded-xl px-4" onClick={() => void download()} disabled={downloading}>
          {downloading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileDown size={16} aria-hidden="true" />}
          Baixar PDF
        </Button>
      </div>
      <BookReader book={book} />
    </div>
  );
}
