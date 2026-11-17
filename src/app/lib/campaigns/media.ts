import { compressImage } from "../image-compress";
import type { MediaLimits } from "./types";

export type MediaKind = "main_photo" | "photo" | "video";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");
export const VIDEO_ACCEPT = VIDEO_TYPES.join(",");

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

/** Alguns navegadores deixam `file.type` vazio (ex.: .mov no Windows): cai para a extensão. */
export function detectMime(file: File): string {
  const t = (file.type || "").toLowerCase();
  if (t) return t;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Mensagem de erro (PT-BR) se o tipo do arquivo não serve para esse espaço; null se ok. */
export function checkFileType(file: File, kind: MediaKind): string | null {
  const mime = detectMime(file);
  if (kind === "video") {
    if (!(VIDEO_TYPES as readonly string[]).includes(mime)) {
      return "Formato de vídeo não aceito. Envie um arquivo MP4, WebM ou MOV.";
    }
    return null;
  }
  if (!(IMAGE_TYPES as readonly string[]).includes(mime)) {
    return mime.startsWith("image/")
      ? "Formato de imagem não aceito (como HEIC). Envie uma foto em JPG, PNG ou WebP."
      : "Esse arquivo não é uma imagem. Envie uma foto em JPG, PNG ou WebP.";
  }
  return null;
}

/**
 * Prepara uma foto para envio: reduz (máx. 1600 px) e reencoda em JPEG para poupar dados do celular.
 * Lança Error com mensagem pronta para o usuário.
 */
export async function prepareImage(file: File, limits: MediaLimits): Promise<File> {
  const mime = detectMime(file);
  const base = file.type === mime ? file : new File([file], file.name, { type: mime });
  const maxBytes = limits.max_photo_mb * 1024 * 1024;

  let out: File = base;
  try {
    out = await compressImage(base, { maxSize: 1600, outputType: "image/jpeg", quality: 0.85 });
  } catch {
    throw new Error("Não foi possível ler esta imagem. Use um arquivo JPG, PNG ou WebP.");
  }
  // Se a "compressão" não ajudou e o original já cabe no limite, mantém o original.
  if (out.size > base.size && base.size <= maxBytes) out = base;

  if (out.size > maxBytes) {
    throw new Error(`A foto tem ${formatBytes(out.size)} e o limite é ${limits.max_photo_mb} MB. Escolha uma foto menor.`);
  }
  const type = out.type || mime;
  return new File([out], out.name, { type });
}

/** Vídeo não é reprocessado no navegador: só confere tamanho e padroniza o tipo. */
export function prepareVideo(file: File, limits: MediaLimits): File {
  const mime = detectMime(file);
  const maxBytes = limits.max_video_mb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`O vídeo tem ${formatBytes(file.size)} e o limite é ${limits.max_video_mb} MB. Grave um vídeo mais curto ou em qualidade menor.`);
  }
  return file.type === mime ? file : new File([file], file.name, { type: mime });
}
