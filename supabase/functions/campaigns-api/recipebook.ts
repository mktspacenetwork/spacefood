// deno-lint-ignore-file no-explicit-any
// =============================================================================
// Livro de Receitas ÚNICO (acervo permanente) — rotas do administrador e do colaborador.
//
// Registrado por index.ts: `registerRecipeBookRoutes(app, deps)`. As regras vivem no banco
// (migração 20261118100013, funções recipe_book_*): só receitas aprovadas, sem duplicidade,
// remover = só tirar do acervo (nunca mexe no cadastro da receita), publicação controlada pelo
// administrador. Aqui só há autenticação/permissão, URLs assinadas de fotos e o upload da foto
// das receitas MANUAIS (arquivo direto no bucket privado, conferido pelo servidor).
//
// Permissões (sem chaves novas): itens/fotos = campaigns_review; publicar e "incluir
// automaticamente" = campaigns_publish. O colaborador só lê com o livro PUBLICADO.
// =============================================================================

type Row = Record<string, any>;

export type RecipeBookDeps = {
  sb: any;
  BUCKET: string;
  AppError: new (status: number, code: string, message: string, details?: unknown) => Error & { status: number; code: string; details?: unknown };
  rpc: <T = any>(name: string, args: Record<string, unknown>) => Promise<T>;
  requireUser: (c: any) => Promise<{ id: string; name: string; email: string }>;
  requireAdmin: (c: any, key: string) => Promise<{ user: any; perms: Record<string, boolean>; actor: Record<string, unknown> }>;
  body: (c: any) => Promise<Record<string, any>>;
  signPaths: (paths: string[], ttl?: number) => Promise<Record<string, string>>;
  verifyObject: (path: string, declaredMime: string) => Promise<{ size: number; mime: string } | null>;
  /** Crédito das fotos que vieram da internet, por caminho do arquivo (rodada 6). Opcional: sem ele nenhuma foto leva crédito. */
  webByPath?: (paths: string[]) => Promise<Record<string, any>>;
};

