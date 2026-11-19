import { ExternalLink, FileDown, Loader2, Share2, X } from "lucide-react";
import { Button } from "../../ui/Button";
import { Progress } from "../../ui/progress";
import { cn } from "../../../lib/utils";
import type { BookPdf } from "../../../lib/campaigns/useBookPdf";

/** Botão "Baixar PDF" do Livro inteiro. Igual na lista e na leitura (um só estado em `useBookPdf`). */
export function BookPdfButton({ pdf, className }: { pdf: BookPdf; className?: string }) {
  const busy = pdf.state.kind === "working";
  return (
    <Button
      type="button"
      variant="outline"
      onClick={pdf.start}
      disabled={busy}
      className={cn("h-11 gap-2 rounded-xl", className)}
    >
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileDown size={16} aria-hidden="true" />}
      Baixar PDF
    </Button>
  );
}

/** Progresso com "Cancelar" e, no iPhone com o app instalado, o aviso "PDF pronto" com o segundo toque. */
export function BookPdfStatus({ pdf }: { pdf: BookPdf }) {
  const s = pdf.state;
  if (s.kind === "idle") return null;

  if (s.kind === "working") {
    return (
      <div className="space-y-2 rounded-2xl border border-border bg-card p-3" role="status" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate font-medium text-foreground">{s.label}</span>
          <Button type="button" variant="ghost" size="sm" className="h-11 shrink-0 gap-1 rounded-xl" onClick={pdf.cancel}>
            <X size={14} aria-hidden="true" /> Cancelar
          </Button>
        </div>
        <Progress value={s.pct} />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-3" role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">PDF pronto</p>
          <p className="text-xs text-muted-foreground">
            {s.canShare ? "Toque para salvar em Arquivos ou enviar." : "Toque para abrir. Depois salve pelo botão de compartilhar."}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full" onClick={pdf.dismiss} aria-label="Fechar aviso do PDF">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      {s.canShare ? (
        <Button type="button" className="h-12 w-full gap-2 rounded-xl" onClick={pdf.share}>
          <Share2 size={16} aria-hidden="true" /> Salvar ou compartilhar
        </Button>
      ) : (
        // Link comum (não window.open): no app instalado do iPhone, window.open pode prender a tela sem botão de voltar.
        <a
          href={s.url}
          target="_blank"
          rel="noopener"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 active:scale-95"
        >
          <ExternalLink size={16} aria-hidden="true" /> Abrir PDF
        </a>
      )}
    </div>
  );
}
