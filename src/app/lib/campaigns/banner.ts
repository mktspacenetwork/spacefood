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
 * Largura original da imagem (sem reenviar nem converter nada), para avisar quando ela é pequena demais para o banner.
 * Devolve `null` se o navegador não conseguir ler o arquivo (o aviso simplesmente não aparece).
 */
export function readImageWidth(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img.naturalWidth || null); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

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