const PHOTO_URL_TTL = 3600;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const REF_RE = new RegExp(`^(s|e):${UUID}$`, "i");
const UUID_RE = new RegExp(`^${UUID}$`, "i");
const EXT_BY_MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function registerRecipeBookRoutes(app: any, deps: RecipeBookDeps): void {
  const { sb, BUCKET, AppError, rpc, requireUser, requireAdmin, body, signPaths, verifyObject } = deps;
  const webOf = async (paths: string[]): Promise<Record<string, any>> => (deps.webByPath ? await deps.webByPath(paths) : {});

  const invalid = (details?: string) => new AppError(422, "INVALID_FIELDS", "Há campos inválidos.", details);
  const ref = (v: unknown): string => {
    const r = typeof v === "string" ? v.trim() : "";
    if (!REF_RE.test(r)) throw new AppError(404, "BOOK_NOT_FOUND", "Receita não encontrada no livro.");
    return r.toLowerCase(); // o banco gera as referências com uuid em minúsculas
  };
  const text = (v: unknown, max: number): string | undefined => {
    if (v === undefined) return undefined;
    if (typeof v !== "string" || v.length > max + 200) throw invalid();
    return v;
  };
  const removeObject = async (path: string | null | undefined) => {
    if (!path) return;
    try { await sb.storage.from(BUCKET).remove([path]); } catch (e) { console.error("[campaigns-api] recipe-book: remove", e); }
  };
  /** Item do banco -> item da API (troca `photo_path` por `photo_url` assinada). */
  const withPhoto = (it: Row, urls: Record<string, string>): Row => {
    const { photo_path, ...rest } = it;
    return { ...rest, photo_url: photo_path ? urls[photo_path] ?? null : null };
  };

  // ------------------------------------------------------------------ admin ---
  // Estado + lista completa (resumos). Ingredientes/preparo só no detalhe.
  app.get("/admin/recipe-book", async (c: any) => {
    await requireAdmin(c, "campaigns_review");
    const [state, items] = await Promise.all([rpc<Row>("recipe_book_state", {}), rpc<Row[]>("recipe_book_list", {})]);
    const urls = await signPaths(items.map((i) => i.photo_path).filter(Boolean), PHOTO_URL_TTL);
    return c.json({ settings: state.settings, counts: state.counts, items: items.map((i) => withPhoto(i, urls)) });
  });

  app.get("/admin/recipe-book/item", async (c: any) => {
    await requireAdmin(c, "campaigns_review");
    const it = await rpc<Row>("recipe_book_get", { p_ref: ref(c.req.query("ref")) });
    const photos: Row[] = Array.isArray(it.photos) ? it.photos : [];
    const urls = await signPaths(photos.map((p) => String(p.path)).filter(Boolean), PHOTO_URL_TTL);
    const webs = await webOf(photos.map((p) => String(p.path)).filter(Boolean));
    const { photos: _p, photo_path, ...rest } = it;
    return c.json({
      ...rest,
      photo_url: photo_path ? urls[photo_path] ?? null : null,
      photos: photos.filter((p) => p?.path && urls[String(p.path)]).map((p) => ({
        url: urls[String(p.path)], kind: p.kind === "main_photo" ? "main_photo" : "photo", ...(webs[String(p.path)] ? { web: webs[String(p.path)] } : {}),
      })),
    });
  });

  // Público do livro (rodada 6): Todos os colaboradores OU só pessoas específicas. Quem não está no público recebe o mesmo que
  // "livro não publicado" (o banco decide). Escolher "pessoas específicas" exige >= 1 pessoa (AUDIENCE_EMPTY).
  app.put("/admin/recipe-book/audience", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_publish");
    const b = await body(c);
    if (b.mode !== "all" && b.mode !== "users") throw invalid("mode");
    let ids: string[] = [];
    if (b.user_ids !== undefined && b.user_ids !== null) {
      if (!Array.isArray(b.user_ids) || b.user_ids.length > 1000 || !b.user_ids.every((x: unknown) => typeof x === "string" && UUID_RE.test(x))) throw invalid("user_ids");
      ids = [...new Set((b.user_ids as string[]).map((x) => x.toLowerCase()))];
    }
    const r = await rpc<Row>("recipe_book_set_audience", { p_actor: a.actor, p_mode: b.mode, p_user_ids: ids });
    return c.json({ ok: true, audience: r });
  });

  // Chaves do livro: publicar para os colaboradores e incluir automaticamente as aprovadas.
  app.put("/admin/recipe-book/settings", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_publish");
    const b = await body(c);
    const pick = (k: string): boolean | null => {
      if (b[k] === undefined) return null;
      if (typeof b[k] !== "boolean") throw invalid(k);
      return b[k];
    };
    const published = pick("published");
    const autoInclude = pick("auto_include");
    if (published === null && autoInclude === null) throw invalid();
    const r = await rpc<Row>("recipe_book_set_settings", { p_actor: a.actor, p_published: published, p_auto_include: autoInclude });
    return c.json({ ok: true, settings: r });
  });

  // Receitas aprovadas que ainda não estão no livro (para "Adicionar da plataforma"), com busca.
  app.get("/admin/recipe-book/candidates", async (c: any) => {
    await requireAdmin(c, "campaigns_review");
    const q = String(c.req.query("q") ?? "").slice(0, 80);
    const rows = await rpc<Row[]>("recipe_book_candidates", { p_q: q });
    const urls = await signPaths(rows.map((r) => r.photo_path).filter(Boolean), PHOTO_URL_TTL);
    return c.json(rows.map((r) => withPhoto(r, urls)));
  });

  app.post("/admin/recipe-book/add", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_review");
    const sid = String((await body(c)).submission_id ?? "");
    if (!UUID_RE.test(sid)) throw new AppError(404, "BOOK_NOT_FOUND", "Receita não encontrada no livro.");
    const r = await rpc<Row>("recipe_book_add_from_submission", { p_actor: a.actor, p_submission: sid.toLowerCase() });
    return c.json({ ok: true, ref: r.ref });
  });

  // Receita MANUAL (cadastrada pela administração). A foto vem depois (photo-upload-url + photo-finalize).
  app.post("/admin/recipe-book/manual", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_review");
    const b = await body(c);
    const r = await rpc<Row>("recipe_book_add_manual", {
      p_actor: a.actor,
      p_dish_name: text(b.dish_name, 120) ?? "",
      p_author_label: text(b.author_label, 120) ?? null,
      p_story: text(b.story, 5000) ?? "",
      p_ingredients: text(b.ingredients, 20000) ?? "",
      p_preparation: text(b.preparation, 20000) ?? "",
    });
    return c.json({ ok: true, ref: r.ref });
  });

  // Editar: receita de campanha = só sobreposição de TEXTO (autoria e cadastro original intactos); manual = tudo.
  app.put("/admin/recipe-book/item", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_review");
    const b = await body(c);
    const fields: Row = {};
    for (const [k, max] of [["dish_name", 120], ["story", 5000], ["ingredients", 20000], ["preparation", 20000], ["author_label", 120]] as const) {
      const v = text(b[k], max);
      if (v !== undefined) fields[k] = v;
    }
    if (!Object.keys(fields).length) throw invalid();
    const r = await rpc<Row>("recipe_book_update", { p_actor: a.actor, p_ref: ref(b.ref), p_fields: fields });
    return c.json({ ok: true, ref: r.ref });
  });

  // Remover do livro: só tira do acervo (a receita continua na campanha, com status, votos e histórico).
  app.post("/admin/recipe-book/remove", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_review");
    const r = await rpc<Row>("recipe_book_remove", { p_actor: a.actor, p_ref: ref((await body(c)).ref) });
    return c.json({ ok: true, ref: r.ref, removed: r.removed === true });
  });
  app.post("/admin/recipe-book/restore", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_review");
    const r = await rpc<Row>("recipe_book_restore", { p_actor: a.actor, p_ref: ref((await body(c)).ref) });
    return c.json({ ok: true, ref: r.ref, restored: r.restored === true });
  });

  // Foto da receita MANUAL: URL assinada para o navegador enviar o arquivo direto ao bucket privado.
  app.post("/admin/recipe-book/photo-upload-url", async (c: any) => {
    await requireAdmin(c, "campaigns_review");
    const b = await body(c);
    const r = ref(b.ref);
    if (!r.startsWith("e:")) throw new AppError(422, "BOOK_PHOTO_INVALID", "A foto só vale para receitas cadastradas pela administração.");
    const it = await rpc<Row>("recipe_book_get", { p_ref: r });
    if (it.source !== "manual") throw new AppError(422, "BOOK_PHOTO_INVALID", "A foto só vale para receitas cadastradas pela administração.");
    const mime = String(b.mime ?? "");
    const ext = EXT_BY_MIME[mime];
    const size = Number(b.size);
    if (!ext || !Number.isFinite(size) || size <= 0 || size > MAX_PHOTO_BYTES) throw new AppError(422, "BOOK_PHOTO_INVALID", "A foto enviada não é válida. Use JPG, PNG ou WebP de até 5 MB.");
    const path = `recipe-book/${r.slice(2).toLowerCase()}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new AppError(500, "UPLOAD_URL", "Não foi possível preparar o envio do arquivo. Tente novamente.");
    return c.json({ path, token: data.token, signedUrl: data.signedUrl });
  });

  // Confere o arquivo enviado (existe, ≤ 5 MB, assinatura de imagem) e o vincula à receita manual.
  app.post("/admin/recipe-book/photo-finalize", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_review");
    const b = await body(c);
    const r = ref(b.ref);
    const path = typeof b.path === "string" ? b.path : "";
    const m = new RegExp(`^recipe-book/(${UUID})/${UUID}\\.(jpg|png|webp)$`, "i").exec(path);
    if (!r.startsWith("e:") || !m || m[1].toLowerCase() !== r.slice(2).toLowerCase()) {
      throw new AppError(422, "BOOK_PHOTO_INVALID", "A foto enviada não é válida. Use JPG, PNG ou WebP de até 5 MB.");
    }
    const v = await verifyObject(path, MIME_BY_EXT[m[2].toLowerCase()]);
    if (!v || !v.mime || v.size > MAX_PHOTO_BYTES) {
      await removeObject(path); // arquivo inválido é descartado
      throw new AppError(422, "BOOK_PHOTO_INVALID", "A foto enviada não é válida. Use JPG, PNG ou WebP de até 5 MB.");
    }
    const res = await rpc<Row>("recipe_book_set_photo", { p_actor: a.actor, p_ref: r, p_path: path });
    if (res.previous_path && res.previous_path !== path) await removeObject(res.previous_path);
    return c.json({ ok: true });
  });

  app.post("/admin/recipe-book/photo-remove", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_review");
    const r = ref((await body(c)).ref);
    const res = await rpc<Row>("recipe_book_set_photo", { p_actor: a.actor, p_ref: r, p_path: null });
    await removeObject(res.previous_path);
    return c.json({ ok: true });
  });

  // ------------------------------------------------------------ colaborador ---
  // Só com o livro PUBLICADO (e o módulo de campanhas ligado). Qualquer outro caso: 404 BOOK_UNAVAILABLE.
  app.get("/recipe-book", async (c: any) => {
    const user = await requireUser(c);
    const enabled = await rpc<boolean>("campaign_module_enabled", {});
    if (!enabled) throw new AppError(404, "BOOK_UNAVAILABLE", "O Livro de Receitas ainda não está disponível.");
    const r = await rpc<Row>("recipe_book_view", { p_user: user.id });
    const recipes: Row[] = Array.isArray(r.recipes) ? r.recipes : [];
    const paths: string[] = [];
    for (const x of recipes) for (const p of (x.photos ?? []) as Row[]) if (p?.path) paths.push(String(p.path));
    const urls = await signPaths(paths, PHOTO_URL_TTL);
    const webs = await webOf(paths);
    c.header("Cache-Control", "private, no-store");
    return c.json({
      title: "Livro de Receitas",
      generated_at: r.generated_at,
      recipes: recipes.map((x, i) => ({
        id: x.id,
        position: Number(x.position ?? i + 1),
        dish_name: String(x.dish_name ?? ""),
        author: String(x.author ?? ""),
        story: String(x.story ?? ""),
        // texto original, com as quebras de linha (a tela separa em lista/etapas)
        ingredients: String(x.ingredients ?? ""),
        preparation: String(x.preparation ?? ""),
        campaign_name: x.campaign_name ?? null,
        photos: ((x.photos ?? []) as Row[])
          .filter((p) => p?.path && urls[String(p.path)])
          .map((p) => ({ url: urls[String(p.path)], kind: p.kind === "main_photo" ? "main_photo" : "photo", ...(webs[String(p.path)] ? { web: webs[String(p.path)] } : {}) })),
      })),
    });
  });
}
