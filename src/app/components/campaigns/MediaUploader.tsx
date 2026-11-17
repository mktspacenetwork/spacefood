import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Loader2, RefreshCw, Trash2, Video as VideoIcon, FileWarning } from "lucide-react";
import { Progress } from "../ui/progress";
import { cn } from "../../lib/utils";
import {
  IMAGE_ACCEPT, VIDEO_ACCEPT, checkFileType, detectMime, formatBytes, prepareImage, prepareVideo,
  type MediaKind,
} from "../../lib/campaigns/media";
import type { MediaLimits } from "../../lib/campaigns/types";

/**
 * Um arquivo de mídia da receita no formulário.
 *  - novo:      `file` presente e sem `serverId` (ainda não registrado no servidor);
 *  - existente: `serverId` + `serverStatus: "ready"`, `previewUrl` = URL assinada;
 *  - pendente:  `serverId` + `serverStatus: "pending"` — linha criada, arquivo ainda não enviado.
 */
export type MediaDraft = {
  key: string;
  kind: MediaKind;
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
  /** o servidor descartou o arquivo (conteúdo diferente do tipo declarado): só resta remover */
  invalid?: boolean;
};

const newKey = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const makeDraftKey = newKey;

const SLOT = "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50";
const MINI_BTN = "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-background/90 px-3 text-xs font-semibold text-foreground shadow-md backdrop-blur-sm transition-all hover:bg-background active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50";

function DraftStatus({ d }: { d: MediaDraft }) {
  if (d.error) return <p role="alert" className="text-xs font-medium text-destructive">{d.error}</p>;
  if (d.uploaded) {
    return (
      <p className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
        <Check size={12} aria-hidden="true" /> Enviado
      </p>
    );
  }
  if (d.progress > 0 && d.progress < 1) {
    return (
      <div className="space-y-1" aria-live="polite">
        <Progress value={Math.round(d.progress * 100)} className="h-1.5" aria-label="Progresso do envio" />
        <p className="text-[11px] text-muted-foreground">Enviando… {Math.round(d.progress * 100)}%</p>
      </div>
    );
  }
  return null;
}

function Missing({ text }: { text: string }) {
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-yellow-300 bg-yellow-50 p-4 text-center text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-200">
      <FileWarning size={22} aria-hidden="true" />
      <p className="text-xs font-medium">{text}</p>
    </div>
  );
}

