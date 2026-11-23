// deno-lint-ignore-file no-explicit-any
// =============================================================================
// Campanhas - rodada 6: FOTO DA INTERNET no cadastro da receita (busca + importação).
//
// Provedor atual: Wikimedia Commons (sem chave, sem custo; só licenças livres — o CRÉDITO é a condição de uso). A estrutura de
// provedores (`ImageProvider`) está pronta para um futuro Google/Pexels ativado por segredo; nada além do Wikimedia é
// implementado agora.
//
// Rotas (registradas por index.ts): GET /campaigns/:slug/image-search?q=  e  POST /campaigns/:slug/media/from-web {id, kind}.
//   - Só colaborador logado, elegível, em campanha que aceita envio/edição AGORA e com fotos habilitadas.
//   - O servidor NUNCA confia em URL do cliente: o `id` é o título da página do arquivo; os metadados são buscados de novo no
//     Commons, o download só vem de https://upload.wikimedia.org ou https://thumb.wikimedia.org (hosts oficiais do Wikimedia; teto de 5 MB,
//     assinatura jpeg/png/webp conferida).
//   - A cópia fica num caminho PROVISÓRIO do bucket (`<campanha>/web/<usuário>/<id>.<ext>`). O `id` devolvido leva uma assinatura
//     HMAC que prende (campanha, usuário, arquivo, tipo, tamanho e crédito): o cliente não consegue trocar a licença/autor.
//     Ao enviar/editar a receita, a API confere a assinatura, grava a proveniência (campaign_media_web) e copia o arquivo para o
//     caminho do ticket da mídia; a verificação final de sempre (verifyObject no finalize) vale igual para a foto da internet.
// =============================================================================

type Row = Record<string, any>;

export type WebCredit = { provider: "wikimedia"; title: string; creator: string; license: string; license_url: string | null; source_url: string };
export type WebItemCtx = { camp: Row; user: { id: string; name?: string } };
export type PreparedMedia = {
  /** Itens `{kind, mime, size}` para a função do banco (na MESMA ordem recebida; os da internet entram como mídia comum). */
  intents: { kind: string; mime: string; size: number }[];
  /** Os itens que vieram da internet: posição na lista, caminho provisório e crédito VERIFICADO. */
  webs: { index: number; stagedPath: string; credit: WebCredit }[];
};

export type ImageSearchDeps = {
  sb: any;
  BUCKET: string;
  AppError: new (status: number, code: string, message: string, details?: unknown) => Error & { status: number; code: string; details?: unknown };
  rpc: <T = any>(name: string, args: Record<string, unknown>) => Promise<T>;
  /** Estado do colaborador na campanha (404 se invisível/inelegível), como as outras rotas. */
  collab: (c: any, slug: string) => Promise<{ user: { id: string; name: string }; camp: Row; state: Row }>;
  body: (c: any) => Promise<Record<string, any>>;
  verifyObject: (path: string, declaredMime: string) => Promise<{ size: number; mime: string } | null>;
  /** Erro de "participação fechada" (VOTING_LOCKED se a votação já começou; senão REGISTRATION_CLOSED/PAUSED). */
  closedError: (camp: Row, state: Row) => Promise<Error>;
  /** Segredo do servidor para assinar o id de importação (a chave de serviço). */
  secret: string;
  /** `fetch` injetável (os testes simulam a fonte, sem rede). */
  fetch?: (input: string, init?: Record<string, unknown>) => Promise<Response>;
};

// ------------------------------------------------------------------ provedor ----
export const WIKIMEDIA_UA = "SpaceFood-CampaignImageSearch/1.0 (corporate recipe contest)";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const ALLOWED_MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MIN_WIDTH = 600;
const MAX_RESULTS = 18;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 6000;
const SEARCH_PER_MIN = 20;
const IMPORT_PER_MIN = 10;
export const SEARCH_NOTE = "Fotos do Wikimedia Commons com licença livre. O crédito do autor fica junto da foto.";
const EXT_FILTER = "LicenseShortName|License|LicenseUrl|Artist|NonFree|Restrictions";

