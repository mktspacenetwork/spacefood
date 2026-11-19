// Salvar/compartilhar um arquivo gerado no aparelho (ex.: PDF do Livro de Receitas).
//
// Computador, Android e iPhone no Safari: download normal por <a download>.
// iPhone com o app INSTALADO (PWA em tela cheia): o download automático depois de uma espera longa costuma ser
// ignorado e `window.open` pode prender o app sem botão de voltar. Por isso o fluxo tem DOIS toques: o PDF é montado,
// a tela mostra "PDF pronto" e o segundo toque (gesto novo do usuário) chama `navigator.share({ files })`; sem essa
// API, o botão vira um link <a target="_blank"> comum.

/** iPhone, iPad e iPod (o iPadOS novo se apresenta como "MacIntel" com tela de toque). */
export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/** O app está aberto em tela cheia (instalado na tela inicial), não numa aba do navegador. */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || !!window.matchMedia?.("(display-mode: standalone)").matches;
}

/** Só no iPhone/iPad com o app instalado o salvamento exige um segundo toque do usuário. */
export function needsSecondTap(): boolean {
  return isIosDevice() && isStandalonePwa();
}

/** O navegador consegue compartilhar este arquivo (folha de compartilhamento do sistema)? */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type ShareOutcome = "shared" | "cancelled" | "failed";

/**
 * Abre a folha de compartilhamento com o arquivo. PRECISA ser chamada direto de um toque (sem `await` antes):
 * o iOS só aceita `share` dentro do gesto do usuário.
 */
export function shareFile(file: File, title: string): Promise<ShareOutcome> {
  try {
    return navigator.share({ files: [file], title }).then(
      () => "shared" as const,
      (e: unknown) => ((e as { name?: string })?.name === "AbortError" ? ("cancelled" as const) : ("failed" as const)),
    );
  } catch {
    return Promise.resolve("failed");
  }
}

/** Dispara o download de um endereço `blob:` pelo método padrão (<a download>). */
export function downloadViaAnchor(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Nome do arquivo com a data de hoje (horário de Brasília). Ex.: `livro-de-receitas-spacefood-2026-11-18.pdf`. */
export function pdfFileName(now: Date = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `livro-de-receitas-spacefood-${day}.pdf`;
}