export function MediaUploader({
  items,
  setItems,
  limits,
  allowPhotos,
  allowVideo,
  disabled,
  mainRequiredError,
}: {
  items: MediaDraft[];
  setItems: React.Dispatch<React.SetStateAction<MediaDraft[]>>;
  limits: MediaLimits;
  allowPhotos: boolean;
  allowVideo: boolean;
  disabled?: boolean;
  /** mostra o aviso de foto principal obrigatória */
  mainRequiredError?: boolean;
}) {
  const mainRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const blobs = useRef<Set<string>>(new Set());
  const [busy, setBusy] = useState<MediaKind | null>(null);
  const [notice, setNotice] = useState<{ kind: MediaKind; text: string } | null>(null);

  useEffect(() => {
    const set = blobs.current;
    return () => { set.forEach((u) => URL.revokeObjectURL(u)); set.clear(); };
  }, []);

  const main = items.find((i) => i.kind === "main_photo");
  const photos = items.filter((i) => i.kind === "photo");
  const video = items.find((i) => i.kind === "video");
  const maxPhotos = Math.max(0, limits.max_photos);

  const dropBlob = (d: MediaDraft) => {
    if (d.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(d.previewUrl);
      blobs.current.delete(d.previewUrl);
    }
  };

  async function pick(files: FileList | null, kind: MediaKind) {
    if (!files || files.length === 0) return;
    setNotice(null);
    let selected = Array.from(files);
    if (kind === "photo") {
      const room = Math.max(0, maxPhotos - itemsRef.current.filter((i) => i.kind === "photo").length);
      if (room === 0) { setNotice({ kind, text: `Você já adicionou o máximo de ${maxPhotos} fotos complementares.` }); return; }
      if (selected.length > room) setNotice({ kind, text: `Só cabem mais ${room} foto${room > 1 ? "s" : ""}. As demais foram ignoradas.` });
      selected = selected.slice(0, room);
    } else {
      selected = selected.slice(0, 1);
    }

    setBusy(kind);
    const added: MediaDraft[] = [];
    let firstError: string | null = null;
    for (const file of selected) {
      const typeError = checkFileType(file, kind);
      if (typeError) { firstError ??= typeError; continue; }
      try {
        const prepared = kind === "video" ? prepareVideo(file, limits) : await prepareImage(file, limits);
        const url = URL.createObjectURL(prepared);
        blobs.current.add(url);
        added.push({ key: newKey(), kind, previewUrl: url, mime: detectMime(prepared), size: prepared.size, file: prepared, progress: 0 });
      } catch (e) {
        firstError ??= e instanceof Error ? e.message : "Não foi possível usar este arquivo.";
      }
    }
    setBusy(null);
    if (firstError) setNotice({ kind, text: firstError });
    if (added.length === 0) return;

    if (kind !== "photo") itemsRef.current.filter((p) => p.kind === kind).forEach(dropBlob);
    setItems((prev) => (kind === "photo" ? [...prev, ...added] : [...prev.filter((p) => p.kind !== kind), ...added]));
  }

  const remove = (d: MediaDraft) => {
    dropBlob(d);
    setItems((prev) => prev.filter((p) => p.key !== d.key));
    setNotice(null);
  };

  const noticeFor = (kind: MediaKind) =>
    notice?.kind === kind ? <p role="alert" className="text-xs font-medium text-destructive">{notice.text}</p> : null;

  const onInput = (kind: MediaKind) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    void pick(files, kind).finally(() => { e.target.value = ""; });
  };

  return (
    <div className="space-y-6">
      {allowPhotos && (
        <>
          {/* ── Foto principal ── */}
          <section className="space-y-2" aria-labelledby="camp-media-main">
            <div className="flex items-center justify-between gap-2">
              <h3 id="camp-media-main" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Foto principal {limits.require_main_photo ? <span className="text-destructive" aria-hidden="true">*</span> : <span className="font-medium normal-case tracking-normal">(opcional)</span>}
              </h3>
            </div>
            <input ref={mainRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={onInput("main_photo")} tabIndex={-1} aria-hidden="true" />
            {main ? (
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-2xl bg-muted">
                  {main.previewUrl ? (
                    <img src={main.previewUrl} alt="Pré-visualização da foto principal" className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <Missing text="O envio desta foto não foi concluído. Escolha a foto de novo ou remova." />
                  )}
                  {!disabled && (
                    <div className="absolute inset-x-2 bottom-2 flex justify-end gap-2">
                      <button type="button" className={MINI_BTN} onClick={() => mainRef.current?.click()} disabled={busy !== null} aria-label="Trocar a foto principal">
                        <RefreshCw size={14} /> Trocar
                      </button>
                      <button type="button" className={cn(MINI_BTN, "text-destructive")} onClick={() => remove(main)} aria-label="Remover a foto principal">
                        <Trash2 size={14} /> Remover
                      </button>
                    </div>
                  )}
                </div>
                <DraftStatus d={main} />
              </div>
            ) : (
              <button type="button" className={cn(SLOT, "h-36", mainRequiredError && "border-destructive/60 text-destructive")} onClick={() => mainRef.current?.click()} disabled={disabled || busy !== null}>
                {busy === "main_photo" ? <Loader2 size={26} className="animate-spin" /> : <Camera size={26} />}
                <span className="text-sm font-semibold">{busy === "main_photo" ? "Preparando foto…" : "Adicionar foto principal"}</span>
                <span className="text-[11px] opacity-80">JPG, PNG ou WebP · até {limits.max_photo_mb} MB</span>
              </button>
            )}
            {mainRequiredError && !main && <p role="alert" className="text-xs font-medium text-destructive">A foto principal é obrigatória nesta campanha.</p>}
            {noticeFor("main_photo")}
          </section>

          {/* ── Fotos complementares ── */}
          {maxPhotos > 0 && (
            <section className="space-y-2" aria-labelledby="camp-media-photos">
              <div className="flex items-center justify-between gap-2">
                <h3 id="camp-media-photos" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Fotos complementares <span className="font-medium normal-case tracking-normal">(opcional)</span>
                </h3>
                <span className="text-[11px] tabular-nums text-muted-foreground">{photos.length} de {maxPhotos}</span>
              </div>
              <input ref={photoRef} type="file" accept={IMAGE_ACCEPT} multiple className="hidden" onChange={onInput("photo")} tabIndex={-1} aria-hidden="true" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((p, i) => (
                  <div key={p.key} className="space-y-1.5">
                    <div className="relative overflow-hidden rounded-2xl bg-muted">
                      {p.previewUrl ? (
                        <img src={p.previewUrl} alt={`Pré-visualização da foto complementar ${i + 1}`} className="aspect-square w-full object-cover" />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center bg-yellow-50 p-2 text-center text-[11px] font-medium text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-200">
                          Envio não concluído
                        </div>
                      )}
                      {!disabled && (
                        <button type="button" onClick={() => remove(p)} aria-label={`Remover a foto complementar ${i + 1}`} className={cn(MINI_BTN, "absolute right-1.5 top-1.5 w-11 px-0 text-destructive")}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <DraftStatus d={p} />
                  </div>
                ))}
                {photos.length < maxPhotos && (
                  <button type="button" className={cn(SLOT, "aspect-square")} onClick={() => photoRef.current?.click()} disabled={disabled || busy !== null}>
                    {busy === "photo" ? <Loader2 size={24} className="animate-spin" /> : <ImagePlus size={24} />}
                    <span className="px-2 text-center text-xs font-semibold">{busy === "photo" ? "Preparando…" : "Adicionar foto"}</span>
                  </button>
                )}
              </div>
              {noticeFor("photo")}
            </section>
          )}
        </>
      )}

      {/* ── Vídeo ── */}
      {allowVideo && (
        <section className="space-y-2" aria-labelledby="camp-media-video">
          <h3 id="camp-media-video" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Vídeo <span className="font-medium normal-case tracking-normal">(opcional)</span>
          </h3>
          <input ref={videoRef} type="file" accept={VIDEO_ACCEPT} className="hidden" onChange={onInput("video")} tabIndex={-1} aria-hidden="true" />
          {video ? (
            <div className="space-y-2">
              <div className="relative overflow-hidden rounded-2xl bg-black">
                {video.previewUrl ? (
                  <video src={video.previewUrl} controls preload="metadata" playsInline className="aspect-video w-full bg-black" aria-label="Pré-visualização do vídeo" />
                ) : (
                  <Missing text="O envio deste vídeo não foi concluído. Escolha o vídeo de novo ou remova." />
                )}
              </div>
              {!disabled && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={cn(MINI_BTN, "border border-border")} onClick={() => videoRef.current?.click()} disabled={busy !== null} aria-label="Trocar o vídeo">
                    <RefreshCw size={14} /> Trocar vídeo
                  </button>
                  <button type="button" className={cn(MINI_BTN, "border border-border text-destructive")} onClick={() => remove(video)} aria-label="Remover o vídeo">
                    <Trash2 size={14} /> Remover
                  </button>
                  {video.size > 0 && <span className="self-center text-[11px] text-muted-foreground">{formatBytes(video.size)}</span>}
                </div>
              )}
              <DraftStatus d={video} />
            </div>
          ) : (
            <button type="button" className={cn(SLOT, "h-28")} onClick={() => videoRef.current?.click()} disabled={disabled || busy !== null}>
              {busy === "video" ? <Loader2 size={24} className="animate-spin" /> : <VideoIcon size={24} />}
              <span className="text-sm font-semibold">{busy === "video" ? "Preparando vídeo…" : "Adicionar vídeo"}</span>
              <span className="text-[11px] opacity-80">MP4, WebM ou MOV · até {limits.max_video_mb} MB</span>
            </button>
          )}
          {noticeFor("video")}
        </section>
      )}
    </div>
  );
}