/** Texto puro: tira tags, decodifica as entidades básicas e espaços; nada de HTML do Commons chega ao cliente. */
export function plainText(html: unknown, max: number): string {
  let s = String(html ?? "");
  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/&(amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi, (_m, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'" } as Record<string, string>)[e.toLowerCase()] ?? " ");
  s = s.replace(/&#(\d{1,6});/g, (_m, n: string) => { const c = Number(n); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : " "; });
  s = s.replace(/[<>]/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s.slice(0, max);
}
// Hosts oficiais da CDN do Wikimedia (a API devolve a MINIATURA em thumb.wikimedia.org e o original em upload.wikimedia.org).
const WIKIMEDIA_HOSTS = ["upload.wikimedia.org", "thumb.wikimedia.org"];
const hostOk = (u: unknown, host: string | string[] = WIKIMEDIA_HOSTS): u is string => {
  if (typeof u !== "string") return false;
  const hosts = Array.isArray(host) ? host : [host];
  try { const x = new URL(u); return x.protocol === "https:" && hosts.includes(x.hostname) && !x.username && !x.password; } catch { return false; }
};
const httpsUrlOrNull = (u: unknown, max = 600): string | null => {
  if (typeof u !== "string") return null;
  try { const x = new URL(u); return x.protocol === "https:" && !x.username && !x.password && u.length <= max ? x.toString() : null; } catch { return null; }
};
/** Licença aceita: CC0, domínio público, CC BY* e CC BY-SA*. NC/ND e desconhecidas são descartadas. */
export function licenseOf(ext: Row): { license: string; license_url: string | null } | null {
  const short = plainText(ext?.LicenseShortName?.value, 120);
  const key = plainText(ext?.License?.value, 60).toLowerCase();
  const probe = `${short} ${key}`;
  if (/(^|[\s-])(nc|nd)([\s-]|$)/i.test(probe)) return null;
  const free = /^(cc0|public domain|pd([ -]|$)|cc[ -]by(-sa)?([ -]\d|$))/i.test(short)
    || /^(cc0|pd|cc-by(-sa)?(-[0-9.]+)?)$/i.test(key) || /^pd-/i.test(key);
  if (!free) return null;
  return { license: short || key.toUpperCase(), license_url: httpsUrlOrNull(ext?.LicenseUrl?.value) };
}
const truthy = (v: unknown) => /^(true|1|yes)$/i.test(String(v ?? "").trim());
const titleToUrl = (title: string) => "https://commons.wikimedia.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":");
const prettyTitle = (title: string) => plainText(title.replace(/^File:/i, "").replace(/\.[A-Za-z0-9]{2,5}$/, "").replace(/_/g, " "), 120);
const normTitle = (t: string) => t.replace(/_/g, " ").trim();

type Resolved = { title: string; width: number; height: number; mime: string; thumb_url: string | null; download_url: string | null; credit: WebCredit };

/** Uma página do Commons (imageinfo) -> imagem utilizável (formato, largura, licença livre, não "NonFree") ou null. */
function usable(page: Row): Resolved | null {
  const info = page?.imageinfo?.[0];
  if (!page?.title || !info || page.missing) return null;
  const title = String(page.title);
  if (!/^File:/i.test(title) || title.length > 300) return null;
  const mime = String(info.mime ?? "").toLowerCase();
  if (!ALLOWED_MIME[mime]) return null;
  if (Number(info.width) < MIN_WIDTH) return null;
  const ext: Row = info.extmetadata ?? {};
  if (truthy(ext.NonFree?.value)) return null;
  const lic = licenseOf(ext);
  if (!lic) return null;
  const creator = plainText(ext.Artist?.value, 120) || "Autor não informado";
  return {
    title, width: Number(info.width), height: Number(info.height), mime,
    thumb_url: hostOk(info.thumburl) ? info.thumburl : null,
    download_url: hostOk(info.thumburl) ? info.thumburl : (hostOk(info.url) ? info.url : null),
    credit: { provider: "wikimedia", title: prettyTitle(title), creator, license: lic.license, license_url: lic.license_url, source_url: titleToUrl(title) },
  };
}

// ----------------------------------------------------------------- fábrica ----
export function createWebImages(deps: ImageSearchDeps) {
  const { sb, BUCKET, AppError, rpc, collab, body, verifyObject, closedError, secret } = deps;
  const doFetch = (u: string, init: Record<string, unknown> = {}) => (deps.fetch ?? ((x: string, i?: Record<string, unknown>) => fetch(x, i as RequestInit)))(u, init);
  const unavailable = () => new AppError(502, "IMAGE_SEARCH_UNAVAILABLE", "A busca de fotos na internet está indisponível agora. Tente de novo em instantes ou envie uma foto do aparelho.");
  const invalidImage = () => new AppError(422, "WEB_IMAGE_INVALID", "Não foi possível usar esta foto da internet. Escolha outra ou envie uma foto do aparelho.");

  async function timed(url: string, accept: string): Promise<Response> {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      return await doFetch(url, { headers: { "User-Agent": WIKIMEDIA_UA, Accept: accept }, signal: ac.signal, redirect: "error" });
    } finally { clearTimeout(t); }
  }
  async function commons(params: Record<string, string>): Promise<Row[]> {
    const url = COMMONS_API + "?" + new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiextmetadatafilter: EXT_FILTER, origin: "*", ...params }).toString();
    let res: Response;
    try { res = await timed(url, "application/json"); } catch { throw unavailable(); }
    if (!res.ok) throw unavailable();
    let json: Row;
    try { json = await res.json(); } catch { throw unavailable(); }
    if (json?.error) throw unavailable();
    return Array.isArray(json?.query?.pages) ? json.query.pages : [];
  }

  // ---- busca ----
  async function search(q: string): Promise<{ provider: "wikimedia"; query: string; items: Row[]; note: string }> {
    const pages = await commons({
      generator: "search", gsrsearch: `${q} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "40", gsrsort: "relevance", iiurlwidth: "320",
    });
    pages.sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
    const items: Row[] = [];
    for (const p of pages) {
      const r = usable(p);
      if (!r || !r.thumb_url) continue;
      items.push({
        id: r.title, thumb_url: r.thumb_url, width: r.width, height: r.height,
        title: r.credit.title, creator: r.credit.creator, license: r.credit.license, license_url: r.credit.license_url, source_url: r.credit.source_url,
      });
      if (items.length >= MAX_RESULTS) break;
    }
    return { provider: "wikimedia", query: q, items, note: SEARCH_NOTE };
  }

  // ---- download limitado (teto de bytes conferido no cabeçalho E durante a leitura do fluxo) ----
  async function download(url: string): Promise<Uint8Array | "too_large"> {
    if (!hostOk(url)) throw invalidImage();
    let res: Response;
    try { res = await timed(url, "image/*"); } catch { throw unavailable(); }
    if (!res.ok) throw unavailable();
    const cl = Number(res.headers.get("content-length") ?? 0);
    if (cl > MAX_IMPORT_BYTES) { try { await res.body?.cancel(); } catch { /* */ } return "too_large"; }
    const reader = res.body?.getReader();
    if (!reader) {
      const buf = new Uint8Array(await res.arrayBuffer());
      return buf.length > MAX_IMPORT_BYTES ? "too_large" : buf;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_IMPORT_BYTES) { try { await reader.cancel(); } catch { /* */ } return "too_large"; }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }
  function sniffImage(b: Uint8Array): string | null {
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    return null;
  }

  // ---- assinatura do id de importação ----
  async function hmac(text: string): Promise<string> {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("web-import:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
    return [...sig].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }
  const canonical = (campId: string, userId: string, uid: string, ext: string, mime: string, size: number, w: WebCredit) =>
    [campId, userId, uid, ext, mime, String(size), w.provider, w.title, w.creator, w.license, w.license_url ?? "", w.source_url].join("|");
  const stagedPathOf = (campId: string, userId: string, uid: string, ext: string) => `${campId}/web/${userId}/${uid}.${ext}`;
  const sameSig = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

  // ---- limites por usuário (além do limite geral da API) ----
  const hits = new Map<string, { n: number; reset: number }>();
  function cap(kind: string, userId: string, max: number) {
    const key = kind + ":" + userId;
    const now = Date.now();
    let e = hits.get(key);
    if (!e || now > e.reset) { e = { n: 0, reset: now + 60_000 }; hits.set(key, e); }
    if (++e.n > max) throw new AppError(429, "RATE_LIMIT", "Muitas buscas seguidas. Aguarde um instante e tente de novo.");
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  }

  /** Quem pode buscar/importar: campanha que aceita envio ou edição AGORA e com fotos habilitadas. */
  async function gate(c: any, slug: string) {
    const ctx = await collab(c, slug);
    if (ctx.state.can_submit !== true && ctx.state.can_edit !== true) throw await closedError(ctx.camp, ctx.state);
    if (ctx.camp.features?.photos !== true) throw new AppError(422, "MEDIA_NOT_ALLOWED", "Esta campanha não aceita fotos.", "photos");
    return ctx;
  }

  function registerRoutes(app: any) {
    app.get("/campaigns/:slug/image-search", async (c: any) => {
      const { user } = await gate(c, c.req.param("slug"));
      cap("search", user.id, SEARCH_PER_MIN);
      const raw = String(c.req.query("q") ?? "");
      // só letras, números, espaço, apóstrofo e hífen (sem operadores de busca); 2 a 80 caracteres
      const q = raw.replace(/[^\p{L}\p{N}\s'’-]/gu, " ").replace(/\s+/g, " ").trim();
      if (raw.trim().length > 80 || q.length < 2) throw new AppError(422, "INVALID_FIELDS", "Digite de 2 a 80 caracteres para buscar uma foto.");
      const out = await search(q);
      c.header("Cache-Control", "no-store");
      return c.json(out);
    });

    app.post("/campaigns/:slug/media/from-web", async (c: any) => {
      const { camp, user } = await gate(c, c.req.param("slug"));
      cap("import", user.id, IMPORT_PER_MIN);
      const b = await body(c);
      const id = typeof b.id === "string" ? b.id.trim() : "";
      const kind = b.kind === "main_photo" || b.kind === "photo" ? (b.kind as "main_photo" | "photo") : null;
      if (!kind || id.length < 6 || id.length > 300 || !/^File:/i.test(id) || /[\u0000-\u001f\u007f|<>#\[\]{}]/.test(id)) throw invalidImage();
      // limite da campanha para o tamanho da foto
      const lim = Number(camp.media_limits?.max_photo_mb);
      const cap_bytes = Math.min(MAX_IMPORT_BYTES, (Number.isFinite(lim) && lim > 0 ? lim : 5) * 1024 * 1024);

      let resolved: Resolved | null = null;
      let bytes: Uint8Array | null = null;
      for (const width of [1600, 1000, 640]) {
        const pages = await commons({ titles: id, iiurlwidth: String(width) });
        const page = pages.find((p) => normTitle(String(p.title ?? "")) === normTitle(id));
        resolved = page ? usable(page) : null;
        if (!resolved || !resolved.download_url) throw invalidImage();
        const got = await download(resolved.download_url);
        if (got === "too_large") continue;
        bytes = got;
        break;
      }
      if (!bytes || !resolved) throw new AppError(422, "WEB_IMAGE_TOO_LARGE", "Esta foto é grande demais para a receita. Escolha outra ou envie uma foto do aparelho.");
      if (bytes.length > cap_bytes) throw new AppError(422, "WEB_IMAGE_TOO_LARGE", "Esta foto é maior que o limite da campanha. Escolha outra ou envie uma foto do aparelho.");
      const mime = sniffImage(bytes);
      if (!mime || !ALLOWED_MIME[mime]) throw invalidImage();
      const ext = ALLOWED_MIME[mime];
      const uid = crypto.randomUUID();
      const path = stagedPathOf(camp.id, user.id, uid, ext);
      const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
      if (error) throw new AppError(500, "UPLOAD_URL", "Não foi possível guardar a foto agora. Tente novamente.");
      const sig = await hmac(canonical(camp.id, user.id, uid, ext, mime, bytes.length, resolved.credit));
      const out = { id: `${uid}.${sig}`, kind, path, mime, size: bytes.length, web: resolved.credit };
      c.header("Cache-Control", "no-store");
      return c.json(out);
    });
  }

  // ---- envio/edição: itens da internet entram na lista `media` (create) / `add` (update) ----
  async function prepareMedia(rawItems: unknown, ctx: WebItemCtx): Promise<PreparedMedia> {
    const list: Row[] = Array.isArray(rawItems) ? rawItems : [];
    const intents: PreparedMedia["intents"] = [];
    const webs: PreparedMedia["webs"] = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i] ?? {};
      const isWeb = m.web !== undefined && m.web !== null;
      if (!isWeb) { intents.push({ kind: m.kind, mime: m.mime, size: m.size }); continue; }
      const idm = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{32})$/i.exec(typeof m.id === "string" ? m.id : "");
      const w = m.web as Row;
      const kind = m.kind === "main_photo" || m.kind === "photo" ? m.kind : null;
      const mime = typeof m.mime === "string" ? m.mime.toLowerCase() : "";
      const ext = ALLOWED_MIME[mime];
      const size = Number(m.size);
      const strOk = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
      if (!idm || !kind || !ext || !Number.isFinite(size) || size <= 0 || size > MAX_IMPORT_BYTES || !w || w.provider !== "wikimedia"
          || !strOk(w.title, 300) || !strOk(w.creator, 300) || !strOk(w.license, 120) || !strOk(w.source_url, 600)
          || !(w.license_url === null || w.license_url === undefined || strOk(w.license_url, 600))) throw invalidImage();
      const credit: WebCredit = {
        provider: "wikimedia", title: String(w.title), creator: String(w.creator), license: String(w.license),
        license_url: w.license_url ? String(w.license_url) : null, source_url: String(w.source_url),
      };
      const uid = idm[1].toLowerCase();
      const expected = await hmac(canonical(ctx.camp.id, ctx.user.id, uid, ext, mime, size, credit));
      if (!sameSig(expected, idm[2].toLowerCase())) throw invalidImage();
      if (typeof m.path === "string" && m.path !== stagedPathOf(ctx.camp.id, ctx.user.id, uid, ext)) throw invalidImage();
      const stagedPath = stagedPathOf(ctx.camp.id, ctx.user.id, uid, ext);
      const v = await verifyObject(stagedPath, mime); // a cópia provisória ainda existe e é imagem do tipo declarado
      if (!v || !v.mime) throw new AppError(422, "WEB_IMAGE_INVALID", "A foto da internet não está mais disponível. Escolha-a de novo.");
      intents.push({ kind, mime, size: v.size });
      webs.push({ index: i, stagedPath, credit });
    }
    return { intents, webs };
  }

  /** Depois que o banco criou as mídias (tickets na MESMA ordem dos itens): grava o crédito e copia o arquivo para o caminho do ticket. */
  async function finishMedia(prepared: PreparedMedia, tickets: Row[]) {
    for (const w of prepared.webs) {
      const t = tickets[w.index];
      if (!t?.id || !t?.path) throw new AppError(500, "UPLOAD_URL", "Não foi possível preparar a foto. Tente novamente.");
      await rpc("campaign_media_web_set", { p_media: t.id, p_info: w.credit });
      const { error } = await sb.storage.from(BUCKET).copy(w.stagedPath, t.path);
      if (error) throw new AppError(502, "WEB_IMAGE_COPY_FAILED", "Não foi possível anexar a foto da internet. Remova-a e escolha de novo.");
      try { await sb.storage.from(BUCKET).remove([w.stagedPath]); } catch { /* provisório: limpeza best-effort */ }
    }
  }

  /** Créditos (por id de mídia) das fotos que vieram da internet. */
  async function creditsFor(mediaIds: string[]): Promise<Record<string, WebCredit>> {
    const out: Record<string, WebCredit> = {};
    const ids = [...new Set(mediaIds.filter(Boolean))];
    if (!ids.length) return out;
    const { data } = await sb.from("campaign_media_web").select("media_id,provider,title,creator,license,license_url,source_url").in("media_id", ids);
    for (const r of data ?? []) out[r.media_id] = { provider: r.provider, title: r.title, creator: r.creator, license: r.license, license_url: r.license_url ?? null, source_url: r.source_url };
    return out;
  }
  /** Créditos por caminho do arquivo (Livro de Receitas: as fotos vêm por caminho). */
  async function creditsByPath(paths: string[]): Promise<Record<string, WebCredit>> {
    const uniq = [...new Set(paths.filter(Boolean))];
    if (!uniq.length) return {};
    const { data } = await sb.from("campaign_media").select("id,path").in("path", uniq);
    const byId = await creditsFor((data ?? []).map((r: Row) => r.id));
    const out: Record<string, WebCredit> = {};
    for (const r of data ?? []) if (byId[r.id]) out[r.path] = byId[r.id];
    return out;
  }

  return { registerRoutes, prepareMedia, finishMedia, creditsFor, creditsByPath };
}
