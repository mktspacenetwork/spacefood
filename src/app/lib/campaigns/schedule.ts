import { fromInputValue, toInputValue } from "./format";
import type { PeriodPayload } from "./types";

/**
 * Cronograma da campanha (rodada 5): até três datas independentes, em sequência estrita quando há votação.
 *   1. Participação — `start`..`end` (abre às 00:00 do início, fecha no fim do dia do encerramento, Brasília);
 *   2. Votação — `vstart`..`vend` (mesma regra de horário), só depois do fim da participação;
 *   3. Divulgação do resultado — `announce` (data e hora), só depois do fim da votação (opcional).
 * Campanhas ANTIGAS têm janela única: a votação acompanha a participação (mesmas datas). Nelas `ownVoting` é false e o
 * front NÃO envia `voting_*` — o servidor espelha a votação na participação, exatamente como antes. Só se envia
 * `voting_*` quando a campanha usa datas próprias de votação.
 */
export type ScheduleValues = {
  start: string; // yyyy-MM-dd
  end: string; // yyyy-MM-dd
  vstart: string; // yyyy-MM-dd (só com `ownVoting`)
  vend: string; // yyyy-MM-dd (só com `ownVoting`)
  announce: string; // yyyy-MM-ddTHH:mm (Brasília); "" = sem data de divulgação
  /** A votação tem datas próprias? false = campanha antiga (janela única): a votação acompanha a participação. */
  ownVoting: boolean;
};

export const EMPTY_SCHEDULE: ScheduleValues = { start: "", end: "", vstart: "", vend: "", announce: "", ownVoting: true };

/** O que está gravado no servidor: valores do formulário + os instantes originais (para não reescrever horários sem querer). */
export type SavedSchedule = {
  values: ScheduleValues;
  iso: { start: string | null; end: string | null; vstart: string | null; vend: string | null; announce: string | null };
  /** Campanha com votação e janela única (votação com as MESMAS datas da participação). */
  legacy: boolean;
};

type StageLike = { stage_key: string; starts_at: string | null; ends_at: string | null };

export const dateOf = (iso: string | null | undefined) => (iso ? toInputValue(iso).slice(0, 10) : "");
export const startIso = (d: string) => fromInputValue(d ? `${d}T00:00` : "");
export const endIso = (d: string) => fromInputValue(d ? `${d}T23:59:59` : "");

const sameInstant = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && new Date(a).getTime() === new Date(b).getTime();

/** yyyy-MM-dd + n dias (aritmética em UTC: não depende do fuso do aparelho). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Valores do formulário a partir das etapas e da data de divulgação gravadas. */
export function scheduleFromServer(stages: StageLike[], announceAt: string | null | undefined, hasVoting: boolean): SavedSchedule {
  const reg = stages.find((s) => s.stage_key === "registration");
  const vot = stages.find((s) => s.stage_key === "voting");
  const legacy = hasVoting && sameInstant(reg?.starts_at, vot?.starts_at) && sameInstant(reg?.ends_at, vot?.ends_at);
  const own = !legacy;
  const values: ScheduleValues = {
    start: dateOf(reg?.starts_at),
    end: dateOf(reg?.ends_at),
    vstart: own && hasVoting ? dateOf(vot?.starts_at) : "",
    vend: own && hasVoting ? dateOf(vot?.ends_at) : "",
    announce: hasVoting && announceAt ? toInputValue(announceAt) : "",
    ownVoting: own,
  };
  return {
    values, legacy,
    iso: {
      start: reg?.starts_at ?? null, end: reg?.ends_at ?? null,
      vstart: own && hasVoting ? vot?.starts_at ?? null : null, vend: own && hasVoting ? vot?.ends_at ?? null : null,
      announce: hasVoting ? announceAt ?? null : null,
    },
  };
}

// ───────────────────────────── Validação ─────────────────────────────

