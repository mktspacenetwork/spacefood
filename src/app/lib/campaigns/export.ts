import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { TIMEZONE } from "../date-utils";
import { fmtDateTime } from "./format";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Prepara um valor para CSV:
 *  - timestamps ISO viram data/hora de Brasília;
 *  - texto que começa com = + - @ (ou tab/CR) ganha um apóstrofo: neutraliza injeção de
 *    fórmula quando alguém abre o arquivo no Excel/Planilhas;
 *  - números passam como estão.
 */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  let s = String(v);
  if (ISO.test(s)) s = fmtDateTime(s);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s;
}

/** CSV para Excel em português: separador ";", BOM UTF-8, aspas escapadas. */
export function toCsv(columns: string[], rows: unknown[][]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => esc(cell(c))).join(";"), ...rows.map((r) => r.map((v) => esc(cell(v))).join(";"))];
  return "﻿" + lines.join("\r\n");
}

export function downloadCsv(filename: string, columns: string[], rows: unknown[][]): void {
  const blob = new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ───────────────────────────── Período do download (Brasília) ─────────────────────────────

export type PeriodPreset = "all" | "today" | "7d" | "30d" | "custom";

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "all", label: "Todo o período" },
  { value: "today", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "custom", label: "Personalizado" },
];

/** Escolha da pessoa no diálogo. `from`/`to` (yyyy-MM-dd) só valem em "Personalizado". */
export type PeriodChoice = { preset: PeriodPreset; from: string; to: string };
export const DEFAULT_PERIOD: PeriodChoice = { preset: "all", from: "", to: "" };

/** `from`/`to` em ISO (UTC); `null` = sem limite. `tag` entra no nome do arquivo ("" = todo o período). */
export type ResolvedPeriod =
  | { ok: true; from: string | null; to: string | null; label: string; tag: string }
  | { ok: false; error: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const dayStart = (ymd: string) => fromZonedTime(`${ymd}T00:00:00.000`, TIMEZONE).toISOString();
const dayEnd = (ymd: string) => fromZonedTime(`${ymd}T23:59:59.999`, TIMEZONE).toISOString();
const ymdBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Dia de hoje em Brasília (yyyy-MM-dd). */
export function todayYmd(now: Date = new Date()): string {
  return formatInTimeZone(now, TIMEZONE, "yyyy-MM-dd");
}

/**
 * Transforma a escolha em intervalo. Dias inteiros de Brasília: do primeiro instante do dia inicial ao último do dia
 * final ("Últimos 7 dias" = hoje + 6 anteriores). Personalizado aceita só uma ponta; precisa de ao menos uma e
 * a inicial não pode ser depois da final.
 */
export function resolvePeriod(c: PeriodChoice, now: Date = new Date()): ResolvedPeriod {
  const today = todayYmd(now);
  switch (c.preset) {
    case "all":
      return { ok: true, from: null, to: null, label: "Todo o período", tag: "" };
    case "today":
      return { ok: true, from: dayStart(today), to: dayEnd(today), label: `Hoje (${ymdBr(today)})`, tag: today };
    case "7d":
    case "30d": {
      const start = addDays(today, c.preset === "7d" ? -6 : -29);
      return {
        ok: true, from: dayStart(start), to: dayEnd(today),
        label: `${c.preset === "7d" ? "Últimos 7 dias" : "Últimos 30 dias"} (${ymdBr(start)} a ${ymdBr(today)})`,
        tag: `${start}_a_${today}`,
      };
    }
    case "custom": {
      const f = c.from.trim();
      const t = c.to.trim();
      if (!f && !t) return { ok: false, error: "Escolha a data inicial, a final ou as duas." };
      if ((f && !YMD.test(f)) || (t && !YMD.test(t))) return { ok: false, error: "Data inválida." };
      if (f && t && f > t) return { ok: false, error: "A data inicial não pode ser depois da final." };
      return {
        ok: true,
        from: f ? dayStart(f) : null,
        to: t ? dayEnd(t) : null,
        label: f && t ? `${ymdBr(f)} a ${ymdBr(t)}` : f ? `A partir de ${ymdBr(f)}` : `Até ${ymdBr(t)}`,
        tag: `${f || "inicio"}_a_${t || "hoje"}`,
      };
    }
  }
}

/** Query string do período (`?from=&to=`), vazia para "Todo o período". */
export function periodQuery(p: { from: string | null; to: string | null }): string {
  const q: string[] = [];
  if (p.from) q.push(`from=${encodeURIComponent(p.from)}`);
  if (p.to) q.push(`to=${encodeURIComponent(p.to)}`);
  return q.length ? `?${q.join("&")}` : "";
}

/** Nome do arquivo: `<campanha>-<relatório>[-<período>]`. */
export function exportFileName(slug: string, kind: string, tag: string): string {
  return tag ? `${slug}-${kind}-${tag}` : `${slug}-${kind}`;
}

/** Em qual data cada planilha filtra o período (o servidor aplica; aqui só explicamos). */
export const REPORT_DATE_BASIS: Record<string, string> = {
  participants: "data de envio da receita",
  submissions: "data de envio da receita",
  approved: "data da análise",
  rejected: "data da análise",
  voting: "data do voto",
  ranking: "data do voto",
  votes: "data do voto",
  history: "data do evento",
};
