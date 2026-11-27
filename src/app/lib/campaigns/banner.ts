/**
 * Capa da campanha = banner da Home (uma imagem só, sem cadastro duplicado).
 *
 * Segue o mesmo padrão do menu Admin → Banners: UMA imagem para todos os aparelhos, sem recorte fixo.
 * O carrossel da Home mostra cada slide numa caixa com proporção responsiva e `object-cover`:
 *   celular `aspect-[2/1]` · tablet `md:aspect-[3/1]` · computador `lg:aspect-[3.5/1]`.
 * Como nos banners comuns, quem ajusta o enquadramento é o CSS (a partir da imagem inteira) — aqui a imagem só é
 * reduzida e comprimida para carregar rápido; as proporções originais são preservadas.
 */
export const BANNER_MAX_WIDTH = 1920;
/** Abaixo disto a imagem fica sem nitidez no banner do computador. */
export const BANNER_MIN_SOURCE_WIDTH = 1200;

/** Classes que a Home usa para o banner — a prévia do formulário usa exatamente as mesmas. */
export const BANNER_BOX_CLASSES = "aspect-[2/1] md:aspect-[3/1] lg:aspect-[3.5/1]";
/** Posição padrão dos banners comuns na Home (`BannerCarousel`): o mesmo valor vale para a prévia. */
export const BANNER_OBJECT_POSITION = "center right";

/**
 * Reduz (no máximo 1920 px de largura) e comprime a imagem em JPEG, mantendo a proporção original.
 * Devolve também a largura original, para avisar quando a imagem é pequena demais.
 */
export function prepareCover(file: File): Promise<{ file: File; srcWidth: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      if (!sw || !sh) {
        reject(new Error("Não foi possível ler a imagem. Use JPG, PNG ou WebP."));
        return;
      }
      const ow = Math.min(BANNER_MAX_WIDTH, sw);
      const oh = Math.max(1, Math.round((sh * ow) / sw));

      const canvas = document.createElement("canvas");
      canvas.width = ow;
      canvas.height = oh;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Não foi possível preparar a imagem neste aparelho."));
        return;
      }
      // JPEG não tem transparência: fundo branco evita áreas pretas em PNG/WebP com alfa.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, ow, oh);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, ow, oh);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Falha ao preparar a imagem."));
            return;
          }
          resolve({ file: new File([blob], "capa.jpg", { type: "image/jpeg", lastModified: Date.now() }), srcWidth: sw });
        },
        "image/jpeg",
        0.86,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem. Use JPG, PNG ou WebP."));
    };
    img.src = url;
  });
}

// ───────────────────── Texto do banner (mesmo modelo do menu Banners) ─────────────────────

/**
 * Texto por cima da imagem do banner da campanha — as MESMAS opções do menu Banners (título, descrição, texto do
 * botão, fundo e cor do texto). Fica em `campaigns.visibility.banner` (sem coluna nova): é livre de editar mesmo com a
 * campanha publicada e é copiado ao duplicar. Tudo opcional; campanha SEM texto configurado segue como sempre
 * (só a imagem, ou o nome sobre o laranja quando não há imagem).
 */
export type BannerText = {
  title?: string;
  description?: string;
  button_text?: string;
  /** Cor (#RGB, #RRGGBB, #RRGGBBAA) ou degradê (`linear-gradient(...)`). */
  background?: string;
  /** Cor do texto (#RGB, #RRGGBB, #RRGGBBAA). */
  text_color?: string;
};

/** Limites iguais aos da API (`sanitizeBanner` em `campaigns-api/index.ts`). */
export const BANNER_TEXT_LIMITS = { title: 80, description: 200, button_text: 30, background: 200 } as const;
/** Padrões da campanha: laranja do site com texto branco. */
export const BANNER_DEFAULT_BG = "#FF5A1F";
export const BANNER_DEFAULT_TEXT = "#FFFFFF";
/** Rótulo do botão quando a participação está aberta e o texto do botão fica vazio. O botão leva à página da campanha. */
export const BANNER_DEFAULT_CTA = "Ver campanha";
/** Com texto, a lateral esquerda da imagem esmaece para o texto ficar legível (mesma máscara dos banners comuns). */
export const BANNER_TEXT_MASK = "linear-gradient(to right, transparent 0%, black 60%)";
/** Os mesmos degradês prontos do menu Banners. */
export const BANNER_GRADIENT_PRESETS = [
  "linear-gradient(to right, #ff512f, #dd2476)",
  "linear-gradient(to right, #4facfe, #00f2fe)",
  "linear-gradient(to right, #43e97b, #38f9d7)",
  "linear-gradient(to right, #fa709a, #fee140)",
  "linear-gradient(to right, #89f7fe, #66a6ff)",
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
] as const;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// Degradê seguro: só `linear-gradient(` + cores/porcentagens/ângulos; nada de url(), ponto e vírgula, aspas ou barras.
const SAFE_GRADIENT = /^linear-gradient\([#0-9a-zA-Z%.,()\s-]+\)$/;
export const isHexColor = (v: unknown): v is string => typeof v === "string" && HEX_COLOR.test(v.trim());
export const isSafeBackground = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t.length <= BANNER_TEXT_LIMITS.background && (HEX_COLOR.test(t) || (SAFE_GRADIENT.test(t) && !/(url|expression|var|attr|env|image-set)\s*\(/i.test(t)));
};

/**
 * Cor do texto do botão (o botão usa a cor do texto como fundo e a cor do FUNDO do banner como texto, como nos banners
 * comuns). Com degradê usa a primeira cor dele, já que `color` não aceita degradê.
 */
export function bannerPillTextColor(background: string | undefined): string {
  const bg = background || BANNER_DEFAULT_BG;
  if (HEX_COLOR.test(bg)) return bg;
  return bg.match(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})/i)?.[0] ?? BANNER_DEFAULT_BG;
}

/** Normaliza o que veio do servidor/formulário: só campos válidos, textos aparados; vazio some. */
export function readBannerText(raw: unknown): BannerText {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: BannerText = {};
  for (const k of ["title", "description", "button_text"] as const) {
    const v = typeof r[k] === "string" ? (r[k] as string).trim().slice(0, BANNER_TEXT_LIMITS[k]) : "";
    if (v) out[k] = v;
  }
  if (isSafeBackground(r.background)) out.background = r.background.trim();
  if (isHexColor(r.text_color)) out.text_color = r.text_color.trim();
  return out;
}

/** Tem algum TEXTO configurado (título, descrição ou botão)? Só cores não contam. */
export const bannerHasText = (b: BannerText | undefined): boolean => !!(b && (b.title || b.description || b.button_text));