export type ScheduleBlock = "participation" | "voting" | "announce";
/** `missing` = falta preencher; `invalid` = valor fora de ordem ou inválido. */
export type ScheduleIssue = { block: ScheduleBlock; kind: "missing" | "invalid"; message: string };
export type ScheduleWarning = { block: "voting" | "announce"; message: string };
export type ScheduleCheck = { issue: ScheduleIssue | null; warnings: ScheduleWarning[] };

/** Mensagens iguais às do servidor (`INVALID_DATES`). */
export const MSG = {
  regPair: "Informe o início e o encerramento das participações (ou deixe os dois em branco por enquanto).",
  regFirst: "Defina primeiro o início e o encerramento das participações.",
  regOrder: "O encerramento das participações precisa ser depois do início.",
  votingPair: "Informe o início e o encerramento da votação.",
  votingOrder: "O encerramento da votação precisa ser depois do início.",
  votingAfterReg: "A votação só pode começar depois do fim da participação.",
  announceInvalid: "Escolha uma data e hora válidas para a divulgação.",
  announceAfterVoting: "A divulgação deve ser depois do fim da votação.",
  announceFuture: "A data de divulgação precisa ser no futuro.",
  gapVoting: "Sem intervalo entre a participação e a votação: receitas enviadas no último dia podem não ser analisadas a tempo.",
  gapAnnounce: "Pouco tempo entre o fim da votação e a divulgação: a divulgação automática só acontece se o ganhador já estiver confirmado antes dessa data.",
} as const;

const GAP_MS = 60 * 60 * 1000;
const NO_CHECK: ScheduleCheck = { issue: null, warnings: [] };

/**
 * Valida a sequência participação → votação → divulgação. Devolve o primeiro problema (que bloqueia) e avisos que
 * NÃO bloqueiam (sem intervalo entre as etapas).
 * Só avalia a ordem das datas que MUDARAM em relação ao que está gravado (`saved`): abrir e salvar uma campanha antiga,
 * sem mexer nas datas, nunca é bloqueado por regras novas.
 */
export function validateSchedule(v: ScheduleValues, hasVoting: boolean, saved?: SavedSchedule | null, now: number = Date.now()): ScheduleCheck {
  const sv = saved?.values;
  const changed = (...keys: (keyof ScheduleValues)[]) => !sv || keys.some((k) => v[k] !== sv[k]);
  const issue = (block: ScheduleBlock, kind: ScheduleIssue["kind"], message: string): ScheduleCheck => ({ issue: { block, kind, message }, warnings: [] });
  const ownVoting = hasVoting && v.ownVoting;

  if (!!v.start !== !!v.end) return issue("participation", "missing", MSG.regPair);
  if (!v.start) {
    const later = hasVoting && (v.announce || (ownVoting && (v.vstart || v.vend)));
    return later ? issue("participation", "missing", MSG.regFirst) : NO_CHECK;
  }
  const s = startIso(v.start);
  const e = endIso(v.end);
  if (!s || !e || new Date(e).getTime() <= new Date(s).getTime()) return issue("participation", "invalid", MSG.regOrder);
  if (!hasVoting) return NO_CHECK;

  const warnings: ScheduleWarning[] = [];
  let votingEnd = e; // janela única: a votação termina com a participação
  if (ownVoting) {
    // Início fora de ordem já é avisado antes de preencher o encerramento da votação.
    const vsEarly = v.vstart ? startIso(v.vstart) : null;
    if (vsEarly && changed("end", "vstart") && new Date(vsEarly).getTime() <= new Date(e).getTime()) return issue("voting", "invalid", MSG.votingAfterReg);
    if (!v.vstart || !v.vend) return issue("voting", "missing", MSG.votingPair);
    const vs = startIso(v.vstart);
    const ve = endIso(v.vend);
    if (!vs || !ve || new Date(ve).getTime() <= new Date(vs).getTime()) return issue("voting", "invalid", MSG.votingOrder);
    if (changed("end", "vstart", "vend") && new Date(vs).getTime() <= new Date(e).getTime()) return issue("voting", "invalid", MSG.votingAfterReg);
    if (new Date(vs).getTime() > new Date(e).getTime() && new Date(vs).getTime() - new Date(e).getTime() < GAP_MS) {
      warnings.push({ block: "voting", message: MSG.gapVoting });
    }
    votingEnd = ve;
  }

  if (v.announce) {
    const at = fromInputValue(v.announce);
    if (!at) return issue("announce", "invalid", MSG.announceInvalid);
    const atMs = new Date(at).getTime();
    if (changed("announce", "end", "vstart", "vend") && atMs <= new Date(votingEnd).getTime()) return issue("announce", "invalid", MSG.announceAfterVoting);
    if (changed("announce") && atMs < now + 60_000) return issue("announce", "invalid", MSG.announceFuture);
    if (atMs > new Date(votingEnd).getTime() && atMs - new Date(votingEnd).getTime() < GAP_MS) {
      warnings.push({ block: "announce", message: MSG.gapAnnounce });
    }
  }
  return { issue: null, warnings };
}

