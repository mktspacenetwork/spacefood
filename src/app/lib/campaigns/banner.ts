/**
 * Capa da campanha = banner da Home (uma imagem só, sem cadastro duplicado).
 *
 * O carrossel da Home mostra cada slide numa caixa com proporção responsiva e `object-cover`:
 *   celular `aspect-[2/1]` · tablet `md:aspect-[3/1]` · computador `lg:aspect-[3.5/1]`.
 * A capa é guardada na proporção "mestre" 3:1 (a do meio), então o corte lateral/vertical nas outras telas é pequeno.
 */
export const BANNER_RATIO = 3; // largura / altura
export const BANNER_MAX_WIDTH = 1500; // 1500 × 500 px
export const BANNER_MAX_HEIGHT = BANNER_MAX_WIDTH / BANNER_RATIO;
/** Abaixo disto a imagem fica sem nitidez no banner do computador. */
export const BANNER_MIN_SOURCE_WIDTH = 900;

/** Classes que a Home usa para o banner — a prévia do formulário usa exatamente as mesmas. */
export const BANNER_BOX_CLASSES = "aspect-[2/1] md:aspect-[3/1] lg:aspect-[3.5/1]";

/**
 * Corta a imagem ao centro na proporção 3:1 e reduz para no máximo 1500×500, em JPEG.
 * Devolve também a largura original, para avisar quando a imagem é pequena demais.
 */
export function cropToBanner(file: File): Promise<{ file: File; srcWidth: number }> {
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
      // maior retângulo 3:1 que cabe na imagem, centralizado
      let cw = sw;
      let ch = Math.round(sw / BANNER_RATIO);
      if (ch > sh) {
        ch = sh;
        cw = Math.round(sh * BANNER_RATIO);
      }
      const sx = Math.round((sw - cw) / 2);
      const sy = Math.round((sh - ch) / 2);
      const ow = Math.min(BANNER_MAX_WIDTH, cw);
      const oh = Math.round(ow / BANNER_RATIO);

      const canvas = document.createElement("canvas");
      canvas.width = ow;
      canvas.height = oh;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Não foi possível preparar a imagem neste aparelho."));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, cw, ch, 0, 0, ow, oh);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Falha ao preparar a imagem."));
            return;
          }
          resolve({ file: new File([blob], "capa.jpg", { type: "image/jpeg", lastModified: Date.now() }), srcWidth: sw });
        },
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem. Use JPG, PNG ou WebP."));
    };
    img.src = url;
  });
}
