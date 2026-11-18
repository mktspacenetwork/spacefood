// deno-lint-ignore-file no-explicit-any
// =============================================================================
// Livro de Receitas da campanha — rotas (administrador e colaborador).
//
// Registrado por index.ts: `registerBookRoutes(app, deps)`. Os helpers do index.ts
// (autenticação, rpc, URLs assinadas...) chegam por `deps`; nada aqui duplica regra:
// as regras (só aprovadas, imutabilidade, publicação, acesso do colaborador) vivem nas
// funções campaign_book_* do banco (migração 20261118100011).
//
// Segurança:
//  - o colaborador só lê o livro PUBLICADO, e só se a campanha é visível para ele e ele é
//    elegível (decidido no banco, em campaign_book_reader); qualquer outro caso = 404;
//  - o PDF só sai por URL assinada curta, emitida depois dessa mesma checagem;
//  - o PDF do administrador é enviado direto ao bucket privado por URL assinada; o servidor
//    confere existência, tamanho (≤ 50 MiB) e a assinatura `%PDF-` antes de aceitar;
//  - nada aqui altera campaign_submissions / campaign_media.
// =============================================================================

type Row = Record<string, any>;

export type BookDeps = {
  sb: any;
  BUCKET: string;
  AppError: new (status: number, code: string, message: string, details?: unknown) => Error & { status: number; code: string; details?: unknown };
  rpc: <T = any>(name: string, args: Record<string, unknown>) => Promise<T>;
  requireUser: (c: any) => Promise<{ id: string; name: string; email: string }>;
  requireAdmin: (c: any, key: string) => Promise<{ user: any; perms: Record<string, boolean>; actor: Record<string, unknown> }>;
  body: (c: any) => Promise<Record<string, any>>;
  signPaths: (paths: string[], ttl?: number) => Promise<Record<string, string>>;
  getCampaignBySlug: (slug: string) => Promise<Row>;
  getCampaignById: (id: string) => Promise<Row>;
};

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const PDF_URL_TTL = 900; // 15 min: a URL é usada no clique de "Baixar"; curta para a retirada do livro valer logo
const PHOTO_URL_TTL = 3600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mensagens (pt-BR) dos códigos do livro. Ficam aqui para não depender do mapa ERR do index.ts.
const BOOK_ERR: Record<string, [number, string]> = {
  BOOK_NO_APPROVED: [409, "Ainda não há receitas aprovadas para montar o livro."],
  BOOK_NO_PDF: [409, "Gere o PDF do livro antes de publicar."],
  BOOK_NOT_FOUND: [404, "Versão do livro não encontrada."],
  BOOK_UNAVAILABLE: [404, "O Livro de Receitas ainda não está disponível."],
  BOOK_IMMUTABLE: [409, "Esta versão do livro não pode mais ser alterada. Gere uma nova versão."],
  BOOK_ALREADY_PUBLISHED: [409, "Esta versão do livro já está publicada."],
  BOOK_NOT_PUBLISHED: [409, "Não há livro publicado."],
  BOOK_PDF_INVALID: [422, "O arquivo enviado não é um PDF válido (ou passa de 50 MB). Gere o livro de novo."],
};

/**
 * Quais destas campanhas têm livro publicado? Usado pelo index.ts para acrescentar
 * `state.book_published` (item "Livro de Receitas" no menu do colaborador).
 * Se a tabela ainda não existir ou a consulta falhar, devolve vazio (nunca derruba a tela da campanha).
 */
export async function bookPublishedIds(sb: any, campaignIds: string[]): Promise<Set<string>> {
  if (!campaignIds.length) return new Set();
  try {
    const { data, error } = await sb.from("campaign_books").select("campaign_id").eq("status", "published").in("campaign_id", campaignIds);
    if (error) return new Set();
    return new Set((data ?? []).map((r: Row) => String(r.campaign_id)));
  } catch {
    return new Set();
  }
}

