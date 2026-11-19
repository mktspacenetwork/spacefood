import { useEffect, useRef } from "react";

// Regra ÚNICA de ranking (admin e colaborador usam a mesma): posição de COMPETIÇÃO.
// Receitas com os mesmos votos dividem o lugar e a seguinte "pula" (1º, 1º, 3º). O servidor também manda `position`,
// mas a tela recalcula a partir dos votos para nunca divergir (e para funcionar com a API antiga, que mandava i + 1).

export type Ranked<T> = { item: T; position: number; tied: boolean };

/** Ordena por votos (maior primeiro), mantém a ordem recebida nos empates e calcula a posição de competição. */
export function rankPositions<T extends { votes: number }>(items: T[]): Ranked<T>[] {
  const sorted = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => b.item.votes - a.item.votes || a.i - b.i)
    .map((x) => x.item);
  const out: Ranked<T>[] = [];
  sorted.forEach((item, k) => {
    const position = k > 0 && item.votes === sorted[k - 1].votes ? out[k - 1].position : k + 1;
    out.push({ item, position, tied: false });
  });
  const sameCount = new Map<number, number>();
  out.forEach((r) => sameCount.set(r.position, (sameCount.get(r.position) ?? 0) + 1));
  return out.map((r) => ({ ...r, tied: (sameCount.get(r.position) ?? 0) > 1 }));
}

export const totalVotes = (items: { votes: number }[]): number => items.reduce((acc, i) => acc + i.votes, 0);

/** "1º". Sem nenhum voto na campanha não existe posição: devolve "—" (a tela mostra "sem votos"). */
export const positionLabel = (position: number, anyVotes = true): string => (anyVotes ? `${position}º` : "—");

/**
 * Quantas linhas formam o "resumo do topo": todas as que estão até a posição `maxPosition` (um empate no 3º lugar entra
 * inteiro), com teto `cap` para a lista não crescer sem limite. Sem votos, o resumo é vazio.
 */
export function topCount(ranked: Ranked<{ votes: number }>[], maxPosition = 3, cap = 5): number {
  if (ranked.length === 0 || ranked.every((r) => r.item.votes === 0)) return 0;
  return Math.min(cap, ranked.filter((r) => r.position <= maxPosition).length);
}

/** Compara duas listas de ranking (só o que a tela mostra) para evitar re-render quando nada mudou. */
export function sameRanking(
  a: { submission_id: string; votes: number }[] | undefined | null,
  b: { submission_id: string; votes: number }[] | undefined | null,
): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((x, i) => x.submission_id === b[i].submission_id && x.votes === b[i].votes);
}

/**
 * Executa `fn` a cada `ms` (com sorteio de ±`jitter` para as pessoas não baterem no servidor ao mesmo tempo), mas SÓ com a
 * aba visível. Ao voltar para a aba, atualiza na hora se já passou o intervalo. `enabled=false` desliga tudo.
 */
export function useVisibleInterval(fn: () => void, ms: number, enabled = true, jitter = 0.15): void {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    let last = Date.now();
    const next = () => Math.max(1000, ms * (1 + (Math.random() * 2 - 1) * jitter));
    const tick = () => {
      if (document.visibilityState === "visible") { last = Date.now(); ref.current(); }
      timer = window.setTimeout(tick, next());
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= ms) { last = Date.now(); ref.current(); }
    };
    timer = window.setTimeout(tick, next());
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [ms, enabled, jitter]);
}
