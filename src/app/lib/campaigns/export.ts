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
