import { compressImage } from "../image-compress";

/**
 * A participação em campanha usa UMA foto da receita pronta (sem vídeo, sem fotos extras).
 * Só aceitamos JPG/PNG/WebP: ao restringir o `accept` do <input>, o iOS converte HEIC em JPEG sozinho.
 */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");

/** Limite padrão (MB) quando a campanha não informa outro. */
export const DEFAULT_PHOTO_MB = 5;

const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Alguns navegadores deixam `file.type` vazio: cai para a extensão. */
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

/** Mensagem (PT-BR) se o arquivo não serve como foto; null se ok. */
export function checkImage(file: File): string | null {
  const mime = detectMime(file);
  if (!(IMAGE_TYPES as readonly string[]).includes(mime)) {
    return mime.startsWith("image/")
      ? "Esse formato de foto não é aceito (como HEIC). Use JPG, PNG ou WebP."
      : "Esse arquivo não é uma foto. Use JPG, PNG ou WebP.";
  }
  return null;
}

/**
 * Prepara a foto para envio: reduz (máx. 1600 px) e reencoda em JPEG para poupar dados do celular.
 * Lança Error com mensagem pronta para a pessoa.
 */
export async function prepareImage(file: File, limit: { max_photo_mb: number } = { max_photo_mb: DEFAULT_PHOTO_MB }): Promise<File> {
  const mime = detectMime(file);
  const base = file.type === mime ? file : new File([file], file.name, { type: mime });
  const maxBytes = limit.max_photo_mb * 1024 * 1024;

  let out: File = base;
  try {
    out = await compressImage(base, { maxSize: 1600, outputType: "image/jpeg", quality: 0.85 });
  } catch {
    throw new Error("Não foi possível ler esta foto. Tente outra em JPG, PNG ou WebP.");
  }
  // Se a "compressão" não ajudou e o original já cabe no limite, mantém o original.
  if (out.size > base.size && base.size <= maxBytes) out = base;

  if (out.size > maxBytes) {
    throw new Error(`A foto tem ${formatBytes(out.size)} e o limite é ${limit.max_photo_mb} MB. Escolha uma foto menor.`);
  }
  const type = out.type || mime;
  return new File([out], out.name, { type });
}