export function registerBookRoutes(app: any, deps: BookDeps): void {
  const { sb, BUCKET, AppError, rpc, requireUser, requireAdmin, body, signPaths, getCampaignBySlug, getCampaignById } = deps;

  // rpc com tradução dos códigos do livro
  async function brpc<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
    try {
      return await rpc<T>(name, args);
    } catch (e) {
      if (e instanceof AppError) {
        const m = BOOK_ERR[e.code];
        if (m) throw new AppError(m[0], e.code, m[1], e.details);
      }
      throw e;
    }
  }
  const campaignId = (c: any): string => {
    const id = String(c.req.param("id") ?? "");
    if (!UUID_RE.test(id)) throw new AppError(404, "CAMPAIGN_NOT_FOUND", "Campanha não encontrada.");
    return id;
  };
  const invalid = () => new AppError(422, "INVALID_FIELDS", "Há campos inválidos.");
  /** Versão opcional (inteiro ≥ 1); ausente = null; presente e inválida = 422. */
  const optVersion = (v: unknown): number | null => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 100000) throw invalid();
    return n;
  };
  const reqVersion = (v: unknown): number => {
    const n = optVersion(v);
    if (n === null) throw invalid();
    return n;
  };
  const removeObject = async (path: string | null | undefined) => {
    if (!path) return;
    try { await sb.storage.from(BUCKET).remove([path]); } catch (e) { console.error("[campaigns-api] book: remove", e); }
  };

  /** Monta o BookView a partir do snapshot, com URLs assinadas das fotos (e da capa). */
  async function buildView(camp: Row, version: number, status: string | undefined, generatedAt: string, snapshot: Row) {
    const recipes: Row[] = Array.isArray(snapshot?.recipes) ? snapshot.recipes : [];
    const paths: string[] = [];
    for (const r of recipes) for (const m of (r.media ?? []) as Row[]) if (m?.path) paths.push(String(m.path));
    if (camp.cover_path) paths.push(String(camp.cover_path));
    const urls = await signPaths(paths, PHOTO_URL_TTL);
    return {
      campaign: { name: camp.name, slug: camp.slug, cover_url: camp.cover_path ? urls[camp.cover_path] ?? null : null },
      version,
      ...(status ? { status } : {}),
      generated_at: generatedAt,
      recipes: recipes.map((r, i) => ({
        id: r.id,
        position: Number(r.position ?? i + 1),
        dish_name: String(r.dish_name ?? ""),
        author: String(r.author ?? ""),
        story: String(r.story ?? ""),
        // texto original, com as quebras de linha (a tela separa em lista/etapas)
        ingredients: String(r.ingredients ?? ""),
        preparation: String(r.preparation ?? ""),
        photos: ((r.media ?? []) as Row[])
          .filter((m) => m?.path && urls[String(m.path)])
          .map((m) => ({ url: urls[String(m.path)], kind: m.kind === "main_photo" ? "main_photo" : "photo" })),
      })),
    };
  }

  /** Confere o PDF enviado: existe, tamanho > 0 e ≤ 50 MiB, começa com `%PDF-`. */
  async function verifyPdf(path: string): Promise<{ ok: boolean; size: number }> {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return { ok: false, size: 0 };
    const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-15" } });
    if (res.status !== 206 && res.status !== 200) return { ok: false, size: 0 };
    // lê só o começo (se o servidor ignorar o Range, não baixa o arquivo inteiro)
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, size: 0 };
    const first = await reader.read();
    try { await reader.cancel(); } catch { /* ignora */ }
    const head: Uint8Array = first.value ?? new Uint8Array();
    const magic = head.length >= 5 && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d; // %PDF-
    let size = 0;
    const cr = res.headers.get("content-range");
    if (cr && cr.includes("/")) size = Number(cr.split("/")[1]);
    else size = Number(res.headers.get("content-length") ?? 0);
    if (!magic || !Number.isFinite(size) || size <= 0 || size > MAX_PDF_BYTES) return { ok: false, size };
    return { ok: true, size };
  }

  /** Só rascunho recebe PDF; devolve o status da versão (404 se não existe). */
  async function draftStatus(id: string, version: number): Promise<string> {
    const { data } = await sb.from("campaign_books").select("status").eq("campaign_id", id).eq("version", version).maybeSingle();
    if (!data) throw new AppError(404, "BOOK_NOT_FOUND", BOOK_ERR.BOOK_NOT_FOUND[1]);
    if (data.status !== "draft") throw new AppError(409, "BOOK_IMMUTABLE", BOOK_ERR.BOOK_IMMUTABLE[1]);
    return data.status;
  }

  // ------------------------------------------------------------------ admin ---
  // Estado para o painel: quantas aprovadas, rascunho atual e versão publicada.
  app.get("/admin/campaigns/:id/book", async (c: any) => {
    await requireAdmin(c, "campaigns_review");
    return c.json(await brpc("campaign_book_state", { p_campaign: campaignId(c) }));
  });

  // Gera uma NOVA versão (rascunho) com as receitas aprovadas agora. Não publica nada.
  app.post("/admin/campaigns/:id/book/generate", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_review");
    const id = campaignId(c);
    const b = await body(c);
    let excluded: string[] = [];
    if (b.excluded !== undefined && b.excluded !== null) {
      if (!Array.isArray(b.excluded) || b.excluded.length > 1000) throw invalid();
      for (const x of b.excluded) if (typeof x !== "string" || !UUID_RE.test(x)) throw invalid();
      excluded = [...new Set(b.excluded.map((x: string) => x.toLowerCase()))];
    }
    const r = await brpc<Row>("campaign_book_generate", { p_actor: a.actor, p_campaign: id, p_excluded: excluded });
    await removeObject(r.replaced_pdf_path); // o PDF do rascunho substituído não serve mais
    return c.json({ version: r.version, recipes_count: r.recipes_count });
  });

  // Prévia: a versão pedida (qualquer status) ou, sem `version`, o rascunho (ou a publicada).
  app.get("/admin/campaigns/:id/book/preview", async (c: any) => {
    await requireAdmin(c, "campaigns_review");
    const id = campaignId(c);
    const version = optVersion(c.req.query("version"));
    const camp = await getCampaignById(id);
    const r = await brpc<Row>("campaign_book_get", { p_campaign: id, p_version: version });
    return c.json(await buildView(camp, r.version, r.status, r.generated_at, r.snapshot));
  });

  // URL assinada para o navegador do admin enviar o PDF gerado (só para rascunho).
  app.post("/admin/campaigns/:id/book/pdf-upload-url", async (c: any) => {
    await requireAdmin(c, "campaigns_review");
    const id = campaignId(c);
    const version = reqVersion((await body(c)).version);
    await draftStatus(id, version);
    const path = `books/${id}/${version}-${crypto.randomUUID()}.pdf`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new AppError(500, "UPLOAD_URL", "Não foi possível preparar o envio do arquivo. Tente novamente.");
    return c.json({ path, token: data.token, signedUrl: data.signedUrl });
  });

  // Confere o PDF enviado e o anexa ao rascunho. `path` (devolvido pelo upload-url) é opcional:
  // sem ele, usa o objeto mais recente dessa versão.
  app.post("/admin/campaigns/:id/book/pdf-finalize", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_review");
    const id = campaignId(c);
    const b = await body(c);
    const version = reqVersion(b.version);
    await draftStatus(id, version);
    const prefix = `books/${id}/${version}-`;
    let path: string | null = null;
    if (typeof b.path === "string" && b.path) {
      if (!b.path.startsWith(prefix) || !/^books\/[0-9a-f-]{36}\/\d+-[A-Za-z0-9-]+\.pdf$/i.test(b.path)) throw invalid();
      path = b.path;
    } else {
      const { data: list } = await sb.storage.from(BUCKET).list(`books/${id}`, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      const hit = ((list ?? []) as Row[]).find((o) => String(o.name).startsWith(`${version}-`) && String(o.name).endsWith(".pdf"));
      if (!hit) throw new AppError(422, "BOOK_PDF_INVALID", BOOK_ERR.BOOK_PDF_INVALID[1]);
      path = `books/${id}/${hit.name}`;
    }
    const v = await verifyPdf(path);
    if (!v.ok) {
      await removeObject(path); // arquivo inválido é descartado
      throw new AppError(422, "BOOK_PDF_INVALID", BOOK_ERR.BOOK_PDF_INVALID[1]);
    }
    const r = await brpc<Row>("campaign_book_attach_pdf", { p_actor: a.actor, p_campaign: id, p_version: version, p_path: path, p_size: v.size });
    if (r.previous_path) await removeObject(r.previous_path); // trocou o PDF do rascunho
    return c.json({ ok: true, size: v.size });
  });

  // Publica (rascunho com PDF, ou versão retirada). A publicada antes passa a `superseded`.
  app.post("/admin/campaigns/:id/book/publish", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_publish");
    const id = campaignId(c);
    const version = optVersion((await body(c)).version);
    const r = await brpc<Row>("campaign_book_publish", { p_actor: a.actor, p_campaign: id, p_version: version });
    return c.json({ ok: true, version: r.version, superseded_version: r.superseded_version ?? null });
  });

  // Retira a publicação do ar (a versão continua guardada).
  app.post("/admin/campaigns/:id/book/withdraw", async (c: any) => {
    const a = await requireAdmin(c, "campaigns_publish");
    const id = campaignId(c);
    const version = optVersion((await body(c)).version);
    const r = await brpc<Row>("campaign_book_withdraw", { p_actor: a.actor, p_campaign: id, p_version: version });
    return c.json({ ok: true, version: r.version });
  });

  // ------------------------------------------------------------ colaborador ---
  // Só o livro PUBLICADO, só para quem enxerga a campanha. Qualquer outro caso: 404 BOOK_UNAVAILABLE.
  app.get("/campaigns/:slug/book", async (c: any) => {
    const user = await requireUser(c);
    const camp = await getCampaignBySlug(String(c.req.param("slug")));
    const r = await brpc<Row>("campaign_book_reader", { p_campaign: camp.id, p_user: user.id });
    c.header("Cache-Control", "private, no-store");
    return c.json(await buildView(camp, r.version, "published", r.generated_at, r.snapshot));
  });

  // URL assinada curta do PDF (com nome de arquivo para download), depois da mesma checagem.
  app.get("/campaigns/:slug/book/pdf", async (c: any) => {
    const user = await requireUser(c);
    const camp = await getCampaignBySlug(String(c.req.param("slug")));
    const r = await brpc<Row>("campaign_book_reader", { p_campaign: camp.id, p_user: user.id });
    const filename = `livro-de-receitas-${camp.slug}.pdf`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(r.pdf_path, PDF_URL_TTL, { download: filename });
    if (error || !data?.signedUrl) throw new AppError(404, "BOOK_UNAVAILABLE", BOOK_ERR.BOOK_UNAVAILABLE[1]);
    c.header("Cache-Control", "private, no-store");
    return c.json({ url: data.signedUrl, filename });
  });
}
