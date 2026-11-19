// deno-lint-ignore-file no-explicit-any
// =============================================================================
// Campanhas - rodada 5: dashboard dos relatórios (GET /admin/campaigns/:id/analytics) e auxiliares puros
// usados por index.ts: posição de COMPETIÇÃO do ranking (rankPositions) e período dos relatórios (resolveRange).
//
// Registrado por index.ts: `registerAnalyticsRoutes(app, deps)`. Os números vêm do banco
// (campaign_analytics, migração 14a3); aqui só há permissão, validação do id e o corte da participação por unidade.
// Permissão: `campaigns` (ver o painel); `by_unit` só com `?units=1` E `campaigns_participants`.
// =============================================================================

export type AnalyticsDeps = {
  AppError: new (status: number, code: string, message: string, details?: unknown) => Error & { status: number; code: string; details?: unknown };
  rpc: <T = any>(name: string, args: Record<string, unknown>) => Promise<T>;
  requireAdmin: (c: any, key: string) => Promise<{ user: any; perms: Record<string, boolean>; actor: Record<string, unknown> }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Posição de COMPETIÇÃO: empate divide o lugar e o seguinte pula (1º, 1º, 3º). A lista é ordenada por votos (decrescente) com
 * ordenação ESTÁVEL: quem empata mantém a ordem recebida (o banco já manda por nome). Única regra de posição do módulo
 * (ranking do colaborador, resultado, ranking da gestão, relatórios e dashboard).
 */
export function rankPositions<T extends { votes: number }>(items: T[]): (T & { position: number })[] {
  const sorted = items.map((it, i) => ({ it, i })).sort((a, b) => (b.it.votes - a.it.votes) || (a.i - b.i));
  let pos = 0;
  let prev: number | null = null;
  return sorted.map(({ it }, idx) => {
    if (prev === null || it.votes !== prev) { pos = idx + 1; prev = it.votes; }
    return { ...it, position: pos };
  });
}

export type Range = { from: string | null; to: string | null };
export type RangeResult = { range: Range } | { error: "invalid" | "order" };

/**
 * Período dos relatórios (`?from=&to=`): ISO completo, ou data pura (AAAA-MM-DD, dia de Brasília: início/fim do dia).
 * Vazio/ausente = sem limite. Data inválida = "invalid"; início depois do fim = "order" (o chamador responde 422).
 */
export function resolveRange(fromRaw?: string | null, toRaw?: string | null): RangeResult {
  const one = (raw: string | null | undefined, edge: "from" | "to"): string | null | undefined => {
    const v = (raw ?? "").trim();
    if (!v) return null;
    const s = /^\d{4}-\d{2}-\d{2}$/.test(v) ? (edge === "from" ? `${v}T00:00:00.000-03:00` : `${v}T23:59:59.999-03:00`) : v;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
  };
  const f = one(fromRaw, "from");
  const t = one(toRaw, "to");
  if (f === undefined || t === undefined) return { error: "invalid" };
  if (f && t && new Date(f).getTime() > new Date(t).getTime()) return { error: "order" };
  return { range: { from: f, to: t } };
}

export function registerAnalyticsRoutes(app: any, deps: AnalyticsDeps): void {
  const { AppError, rpc, requireAdmin } = deps;

  app.get("/admin/campaigns/:id/analytics", async (c: any) => {
    const a = await requireAdmin(c, "campaigns");
    const id = String(c.req.param("id") ?? "");
    if (!UUID_RE.test(id)) throw new AppError(404, "CAMPAIGN_NOT_FOUND", "Campanha não encontrada.");
    // participação por unidade só para quem pode ver participantes (e só se pedida: é a parte mais pesada)
    const units = c.req.query("units") === "1" && a.perms.campaigns_participants === true;
    const data = await rpc<Record<string, any>>("campaign_analytics", { p_campaign: id, p_units: units });
    c.header("Cache-Control", "no-store");
    return c.json(data);
  });
}
