import { plural } from "../../../lib/campaigns/format";
import type { BookAudience } from "../../../lib/campaigns/types";

/** Padrão do servidor quando o público nunca foi definido: todos os colaboradores. */
export const AUDIENCE_ALL: BookAudience = { mode: "all", user_ids: [] };

/** Quem vê, em poucas palavras: "Todos os colaboradores" / "3 pessoas". */
export function audienceSummary(a: BookAudience): string {
  return a.mode === "all" ? "Todos os colaboradores" : plural(a.user_ids.length, "pessoa", "pessoas");
}

/** Em frase: "todos os colaboradores" / "3 pessoas" ("Publicado para …"). */
export function audiencePhrase(a: BookAudience): string {
  return a.mode === "all" ? "todos os colaboradores" : plural(a.user_ids.length, "pessoa", "pessoas");
}

/** "para todos" / "para 3 pessoas" (botão de publicar). */
export function audienceForButton(a: BookAudience): string {
  return a.mode === "all" ? "todos" : plural(a.user_ids.length, "pessoa", "pessoas");
}

export function sameAudience(a: BookAudience, b: BookAudience): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === "all") return true;
  if (a.user_ids.length !== b.user_ids.length) return false;
  const set = new Set(b.user_ids);
  return a.user_ids.every((id) => set.has(id));
}

/** "Pessoas específicas" sem ninguém: o servidor recusa (AUDIENCE_EMPTY) e a tela não deixa publicar nem salvar. */
export function audienceEmpty(a: BookAudience): boolean {
  return a.mode === "users" && a.user_ids.length === 0;
}

/** Alguém que vê hoje deixaria de ver com o novo público? */
export function someoneLeaves(current: BookAudience, next: BookAudience): boolean {
  if (next.mode === "all") return false;
  if (current.mode === "all") return true;
  const keep = new Set(next.user_ids);
  return current.user_ids.some((id) => !keep.has(id));
}

/** Alguém que não vê hoje passaria a ver com o novo público? */
export function someoneJoins(current: BookAudience, next: BookAudience): boolean {
  if (current.mode === "all") return false;
  if (next.mode === "all") return true;
  const have = new Set(current.user_ids);
  return next.user_ids.some((id) => !have.has(id));
}
