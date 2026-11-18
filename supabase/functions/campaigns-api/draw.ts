// deno-lint-ignore-file no-explicit-any
// =============================================================================
// Sorteio da campanha — rotas (administrador e colaborador).
//
// Registrado por index.ts: `registerDrawRoutes(app, deps)`. As regras (quem é elegível, uma vez só,
// descartar com justificativa, confirmar, divulgar/agendar, notificações) vivem nas funções
// campaign_draw_* do banco (migração 20261118100010); aqui só há autenticação, permissão e formato.
//
// Permissões (sem chaves novas): ver/sortear = campaigns_results; confirmar/descartar = campaigns_winner_confirm;
// divulgar/agendar = campaigns_announce. O colaborador só enxerga o sorteio DEPOIS da divulgação oficial
// (`state.draw_visible`); o horário agendado nunca vai para ele.
// =============================================================================

type Row = Record<string, any>;

export type DrawDeps = {
  sb: any;
  AppError: new (status: number, code: string, message: string, details?: unknown) => Error & { status: number; code: string; details?: unknown };
  rpc: <T = any>(name: string, args: Record<string, unknown>) => Promise<T>;
  requireAdmin: (c: any, key: string) => Promise<{ user: any; perms: Record<string, boolean>; actor: Record<string, unknown> }>;
  body: (c: any) => Promise<Record<string, any>>;
  collab: (c: unknown, slug: string) => Promise<{ user: any; camp: Row; state: Row }>;
  mediaFor: (ids: string[]) => Promise<Record<string, Row[]>>;
  isoOrNull: (v: unknown) => string | null;
  strOrUndef: (v: any) => string | undefined;
};

export function registerDrawRoutes(app: any, d: DrawDeps) {
  const { sb, AppError, rpc, requireAdmin, body, collab, mediaFor, isoOrNull, strOrUndef } = d;

  // ---------------------------------------------------------------- administrador ---
  app.get("/admin/campaigns/:id/draw", async (c: any) => {
    await requireAdmin(c, "campaigns_results");
    return c.json(await rpc("campaign_draw_state", { p_campaign: c.req.param("id") }));
  });

  app.post("/admin/campaigns/:id/draw/run", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_results");
    const r = await rpc<Row>("campaign_draw_run", { p_actor: a.actor, p_campaign: c.req.param("id") });
    return c.json({ ok: true, winners: r.winners, eligible_count: r.eligible_count });
  });

  app.post("/admin/campaigns/:id/draw/discard", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_winner_confirm");
    const b = await body(c);
    await rpc("campaign_draw_discard", { p_actor: a.actor, p_campaign: c.req.param("id"), p_reason: strOrUndef(b.reason) ?? "" });
    return c.json({ ok: true });
  });

  app.post("/admin/campaigns/:id/draw/confirm", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_winner_confirm");
    const r = await rpc<Row>("campaign_draw_confirm", { p_actor: a.actor, p_campaign: c.req.param("id") });
    return c.json({ ok: true, winners: r.winners });
  });

  // Divulgar AGORA. Notificações (ganhadores e participantes) são gravadas pelo banco, uma vez por pessoa.
  app.post("/admin/campaigns/:id/draw/announce", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_announce");
    await rpc("campaign_draw_announce", { p_actor: a.actor, p_campaign: c.req.param("id") });
    return c.json({ ok: true });
  });

  // Agendar (data + hora). O banco divulga e notifica sozinho na hora marcada; o último agendamento vale.
  app.post("/admin/campaigns/:id/draw/schedule", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_announce");
    const b = await body(c);
    const at = isoOrNull(b.announce_at);
    if (!at) throw new AppError(422, "ANNOUNCE_IN_PAST", "Escolha uma data e hora futuras para divulgar o resultado.");
    const r = await rpc<Row>("campaign_draw_schedule", { p_actor: a.actor, p_campaign: c.req.param("id"), p_at: at });
    return c.json({ ok: true, announce_at: r.announce_at });
  });

  app.delete("/admin/campaigns/:id/draw/schedule", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_announce");
    await rpc("campaign_draw_cancel_schedule", { p_actor: a.actor, p_campaign: c.req.param("id") });
    return c.json({ ok: true });
  });

  // ------------------------------------------------------------------ colaborador ---
  // Só depois da divulgação oficial. Antes: 403 DRAW_HIDDEN (nem existência do resultado, nem horário agendado).
  app.get("/campaigns/:slug/draw", async (c: any) => {
    const { camp, state } = await collab(c, c.req.param("slug"));
    if (state.draw_visible !== true) throw new AppError(403, "DRAW_HIDDEN", "O resultado do sorteio ainda não foi divulgado.");
    const { data: row } = await sb.from("campaign_draws").select("status,announced_at,winners").eq("campaign_id", camp.id).maybeSingle();
    if (!row || row.status !== "announced") throw new AppError(403, "DRAW_HIDDEN", "O resultado do sorteio ainda não foi divulgado.");
    const winners: Row[] = Array.isArray(row.winners) ? row.winners : [];
    const media = await mediaFor(winners.map((w) => String(w.submission_id)));
    return c.json({
      announced_at: row.announced_at,
      winners: winners.map((w) => {
        const m = media[String(w.submission_id)] ?? [];
        return {
          position: w.position, name: w.name, dish_name: w.dish_name,
          photo_url: m.find((x) => x.kind === "main_photo")?.url ?? m.find((x) => x.kind === "photo")?.url ?? null,
        };
      }),
      i_won: state.i_won === true,
    });
  });
}