/** Atalho: só a mensagem do problema que bloqueia (ou null). */
export const scheduleError = (c: ScheduleCheck): string | null => c.issue?.message ?? null;

// ───────────────────────────── Envio ─────────────────────────────

/** Mantém o instante gravado quando o dia não mudou (não reescreve horários que a pessoa não editou). */
function keepOrMake(day: string, savedDay: string | undefined, savedIso: string | null | undefined, make: (d: string) => string | null): string | null {
  if (!day) return null;
  if (savedIso && savedDay !== undefined && day === savedDay) return savedIso;
  return make(day);
}

/**
 * Corpo do `PUT /period`; null quando as datas ainda não estão completas. Sem votação não envia votação nem divulgação
 * (o servidor limpa). Votação com `ownVoting`: envia `voting_*`; campanha antiga (janela única) NÃO envia `voting_*`:
 * o servidor espelha a votação na participação.
 */
export function periodPayload(v: ScheduleValues, hasVoting: boolean, saved?: SavedSchedule | null): PeriodPayload | null {
  const sv = saved?.values;
  const si = saved?.iso;
  const starts_at = keepOrMake(v.start, sv?.start, si?.start, startIso);
  const ends_at = keepOrMake(v.end, sv?.end, si?.end, endIso);
  if (!starts_at || !ends_at) return null;
  if (!hasVoting) return { starts_at, ends_at };
  const base: PeriodPayload = { starts_at, ends_at, announce_at: v.announce ? fromInputValue(v.announce) : null };
  if (!v.ownVoting) return base;
  const voting_starts_at = keepOrMake(v.vstart, sv?.vstart, si?.vstart, startIso);
  const voting_ends_at = keepOrMake(v.vend, sv?.vend, si?.vend, endIso);
  if (!voting_starts_at || !voting_ends_at) return null;
  return { ...base, voting_starts_at, voting_ends_at };
}

/** Os dois conjuntos de valores são equivalentes? (para saber se há algo a salvar) */
export function sameSchedule(a: ScheduleValues, b: ScheduleValues, hasVoting: boolean): boolean {
  if (a.start !== b.start || a.end !== b.end) return false;
  if (!hasVoting) return true;
  if (a.announce !== b.announce || a.ownVoting !== b.ownVoting) return false;
  return !a.ownVoting || (a.vstart === b.vstart && a.vend === b.vend);
}

// ───────────────────────────── Limites dos campos ─────────────────────────────

/** Atributos `min` dos campos (travam datas fora de ordem no seletor). `undefined` = sem limite. */
export function scheduleMins(v: ScheduleValues, hasVoting: boolean): { end?: string; vstart?: string; vend?: string; announce?: string } {
  const votingEndDay = hasVoting && v.ownVoting ? v.vend : v.end;
  return {
    end: v.start || undefined,
    vstart: v.end ? addDays(v.end, 1) : undefined,
    vend: v.vstart || undefined,
    announce: votingEndDay ? `${addDays(votingEndDay, 1)}T00:00` : undefined,
  };
}
