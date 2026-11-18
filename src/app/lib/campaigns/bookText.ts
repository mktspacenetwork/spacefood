/**
 * Texto das receitas do Livro: o cadastro guarda ingredientes e modo de preparo como texto livre, com as
 * quebras de linha que a pessoa digitou. Aqui eles viram LISTA (ingredientes) e ETAPAS (preparo), do mesmo
 * jeito no leitor da tela e no PDF. O texto original nunca é alterado nem cortado: só é fatiado para exibir.
 */

import type { BookRecipe, RecipeBookView } from "./types";

/** Marcadores de lista que as pessoas digitam à mão: "- ", "• ", "* ", "– ". */
const BULLET = /^\s*(?:[-•*·–—▪●◦]|•)\s+/;
/** Numeração que a pessoa já digitou: "1.", "2)", "3 -", "Passo 4:" */
const NUMBERING = /^\s*(?:passo\s+)?\d{1,2}\s*(?:[.):\-–—])\s+/i;

function lines(text: string): string[] {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
}

/** Ingredientes: uma linha = um item. Linhas vazias saem; marcadores digitados à mão são removidos. */
export function ingredientItems(text: string): string[] {
  return lines(text)
    .map((l) => l.replace(BULLET, "").trim())
    .filter((l) => l.length > 0);
}

/**
 * Modo de preparo em etapas.
 * - Com linhas em branco entre blocos: cada bloco é uma etapa (quebras de linha dentro do bloco ficam).
 * - Sem linhas em branco: cada linha é uma etapa.
 * - A numeração digitada à mão ("1.", "2)") é removida: o leitor e o PDF numeram sozinhos.
 * Um texto de um bloco só vira UMA etapa (`numbered` = false: aparece como parágrafo, sem "1.").
 */
export function preparationSteps(text: string): { steps: string[]; numbered: boolean } {
  const raw = lines(text);
  const hasBlank = raw.some((l, i) => l.trim() === "" && i > 0 && i < raw.length - 1 && raw.slice(0, i).some((x) => x.trim() !== ""));
  let steps: string[];
  if (hasBlank) {
    const blocks: string[][] = [];
    let cur: string[] = [];
    for (const l of raw) {
      if (l.trim() === "") {
        if (cur.length) { blocks.push(cur); cur = []; }
      } else {
        cur.push(l.trim());
      }
    }
    if (cur.length) blocks.push(cur);
    steps = blocks.map((b) => b.join("\n"));
  } else {
    steps = raw.map((l) => l.trim()).filter((l) => l.length > 0);
  }
  steps = steps.map((s) => s.replace(NUMBERING, "").replace(BULLET, "").trim()).filter((s) => s.length > 0);
  return { steps, numbered: steps.length > 1 };
}

/** Parágrafos da história (linhas em branco separam parágrafos; quebras simples ficam). */
export function storyParagraphs(text: string): string[] {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ───────────────────────── Livro (leitor e PDF) ─────────────────────────

/** O leitor e o gerador de PDF trabalham com o livro único (acervo). */
export type AnyBook = RecipeBookView;

/** Título/subtítulo/capa do livro, no mesmo formato para a tela e para o PDF. */
export function describeBook(book: AnyBook): { title: string; subtitle: string; coverUrl: string | null; generatedAt: string } {
  return { title: book.title || "Livro de Receitas", subtitle: "Receitas das campanhas SpaceFood", coverUrl: null, generatedAt: book.generated_at };
}

/** Nome da campanha de origem (só as receitas do acervo trazem). */
export function recipeCampaign(r: BookRecipe): string | null {
  const c = (r as { campaign_name?: string | null }).campaign_name;
  return c && c.trim() ? c.trim() : null;
}

/** Para buscas: sem acento, minúsculas e sem espaços nas pontas. */
export function normText(s: string): string {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
