import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { canShareFile, downloadViaAnchor, needsSecondTap, pdfFileName, shareFile } from "./saveFile";
import type { RecipeBookView } from "./types";

export type BookPdfState =
  | { kind: "idle" }
  | { kind: "working"; pct: number; label: string }
  /** Só no iPhone/iPad com o app instalado: o PDF está pronto e falta o segundo toque (compartilhar/abrir). */
  | { kind: "ready"; url: string; filename: string; canShare: boolean };

export type BookPdf = {
  state: BookPdfState;
  /** Monta o PDF do livro inteiro no aparelho e salva (ou deixa pronto para o segundo toque no iPhone instalado). */
  start: () => void;
  cancel: () => void;
  /** Segundo toque (iPhone instalado): abre a folha de compartilhamento com o arquivo. */
  share: () => void;
  /** Fecha o aviso "PDF pronto" e libera o arquivo da memória. */
  dismiss: () => void;
};

const SHARE_TITLE = "Livro de Receitas SpaceFood";

/**
 * PDF do Livro de Receitas, montado NO APARELHO com o conteúdo atual (nada fica no servidor). Um só estado serve a
 * lista e a leitura: a pessoa pode começar numa tela e continuar na outra sem perder o progresso.
 */
export function useBookPdf(book: RecipeBookView | null): BookPdf {
  const [state, setState] = useState<BookPdfState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<File | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    fileRef.current = null;
  }, []);

  useEffect(() => () => { abortRef.current?.abort(); release(); }, [release]);

  const start = useCallback(() => {
    if (!book || abortRef.current) return;
    release();
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ kind: "working", pct: 2, label: "Preparando o PDF…" });
    void (async () => {
      try {
        const { generateBookPdf, pdfBlob } = await import("./bookPdf");
        const { bytes } = await generateBookPdf(book, {
          signal: ac.signal,
          onProgress: ({ done, total, label }) => setState({ kind: "working", pct: Math.min(98, 4 + Math.round((done / total) * 94)), label }),
        });
        if (ac.signal.aborted) throw new DOMException("Geração cancelada.", "AbortError");
        const filename = pdfFileName();
        const blob = pdfBlob(bytes);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        if (needsSecondTap()) {
          let file: File | null = null;
          try { file = new File([blob], filename, { type: "application/pdf" }); } catch { /* sem File: só o link abre o PDF */ }
          fileRef.current = file;
          setState({ kind: "ready", url, filename, canShare: !!file && canShareFile(file) });
          toast.success("PDF pronto. Toque para salvar.");
        } else {
          downloadViaAnchor(url, filename);
          // o navegador já leu o blob; liberar depois evita vazar o arquivo na memória
          timerRef.current = setTimeout(release, 60_000);
          setState({ kind: "idle" });
          toast.success("PDF pronto. Veja em Downloads.");
        }
      } catch (e) {
        release();
        setState({ kind: "idle" });
        if ((e as { name?: string })?.name === "AbortError") toast.message("Download do PDF cancelado.");
        else toast.error("Não foi possível montar o PDF. Tente de novo.");
      } finally {
        abortRef.current = null;
      }
    })();
  }, [book, release]);

  const cancel = useCallback(() => { abortRef.current?.abort(); }, []);

  const share = useCallback(() => {
    const file = fileRef.current;
    if (!file) return;
    // `shareFile` chama navigator.share na hora (dentro do toque); o resultado só vira aviso.
    void shareFile(file, SHARE_TITLE).then((r) => {
      if (r === "failed") toast.error("Não foi possível compartilhar. Use “Abrir PDF”.");
    });
  }, []);

  const dismiss = useCallback(() => { release(); setState({ kind: "idle" }); }, [release]);

  return { state, start, cancel, share, dismiss };
}
