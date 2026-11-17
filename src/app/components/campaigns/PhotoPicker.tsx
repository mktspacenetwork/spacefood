import { useEffect, useRef, useState } from "react";
import { Camera, Check, FileWarning, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Progress } from "../ui/progress";
import { cn } from "../../lib/utils";
import { IMAGE_ACCEPT, checkImage, detectMime, prepareImage } from "../../lib/campaigns/media";

/**
 * A foto da receita no formulário (uma só).
 *  - nova:      `file` presente e sem `serverId`;
 *  - existente: `serverId` + `serverStatus: "ready"`, `previewUrl` = URL assinada;
 *  - pendente:  `serverId` + `serverStatus: "pending"` — a linha existe no servidor, mas o arquivo não chegou.
 */
export type PhotoDraft = {
  previewUrl: string;
  mime: string;
  size: number;
  file?: File;
  serverId?: string;
  serverStatus?: "ready" | "pending";
  /** upload concluído (aguardando finalizar) */
  uploaded?: boolean;
  progress: number;
  error?: string;
  /** o servidor descartou o arquivo (conteúdo diferente do tipo declarado): só resta trocar */
  invalid?: boolean;
};

const MINI_BTN =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-background/95 px-4 text-sm font-semibold text-foreground shadow-md backdrop-blur-sm transition-all hover:bg-background active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50";

export function PhotoPicker({
  draft,
  setDraft,
  maxMb,
  disabled,
  showError,
}: {
  draft: PhotoDraft | null;
  setDraft: React.Dispatch<React.SetStateAction<PhotoDraft | null>>;
  maxMb: number;
  disabled?: boolean;
  /** mostra "adicione a foto" quando falta */
  showError?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const blob = useRef<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => () => { if (blob.current) URL.revokeObjectURL(blob.current); }, []);

  const dropBlob = () => {
    if (blob.current) { URL.revokeObjectURL(blob.current); blob.current = null; }
  };

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setNotice(null);
    const typeErr = checkImage(file);
    if (typeErr) { setNotice(typeErr); return; }
    setPreparing(true);
    try {
      const ready = await prepareImage(file, { max_photo_mb: maxMb });
      dropBlob();
      const url = URL.createObjectURL(ready);
      blob.current = url;
      // Se havia uma linha pendente no servidor, o arquivo novo reaproveita o mesmo envio.
      setDraft((prev) => ({
        previewUrl: url,
        mime: detectMime(ready),
        size: ready.size,
        file: ready,
        serverId: prev?.serverStatus === "pending" ? prev.serverId : undefined,
        serverStatus: prev?.serverStatus === "pending" ? "pending" : undefined,
        progress: 0,
      }));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Não foi possível usar esta foto.");
    } finally {
      setPreparing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const remove = () => {
    dropBlob();
    setNotice(null);
    setDraft(null);
  };

  const hasPreview = !!draft && !!draft.previewUrl;
  const pendingNoFile = !!draft && draft.serverStatus === "pending" && !draft.file;
  const uploading = !!draft && draft.progress > 0 && draft.progress < 1;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || preparing}
        onChange={(e) => void pick(e.target.files)}
      />

      {hasPreview ? (
        <div className="relative overflow-hidden rounded-3xl bg-muted">
          <img src={draft!.previewUrl} alt="Foto da receita" className="aspect-[4/3] w-full object-cover" />
          {!disabled && (
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
              <button type="button" className={MINI_BTN} onClick={() => inputRef.current?.click()} disabled={preparing}>
                <RefreshCw size={15} aria-hidden="true" /> Trocar
              </button>
              <button type="button" className={cn(MINI_BTN, "text-destructive")} onClick={remove} disabled={preparing} aria-label="Remover a foto">
                <Trash2 size={15} aria-hidden="true" /> Remover
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {pendingNoFile && (
            <div className="flex items-start gap-2 rounded-2xl border border-yellow-300 bg-yellow-50 p-3 text-sm font-medium text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-100" role="alert">
              <FileWarning size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>A foto não chegou. Escolha de novo.</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || preparing}
            aria-label="Tirar foto ou escolher da galeria"
            className={cn(
              "flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed bg-muted/30 px-6 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50",
              showError ? "border-destructive/60" : "border-border",
            )}
          >
            {preparing ? <Loader2 size={34} className="animate-spin" aria-hidden="true" /> : <Camera size={36} strokeWidth={1.75} aria-hidden="true" />}
            <span className="text-base font-bold text-foreground">{preparing ? "Preparando a foto…" : "Tirar foto ou escolher da galeria"}</span>
            {!preparing && <span className="text-xs">A foto da receita pronta</span>}
          </button>
        </>
      )}

      {preparing && hasPreview && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Preparando a foto…
        </p>
      )}
      {uploading && (
        <div className="space-y-1" aria-live="polite">
          <Progress value={Math.round(draft!.progress * 100)} className="h-1.5" aria-label="Progresso do envio da foto" />
          <p className="text-xs text-muted-foreground">Enviando… {Math.round(draft!.progress * 100)}%</p>
        </div>
      )}
      {draft?.uploaded && !draft.error && (
        <p className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
          <Check size={12} aria-hidden="true" /> Foto enviada
        </p>
      )}
      {(notice || draft?.error) && (
        <p role="alert" className="text-sm font-medium text-destructive">{notice ?? draft?.error}</p>
      )}
      {showError && !draft && !notice && (
        <p role="alert" className="text-sm font-medium text-destructive">Adicione a foto da receita.</p>
      )}
    </div>
  );
}
