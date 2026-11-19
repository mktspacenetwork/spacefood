// =============================================================================
// Gerenciador de Campanhas — API (Edge Function SEPARADA da função atual)
//
// Por que separada: o módulo é aditivo. Se algo falhar aqui, a função
// `make-server-c3078087` (pedidos, cardápio, usuários...) continua intacta.
//
// Regras de negócio vivem no banco (funções campaign_*). Esta camada:
//  - valida o JWT do usuário (mesmo padrão do site: header X-User-Auth-Token),
//  - decide o acesso administrativo pela lista própria `campaign_admins`
//    (NÃO confia no user_metadata.role, que o próprio usuário pode editar),
//  - traduz erros do banco para mensagens em PT-BR,
//  - emite URLs assinadas de upload/leitura (bucket privado),
//  - grava notificações no formato que o app já lê (KV notifications:user:{id}).
// =============================================================================
import { Hono } from "npm:hono@4";
import { cors } from "npm:hono@4/cors";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { registerRecipeBookRoutes } from "./recipebook.ts";
import { registerAnalyticsRoutes, rankPositions, resolveRange } from "./analytics.ts";

const BUCKET = "make-c3078087-campaigns";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------- erros -----
class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
const ERR: Record<string, [number, string]> = {
  ALREADY_SUBMITTED: [409, "Você já enviou uma receita nesta campanha."],
  NOT_ELIGIBLE: [403, "Você não está autorizado a participar desta campanha."],
  REGISTRATION_CLOSED: [409, "As inscrições não estão abertas."],
  REGISTRATION_PAUSED: [409, "As inscrições estão pausadas no momento."],
  EDIT_LOCKED: [409, "Esta receita já foi aprovada e não pode mais ser alterada."],
  RESULTS_LOCKED: [409, "O resultado só fica disponível depois que a votação for encerrada."],
  VOTING_CLOSED: [409, "A votação não está aberta."],
  HAS_VOTES: [409, "Esta receita já recebeu votos e não pode ser reprovada. Invalide os votos dela antes, se for mesmo necessário."],
  VOTING_PAUSED: [409, "A votação está pausada no momento."],
  VOTING_NOT_STARTED: [409, "A votação ainda não começou."],
  VOTING_STARTED: [409, "A votação já começou: não é mais possível aprovar ou reprovar receitas."],
  VOTING_STILL_OPEN: [409, "A votação ainda está aberta. Encerre a votação antes de apurar."],
  VOTING_ALREADY_STARTED: [409, "A votação já começou: o início dela não pode mais ser alterado."],
  SELF_VOTE: [403, "Você não pode votar na sua própria receita."],
  ALREADY_VOTED: [409, "Você já votou nesta campanha. O voto é definitivo e não pode ser alterado."],
  NOT_APPROVED: [409, "Esta receita não está aprovada para a votação."],
  REASON_TOO_SHORT: [422, "Informe uma justificativa com pelo menos 10 caracteres."],
  RESULTS_CONFIRMED: [409, "O resultado já foi confirmado e não pode mais ser alterado."],
  TIE_PENDING: [409, "Há um empate. Registre a decisão de desempate antes de confirmar o vencedor."],
  NO_TIE: [409, "Não há empate pendente."],
  NOT_A_TIE_CANDIDATE: [422, "Escolha uma das receitas empatadas."],
  NOT_CLOSED: [409, "A votação ainda não foi apurada."],
  NO_VOTES: [409, "Nenhum voto válido foi registrado."],
  STALE_RESULTS: [409, "Os votos mudaram depois da apuração. Apure novamente."],
  NOT_CONFIRMED: [409, "Confirme o vencedor antes de divulgar."],
  CAMPAIGN_UNAVAILABLE: [404, "Campanha indisponível."],
  CAMPAIGN_NOT_FOUND: [404, "Campanha não encontrada."],
  CAMPAIGN_CLOSED: [409, "A campanha está encerrada."],
  CAMPAIGN_HAS_RECORDS: [409, "A campanha já tem participações; esta alteração não é permitida."],
  SUBMISSION_NOT_FOUND: [404, "Receita não encontrada."],
  SUBMISSION_INCOMPLETE: [409, "A receita ainda está enviando as mídias."],
  VOTE_NOT_FOUND: [404, "Voto não encontrado."],
  ALREADY_INVALIDATED: [409, "Este voto já foi invalidado."],
  SLUG_TAKEN: [409, "Já existe uma campanha com este endereço."],
  VERSION_CONFLICT: [409, "A campanha foi alterada por outra pessoa. Recarregue e tente de novo."],
  INVALID_STATE: [409, "Esta ação não é permitida no estado atual da campanha."],
  INVALID_FIELDS: [422, "Há campos inválidos."],
  INVALID_CONFIG: [422, "A configuração tem opções incompatíveis."],
  INVALID_DATES: [422, "As datas das etapas estão incoerentes."],
  ALREADY_PUBLISHED: [409, "A campanha já está publicada."],
  PUBLISH_CHECK_FAILED: [422, "A campanha ainda não está pronta para publicar."],
  MEDIA_INVALID: [422, "Tipo de arquivo não permitido."],
  MEDIA_NOT_ALLOWED: [422, "Este tipo de mídia não está habilitado nesta campanha."],
  MEDIA_TOO_LARGE: [422, "Arquivo acima do tamanho permitido."],
  MEDIA_LIMIT: [422, "Limite de arquivos atingido."],
  MEDIA_NOT_VERIFIED: [422, "Não foi possível confirmar o envio de um dos arquivos. Tente enviar de novo."],
  MAIN_PHOTO_REQUIRED: [422, "A foto principal é obrigatória nesta campanha."],
  LAST_ACCESS_MANAGER: [409, "É preciso manter pelo menos uma pessoa com gestão de acesso."],
  SUBMISSION_LIMIT: [409, "Você já atingiu o limite de receitas desta campanha."],
  ALREADY_ANNOUNCED: [409, "O resultado já foi divulgado."],
  ANNOUNCE_IN_PAST: [422, "Escolha uma data e hora futuras para divulgar o resultado."],
  RESULTS_NOT_CONFIRMED: [409, "Confirme o vencedor antes de divulgar ou agendar a divulgação."],
  TOUR_LIMIT: [422, "Limite de histórico de tours atingido."],
  ANNOUNCE_BEFORE_END: [422, "A data de anúncio deve ser depois do encerramento."],
  BOOK_NOT_FOUND: [404, "Receita não encontrada no livro."],
  BOOK_NOT_APPROVED: [409, "Só receitas aprovadas entram no livro."],
  BOOK_DUPLICATE: [409, "Esta receita já está no livro."],
  BOOK_UNAVAILABLE: [404, "O Livro de Receitas ainda não está disponível."],
  BOOK_PHOTO_INVALID: [422, "A foto enviada não é válida. Use JPG, PNG ou WebP de até 5 MB."],
  BOOK_IMMUTABLE: [409, "Esta alteração não é permitida no livro."],
  LATE_SUBMISSION: [409, "Esta receita foi enviada fora do prazo e não concorre à votação."],
  CAMPAIGN_LIVE: [409, "Despublique ou encerre a campanha antes de excluir."],
  CONFIRM_MISMATCH: [422, "Digite o nome da campanha para confirmar a exclusão."],
  CAMPAIGN_DELETED: [409, "Esta campanha está excluída. Restaure-a para alterar."],
  LATE_IMMUTABLE: [409, "A marca de receita fora do prazo não pode ser alterada."],
  INVALID_RANGE: [422, "Período inválido: a data inicial deve ser anterior à data final."],
};
// Mensagens específicas do INVALID_DATES (o banco manda o motivo em `detail`).
const DATES_MSG: Record<string, string> = {
  missing: "Informe a data de início e a de encerramento.",
  ends_before_starts: "O encerramento deve ser depois do início.",
  voting_missing: "Informe o início e o encerramento da votação.",
  voting_ends_before_starts: "O encerramento da votação deve ser depois do início dela.",
  voting_before_registration: "A votação não pode começar antes do início da participação.",
  voting_ends_before_registration: "A votação não pode terminar antes do fim da participação.",
  voting_before_registration_end: "A votação só pode começar depois do fim da participação.",
  announce_before_voting_end: "A divulgação deve ser depois do fim da votação.",
  announce_without_voting: "Esta campanha não tem votação: não há resultado para divulgar.",
};
// Nomes dos campos da receita nas mensagens de erro (o banco devolve a chave técnica em `details`).
const FIELD_LABELS: Record<string, string> = {
  dish_name: "Título da receita", description: "História e memória afetiva", ingredients: "Ingredientes",
  preparation: "Modo de preparo", name: "Nome da campanha", key: "Chave", story: "História", author_label: "Autor",
};
// deno-lint-ignore no-explicit-any
function fromPg(error: any): AppError {
  const code = String(error?.message ?? "");
  if (error?.code === "P0001") {
    const info = ERR[code];
    let details: unknown = error?.details;
    if (code === "PUBLISH_CHECK_FAILED") { try { details = JSON.parse(String(error.details)); } catch { /* ignore */ } }
    if (code === "INVALID_DATES" && typeof details === "string" && DATES_MSG[details]) return new AppError(info[0], code, DATES_MSG[details], details);
    // Campos da receita: diz QUAIS estão inválidos (vazios ou longos demais), em português.
    if (code === "INVALID_FIELDS" && typeof details === "string" && details && details.split(",").every((k) => FIELD_LABELS[k])) {
      const labels = details.split(",").map((k) => FIELD_LABELS[k]).join(", ");
      return new AppError(info[0], code, `Revise os campos: ${labels}.`, details);
    }
    if (code === "MEDIA_LIMIT" && details === "photos_max_3") return new AppError(info[0], code, "Cada receita aceita no máximo 3 fotos.", details);
    if (code === "MEDIA_NOT_ALLOWED" && details === "photos") return new AppError(info[0], code, "Esta campanha não aceita fotos.", details);
    if (info) return new AppError(info[0], code, info[1], details);
    return new AppError(422, code, "Operação não permitida (" + code + ").", details);
  }
  console.error("[campaigns-api] db error:", error?.code, error?.message);
  return new AppError(500, "DB_ERROR", "Erro ao processar a solicitação. Tente novamente.");
}
// deno-lint-ignore no-explicit-any
async function rpc<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw fromPg(error);
  return data as T;
}

// ------------------------------------------------------------- autenticação --
type AuthUser = { id: string; name: string; email: string };
const authCache = new Map<string, { u: AuthUser; ts: number }>();
// deno-lint-ignore no-explicit-any
async function getUser(c: any): Promise<AuthUser | null> {
  let token = c.req.header("X-User-Auth-Token");
  if (!token) {
    const h = c.req.header("Authorization");
    token = h ? h.split(" ")[1] : undefined;
    if (token && token === Deno.env.get("SUPABASE_ANON_KEY")) token = undefined;
  }
  if (!token) return null;
  const hit = authCache.get(token);
  if (hit && Date.now() - hit.ts < 30_000) return hit.u;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  const u: AuthUser = {
    id: data.user.id,
    name: data.user.user_metadata?.name || (data.user.email ?? "").split("@")[0] || "Colaborador",
    email: data.user.email ?? "",
  };
  authCache.set(token, { u, ts: Date.now() });
  if (authCache.size > 500) for (const [k, v] of authCache) if (Date.now() - v.ts > 30_000) authCache.delete(k);
  return u;
}
// deno-lint-ignore no-explicit-any
async function requireUser(c: any): Promise<AuthUser> {
  const u = await getUser(c);
  if (!u) throw new AppError(401, "UNAUTHORIZED", "Não autorizado. Faça login novamente.");
  return u;
}
const ALL_PERMS = [
  "campaigns", "campaigns_create", "campaigns_edit", "campaigns_duplicate", "campaigns_publish", "campaigns_schedule",
  "campaigns_participants", "campaigns_review", "campaigns_results", "campaigns_export", "campaigns_votes_view",
  "campaigns_votes_invalidate", "campaigns_tiebreak", "campaigns_winner_confirm", "campaigns_announce",
  "campaigns_export_votes", "campaigns_access",
];
async function getPerms(userId: string): Promise<Record<string, boolean>> {
  const { data } = await sb.from("campaign_admins").select("permissions").eq("user_id", userId).maybeSingle();
  const raw = (data?.permissions ?? {}) as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const k of ALL_PERMS) out[k] = raw[k] === true;
  return out;
}
type Admin = { user: AuthUser; perms: Record<string, boolean>; actor: Record<string, unknown> };
// Campanha EXCLUÍDA (oculta) não aceita nenhuma escrita pela API, só a restauração (o gatilho do banco só protege a linha de
// `campaigns`; período, divulgação, público, receitas e resultado moram em outras tabelas). Leituras (GET) seguem liberadas, e
// restaurar e duplicar passam (duplicar não altera a original).
// deno-lint-ignore no-explicit-any
async function assertCampaignNotDeleted(c: any) {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const id = c.req.param("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || /\/(restore|duplicate)\/?$/.test(c.req.path)) return;
  const { data } = await sb.from("campaigns").select("deleted_at").eq("id", id).maybeSingle();
  if (data?.deleted_at) throw new AppError(409, "CAMPAIGN_DELETED", ERR.CAMPAIGN_DELETED[1]);
}
async function requireAdmin(c: any, key: string): Promise<Admin> {
  const user = await requireUser(c);
  const perms = await getPerms(user.id);
  if (!perms.campaigns || !perms[key]) throw new AppError(403, "FORBIDDEN", "Você não tem permissão para esta ação.");
  await assertCampaignNotDeleted(c);
  const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0].trim();
  return { user, perms, actor: { id: user.id, name: user.name, role: "admin", ip } };
}

// ------------------------------------------------------------------ utils ---
const rate = new Map<string, { n: number; reset: number }>();
// deno-lint-ignore no-explicit-any
function rateLimit(c: any) {
  const key = (c.req.header("X-User-Auth-Token") ?? "").slice(-16) || (c.req.header("x-forwarded-for") ?? "anon");
  const now = Date.now();
  let e = rate.get(key);
  if (!e || now > e.reset) { e = { n: 0, reset: now + 60_000 }; rate.set(key, e); }
  if (++e.n > 240) throw new AppError(429, "RATE_LIMIT", "Muitas requisições. Tente novamente em instantes.");
  if (rate.size > 5000) for (const [k, v] of rate) if (now > v.reset) rate.delete(k);
}
function slugify(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "campanha";
}
async function signPaths(paths: string[], ttl = 3600): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const uniq = [...new Set(paths.filter(Boolean))];
  if (!uniq.length) return out;
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(uniq, ttl);
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
// deno-lint-ignore no-explicit-any
const strOrUndef = (v: any) => (typeof v === "string" ? v : undefined);
// deno-lint-ignore no-explicit-any
async function body(c: any): Promise<Record<string, any>> {
  try { const b = await c.req.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; }
}
// deno-lint-ignore no-explicit-any
function wait(p: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime;
  const safe = p.catch((e) => console.error("[campaigns-api] background task:", e));
  if (er?.waitUntil) er.waitUntil(safe);
}

// ------------------------------------------------------------ notificações --
async function notifyUser(campaignId: string, userId: string, event: string, entityId: string, title: string, message: string) {
  const claimed = await rpc<boolean>("campaign_notification_claim", { p_campaign: campaignId, p_user: userId, p_event: event, p_entity: entityId });
  if (!claimed) return;
  let inboxOk = false;
  let err: string | null = null;
  try {
    const notif = {
      id: crypto.randomUUID(), title, message, type: "info", sentAt: new Date().toISOString(),
      sentByName: "Campanhas", targetUserId: userId,
    };
    const { error } = await sb.rpc("kv_append_to_array", { p_key: `notifications:user:${userId}`, p_value: notif });
    if (error) throw error;
    inboxOk = true;
  } catch (e) { err = String((e as Error)?.message ?? e); }
  await rpc("campaign_notification_done", { p_campaign: campaignId, p_user: userId, p_event: event, p_entity: entityId, p_inbox: inboxOk, p_push: false, p_error: err });
}
async function eligibleUserIds(campaignId: string): Promise<string[]> {
  const rows = await rpc<{ user_id: string }[]>("campaign_participants", { p_campaign: campaignId, p_with_votes: false });
  // com várias receitas por pessoa a função devolve uma linha por receita: aqui interessa cada pessoa uma vez
  return [...new Set(rows.map((r) => r.user_id))];
}
// Divulgações agendadas já vencidas: o pg_cron roda a cada minuto; isto é só a rede de segurança caso a extensão
// não esteja ativa (no máximo 1 chamada a cada 20 s por instância; o banco garante "uma única vez").
let lastDueRun = 0;
function runDueAnnouncements() {
  if (Date.now() - lastDueRun < 20_000) return;
  lastDueRun = Date.now();
  wait(rpc("campaign_run_due_announcements", {}));
}
async function notifyMany(campaignId: string, ids: string[], event: string, title: string, message: string) {
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(ids.slice(i, i + 10).map((id) => notifyUser(campaignId, id, event, "", title, message).catch((e) => console.error("notify", e))));
  }
}

// ----------------------------------------------------- verificação de mídia --
function sniff(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "video/mp4"; // mp4/mov (ftyp)
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  return null;
}
function mimeFamilyOk(declared: string, detected: string | null): boolean {
  if (!detected) return false;
  if (declared === detected) return true;
  if (detected === "video/mp4" && declared === "video/quicktime") return true;
  return false;
}
// Confere no servidor: objeto existe, tamanho real e assinatura (magic bytes).
async function verifyObject(path: string, declaredMime: string): Promise<{ size: number; mime: string } | null> {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return null;
  const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-63" } });
  if (res.status !== 206 && res.status !== 200) return null;
  const head = new Uint8Array(await res.arrayBuffer());
  let size = 0;
  const cr = res.headers.get("content-range");
  if (cr && cr.includes("/")) size = Number(cr.split("/")[1]);
  else size = Number(res.headers.get("content-length") ?? 0);
  if (!size || !Number.isFinite(size)) return null;
  const detected = sniff(head.slice(0, 64));
  if (!mimeFamilyOk(declaredMime, detected)) return { size, mime: "" };
  return { size, mime: declaredMime };
}
async function uploadTokens(uploads: { id: string; kind: string; path: string; mime: string; max_bytes: number }[]) {
  const out = [];
  for (const u of uploads) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(u.path, { upsert: true });
    if (error || !data) throw new AppError(500, "UPLOAD_URL", "Não foi possível preparar o envio do arquivo. Tente novamente.");
    out.push({ ...u, token: data.token, signedUrl: data.signedUrl });
  }
  return out;
}

// -------------------------------------------------------------- consultas ---
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
async function getCampaignBySlug(slug: string): Promise<Row> {
  const { data } = await sb.from("campaigns").select("*").eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (!data) throw new AppError(404, "CAMPAIGN_UNAVAILABLE", "Campanha indisponível.");
  return data;
}
async function getCampaignById(id: string): Promise<Row> {
  const { data } = await sb.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!data) throw new AppError(404, "CAMPAIGN_NOT_FOUND", "Campanha não encontrada.");
  return data;
}
async function getStages(id: string): Promise<Row[]> {
  const { data } = await sb.from("campaign_stages").select("stage_key,starts_at,ends_at,paused").eq("campaign_id", id);
  return data ?? [];
}
/**
 * Resultado (contagem por receita, ranking, votos individuais) só aparece para a gestão DEPOIS que a votação
 * encerra. `locked` = a campanha tem votação e a data de encerramento ainda não passou. Contagens gerais de
 * participação (quantas pessoas já votaram) NÃO são resultado e continuam visíveis.
 */
async function resultsGate(camp: Row, stages?: Row[]): Promise<{ hasVoting: boolean; locked: boolean; endsAt: string | null }> {
  const st = stages ?? await getStages(camp.id);
  const vs = st.find((s) => s.stage_key === "voting");
  const hasVoting = !!camp.features?.voting;
  const endsAt: string | null = vs?.ends_at ?? null;
  const closed = !!endsAt && new Date(endsAt).getTime() <= Date.now();
  return { hasVoting, locked: hasVoting && !closed, endsAt };
}
/** Estado de uma etapa, com a MESMA regra do banco (campaign_stage_state). */
function stageState(s: Row | undefined | null): "unset" | "paused" | "upcoming" | "closed" | "open" {
  if (!s || (!s.starts_at && !s.ends_at)) return "unset";
  if (s.paused) return "paused";
  const now = Date.now();
  if (s.starts_at && now < new Date(s.starts_at).getTime()) return "upcoming";
  if (s.ends_at && now >= new Date(s.ends_at).getTime()) return "closed";
  return "open";
}
/** Votação ao vivo = aberta ou pausada (ranking PARCIAL): só aí o acompanhamento da gestão é "ao vivo". */
function votingLive(camp: Row, stages: Row[]): { state: string; live: boolean } {
  const state = stageState(stages.find((x) => x.stage_key === "voting"));
  return { state, live: !!camp.features?.voting && (state === "open" || state === "paused") };
}
/** Linha do placar do banco -> item da API (posição de COMPETIÇÃO via rankPositions). */
function rankedTally(rows: Row[]) {
  return rankPositions(rows.map((t) => ({ submission_id: t.submission_id, dish_name: t.dish_name, author: t.user_name, votes: Number(t.votes) })));
}
/**
 * Período da campanha já acabou? Vale o ÚLTIMO fim entre participação e (se houver) votação; campanha encerrada
 * ou arquivada também conta. Sem datas definidas = ainda não acabou. Usado para tirar o slide da Home.
 */
function campaignEnded(camp: Row, stages: Row[]): boolean {
  if (camp.status === "closed" || camp.status === "archived") return true;
  const keys = camp.features?.voting ? ["registration", "voting"] : ["registration"];
  const ends: number[] = [];
  for (const k of keys) {
    const e = stages.find((s) => s.stage_key === k)?.ends_at;
    if (!e) return false;
    ends.push(new Date(e).getTime());
  }
  return Date.now() >= Math.max(...ends);
}
/** No contexto de ANÁLISE de receitas, "votação encerrada" tem mensagem própria (para o eleitor continua "não está aberta"). */
function reviewErr(e: unknown): unknown {
  if (e instanceof AppError && e.code === "VOTING_CLOSED") {
    return new AppError(409, "VOTING_CLOSED", "A votação já foi encerrada: não é mais possível analisar receitas.");
  }
  return e;
}
/** Receitas FORA DO PRAZO da campanha (id das receitas), para enriquecer listas sem recriar funções do banco. */
async function lateSubmissionIds(campaignId: string): Promise<Set<string>> {
  const { data } = await sb.from("campaign_submissions").select("id").eq("campaign_id", campaignId).eq("is_late", true);
  return new Set((data ?? []).map((r: Row) => r.id as string));
}
/** Data ISO válida ou null; qualquer outra coisa vira erro 422 (em vez de erro de banco). */
function isoOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new AppError(422, "INVALID_DATES", ERR.INVALID_DATES[1]);
  return d.toISOString();
}
async function collab(c: unknown, slug: string) {
  const user = await requireUser(c);
  const camp = await getCampaignBySlug(slug);
  // deno-lint-ignore no-explicit-any
  const state = await rpc<Row>("campaign_collab_state", { p_campaign: camp.id, p_user: user.id });
  if (!state.visible) throw new AppError(404, "CAMPAIGN_UNAVAILABLE", "Campanha indisponível.");
  return { user, camp, state };
}
function publicCampaign(camp: Row, stages: Row[], cover?: string) {
  return {
    id: camp.id, slug: camp.slug, name: camp.name, description: camp.description, objective: camp.objective,
    instructions: camp.instructions, cover_url: cover ?? null, features: camp.features,
    visibility: { show_podium: !!camp.visibility?.show_podium },
    media_limits: camp.media_limits, visible_from: camp.visible_from,
    stages: stages.map((s) => ({ key: s.stage_key, starts_at: s.starts_at, ends_at: s.ends_at, paused: s.paused })),
  };
}
async function mediaFor(ids: string[]) {
  if (!ids.length) return {} as Record<string, Row[]>;
  const { data } = await sb.from("campaign_media").select("id,submission_id,kind,path,mime,size_bytes,position")
    .in("submission_id", ids).eq("status", "ready").order("position");
  const rows = data ?? [];
  const urls = await signPaths(rows.map((r) => r.path));
  const out: Record<string, Row[]> = {};
  for (const r of rows) (out[r.submission_id] ||= []).push({ id: r.id, kind: r.kind, mime: r.mime, size: r.size_bytes, url: urls[r.path] });
  return out;
}

// ===================================================================== APP ===
const app = new Hono().basePath("/campaigns-api");
app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization", "X-User-Auth-Token", "apikey", "x-client-info"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  maxAge: 600,
}));
app.use("*", async (c, next) => { rateLimit(c); await next(); });
app.onError((err, c) => {
  if (err instanceof AppError) return c.json({ error: err.message, code: err.code, details: err.details }, err.status as 400);
  console.error("[campaigns-api] unhandled:", err);
  return c.json({ error: "Erro interno. Tente novamente.", code: "INTERNAL" }, 500);
});
app.notFound((c) => c.json({ error: "Rota não encontrada.", code: "NOT_FOUND" }, 404));
app.get("/health", (c) => c.json({ status: "ok" }));

// ---------------------------------------------------- tours vistos (por usuário) ---
// Qualquer usuário logado (colaborador ou admin); não depende do módulo estar ligado nem de campanha visível.
// O usuário vem SEMPRE do JWT, nunca do corpo. Marcar de novo uma chave já vista também responde 200.
app.get("/tours", async (c) => {
  const user = await requireUser(c);
  return c.json({ seen: await rpc<string[]>("campaign_tours_seen", { p_user: user.id }) });
});
app.post("/tours", async (c) => {
  const user = await requireUser(c);
  const b = await body(c);
  if (typeof b.key !== "string") throw new AppError(422, "INVALID_FIELDS", ERR.INVALID_FIELDS[1]);
  await rpc("campaign_tour_mark", { p_user: user.id, p_key: b.key });
  return c.json({ ok: true });
});

// ------------------------------------------------------------ colaborador ---
app.get("/campaigns/availability", async (c) => {
  const user = await requireUser(c);
  runDueAnnouncements();
  const enabled = await rpc<boolean>("campaign_module_enabled", {});
  if (!enabled) return c.json({ enabled: false, hasVisible: false, book: false, campaigns: [] });
  const { data: list } = await sb.from("campaigns").select("id,slug,features").eq("status", "authorized").is("deleted_at", null);
  const out: Row[] = [];
  for (const camp of list ?? []) {
    const st = await rpc<Row>("campaign_collab_state", { p_campaign: camp.id, p_user: user.id });
    if (st.visible) out.push({ id: camp.id, slug: camp.slug, tour: st.tour });
  }
  // Livro de Receitas único: aparece no menu/tela de Campanhas quando o administrador publica
  const { data: bs } = await sb.from("recipe_book_settings").select("published").eq("id", 1).maybeSingle();
  return c.json({ enabled: true, hasVisible: out.length > 0, book: bs?.published === true, campaigns: out });
});

app.get("/campaigns", async (c) => {
  const user = await requireUser(c);
  runDueAnnouncements();
  const enabled = await rpc<boolean>("campaign_module_enabled", {});
  if (!enabled) return c.json([]);
  const { data: list } = await sb.from("campaigns").select("*").eq("status", "authorized").is("deleted_at", null).order("authorized_at", { ascending: false });
  const rows: Row[] = [];
  for (const camp of list ?? []) {
    const st = await rpc<Row>("campaign_collab_state", { p_campaign: camp.id, p_user: user.id });
    if (!st.visible) continue;
    rows.push({ camp, st, stages: await getStages(camp.id) });
  }
  const urls = await signPaths(rows.map((r) => r.camp.cover_path).filter(Boolean));
  return c.json(rows.map((r) => ({
    ...publicCampaign(r.camp, r.stages, urls[r.camp.cover_path]),
    description: String(r.camp.description).slice(0, 240),
    state: {
      stage: r.st.stage, released: r.st.released, my_submission_status: r.st.my_submission_status ?? null,
      my_submissions_count: r.st.my_submissions_count ?? 0, max_submissions: r.st.max_submissions ?? 1,
      can_submit: r.st.can_submit === true, can_vote: r.st.can_vote === true, late_window: r.st.late_window === true,
      has_voted: r.st.has_voted === true, results_visible: r.st.results_visible === true,
    },
    ended: campaignEnded(r.camp, r.stages),
  })));
});

app.get("/campaigns/:slug", async (c) => {
  const { camp, state } = await collab(c, c.req.param("slug"));
  const urls = await signPaths([camp.cover_path]);
  return c.json({ campaign: publicCampaign(camp, await getStages(camp.id), urls[camp.cover_path]), state });
});

app.get("/campaigns/:slug/recipes", async (c) => {
  const { camp, state, user } = await collab(c, c.req.param("slug"));
  if (!state.gallery_visible) throw new AppError(403, "GALLERY_HIDDEN", "A galeria de receitas ainda não está disponível.");
  const off = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
  const { data, count } = await sb.from("campaign_submissions")
    .select("id,user_id,user_name,dish_name,description,is_late", { count: "exact" })
    .eq("campaign_id", camp.id).eq("status", "approved").order("submitted_at", { ascending: false }).range(off, off + 11);
  const media = await mediaFor((data ?? []).map((s) => s.id));
  return c.json({
    total: count ?? 0,
    items: (data ?? []).map((s) => ({
      id: s.id, dish_name: s.dish_name, author: s.user_name, description: s.description,
      photo_url: (media[s.id] ?? []).find((m) => m.kind === "main_photo")?.url ?? (media[s.id] ?? []).find((m) => m.kind === "photo")?.url ?? null,
      // só o autor enxerga o aviso "fora do prazo" (a receita aparece normalmente para todos)
      ...(s.user_id === user.id && s.is_late ? { is_late: true } : {}),
    })),
  });
});

app.get("/campaigns/:slug/recipes/:id", async (c) => {
  const { camp, state, user } = await collab(c, c.req.param("slug"));
  const { data: s } = await sb.from("campaign_submissions").select("*").eq("id", c.req.param("id")).eq("campaign_id", camp.id).maybeSingle();
  const mine = s?.user_id === user.id;
  if (!s || (!mine && (s.status !== "approved" || !state.gallery_visible))) throw new AppError(404, "SUBMISSION_NOT_FOUND", "Receita não encontrada.");
  const media = (await mediaFor([s.id]))[s.id] ?? [];
  return c.json({
    id: s.id, dish_name: s.dish_name, author: s.user_name, description: s.description,
    ingredients: s.ingredients, preparation: s.preparation, media,
    can_vote: state.can_vote && !mine && s.status === "approved" && !s.is_late, mine,
    ...(mine && s.is_late ? { is_late: true } : {}),
  });
});

app.get("/campaigns/:slug/my-submission", async (c) => {
  const { camp, state, user } = await collab(c, c.req.param("slug"));
  // com "várias receitas" pode haver mais de uma: esta rota (singular) devolve sempre a de menor slot
  const { data: s } = await sb.from("campaign_submissions").select("*").eq("campaign_id", camp.id).eq("user_id", user.id).order("slot").limit(1).maybeSingle();
  if (!s) return c.json({ submission: null, state });
  const media = (await mediaFor([s.id]))[s.id] ?? [];
  let voted: Row | null = null;
  if (state.has_voted && state.voted_submission_id) {
    const { data: vs } = await sb.from("campaign_submissions").select("id,dish_name,user_name").eq("id", state.voted_submission_id).maybeSingle();
    voted = vs ? { dish_name: vs.dish_name, author: vs.user_name, at: state.voted_at } : null;
  }
  return c.json({
    submission: {
      id: s.id, slot: s.slot, dish_name: s.dish_name, description: s.description, ingredients: s.ingredients, preparation: s.preparation,
      status: s.status, rejection_reason: s.status === "rejected" ? s.rejection_reason : null,
      submitted_at: s.submitted_at, updated_at: s.updated_at, reviewed_at: s.reviewed_at, media, is_late: !!s.is_late,
    },
    state, my_vote: voted,
  });
});

// Todas as receitas da pessoa nesta campanha (1, ou várias), em ordem de slot. Só enxerga as PRÓPRIAS.
app.get("/campaigns/:slug/my-submissions", async (c) => {
  const { camp, state, user } = await collab(c, c.req.param("slug"));
  const { data } = await sb.from("campaign_submissions").select("*").eq("campaign_id", camp.id).eq("user_id", user.id).order("slot");
  const rows = data ?? [];
  const media = await mediaFor(rows.map((s) => s.id));
  let voted: Row | null = null;
  if (state.has_voted && state.voted_submission_id) {
    const { data: vs } = await sb.from("campaign_submissions").select("id,dish_name,user_name").eq("id", state.voted_submission_id).maybeSingle();
    voted = vs ? { dish_name: vs.dish_name, author: vs.user_name, at: state.voted_at } : null;
  }
  const max = Number(state.max_submissions ?? 1);
  return c.json({
    items: rows.map((s) => ({
      id: s.id, slot: s.slot, dish_name: s.dish_name, description: s.description, ingredients: s.ingredients, preparation: s.preparation,
      status: s.status, rejection_reason: s.status === "rejected" ? s.rejection_reason : null,
      submitted_at: s.submitted_at, updated_at: s.updated_at, reviewed_at: s.reviewed_at, media: media[s.id] ?? [], is_late: !!s.is_late,
    })),
    count: rows.length, max, can_submit_more: state.can_submit === true, state, my_vote: voted,
  });
});

app.post("/campaigns/:slug/submission", async (c) => {
  const { camp, user } = await collab(c, c.req.param("slug"));
  const b = await body(c);
  const media = Array.isArray(b.media) ? b.media.map((m: Row) => ({ kind: m.kind, mime: m.mime, size: m.size })) : [];
  const r = await rpc<Row>("campaign_submit", {
    p_campaign: camp.id, p_user: user.id, p_user_name: user.name,
    p_fields: { dish_name: strOrUndef(b.dish_name) ?? "", description: strOrUndef(b.description) ?? "", ingredients: strOrUndef(b.ingredients) ?? "", preparation: strOrUndef(b.preparation) ?? "" },
    p_media: media,
  }).catch((e) => {
    if (e instanceof AppError && e.code === "ALREADY_SUBMITTED") throw new AppError(409, e.code, e.message, { submission_id: e.details });
    throw e;
  });
  const uploads = await uploadTokens(r.uploads ?? []);
  if (r.status === "submitted") wait(notifyUser(camp.id, user.id, "submission_received", r.submission_id, "Receita recebida", `Recebemos a sua receita na campanha ${camp.name}. Ela passará por análise.`));
  return c.json({ submission_id: r.submission_id, status: r.status, slot: r.slot, uploads });
});

app.post("/campaigns/:slug/submission/:id/uploads", async (c) => {
  const { camp, user } = await collab(c, c.req.param("slug"));
  const { data: s } = await sb.from("campaign_submissions").select("id").eq("id", c.req.param("id")).eq("campaign_id", camp.id).eq("user_id", user.id).maybeSingle();
  if (!s) throw new AppError(404, "SUBMISSION_NOT_FOUND", "Receita não encontrada.");
  const { data: pend } = await sb.from("campaign_media").select("id,kind,path,mime").eq("submission_id", s.id).eq("status", "pending");
  const lim = camp.media_limits;
  const ups = (pend ?? []).map((m) => ({ id: m.id, kind: m.kind, path: m.path, mime: m.mime,
    max_bytes: (m.kind === "video" ? lim.max_video_mb : lim.max_photo_mb) * 1024 * 1024 }));
  return c.json({ uploads: await uploadTokens(ups) });
});

app.post("/campaigns/:slug/submission/:id/finalize", async (c) => {
  const { camp, user } = await collab(c, c.req.param("slug"));
  const sid = c.req.param("id");
  const { data: s } = await sb.from("campaign_submissions").select("id").eq("id", sid).eq("campaign_id", camp.id).eq("user_id", user.id).maybeSingle();
  if (!s) throw new AppError(404, "SUBMISSION_NOT_FOUND", "Receita não encontrada.");
  const { data: pend } = await sb.from("campaign_media").select("id,path,mime,kind").eq("submission_id", sid).eq("status", "pending");
  const verified: Row[] = [];
  for (const m of pend ?? []) {
    const v = await verifyObject(m.path, m.mime);
    if (!v) throw new AppError(422, "MEDIA_NOT_VERIFIED", ERR.MEDIA_NOT_VERIFIED[1], { id: m.id });
    if (!v.mime) {
      await sb.storage.from(BUCKET).remove([m.path]);
      throw new AppError(422, "MEDIA_INVALID", "O arquivo enviado não corresponde ao tipo declarado e foi descartado. Envie outro.", { id: m.id });
    }
    verified.push({ id: m.id, size: v.size, mime: v.mime });
  }
  const r = await rpc<Row>("campaign_finalize_submission", { p_campaign: camp.id, p_user: user.id, p_submission: sid, p_verified: verified });
  if (r.first_time) wait(notifyUser(camp.id, user.id, "submission_received", sid, "Receita recebida", `Recebemos a sua receita ${r.dish_name} na campanha ${camp.name}. Ela passará por análise.`));
  return c.json({ status: r.status });
});

app.put("/campaigns/:slug/submission/:id", async (c) => {
  const { camp, user } = await collab(c, c.req.param("slug"));
  const b = await body(c);
  const fields: Row = {};
  for (const k of ["dish_name", "description", "ingredients", "preparation"]) if (typeof b[k] === "string") fields[k] = b[k];
  const ops = {
    remove: Array.isArray(b.remove) ? b.remove.filter((x: unknown) => typeof x === "string") : [],
    add: Array.isArray(b.add) ? b.add.map((m: Row) => ({ kind: m.kind, mime: m.mime, size: m.size })) : [],
  };
  const r = await rpc<Row>("campaign_update_submission", { p_campaign: camp.id, p_user: user.id, p_submission: c.req.param("id"), p_fields: fields, p_media_ops: ops });
  return c.json({ changed: r.changed, status: r.status, uploads: await uploadTokens(r.uploads ?? []) });
});

app.get("/campaigns/:slug/vote", async (c) => {
  const { camp, state, user } = await collab(c, c.req.param("slug"));
  if (!camp.features?.voting) throw new AppError(404, "CAMPAIGN_UNAVAILABLE", "Campanha indisponível.");
  let candidates: Row[] = [];
  if (["open", "paused", "closed"].includes(state.voting)) {
    const { data } = await sb.from("campaign_submissions").select("id,user_id,user_name,dish_name,description").eq("campaign_id", camp.id).eq("status", "approved").eq("is_late", false).order("dish_name");
    const media = await mediaFor((data ?? []).map((s) => s.id));
    candidates = (data ?? []).map((s) => ({
      id: s.id, dish_name: s.dish_name, author: s.user_name, description: s.description, mine: s.user_id === user.id,
      photo_url: (media[s.id] ?? []).find((m) => m.kind === "main_photo")?.url ?? (media[s.id] ?? [])[0]?.url ?? null,
      voted: state.voted_submission_id === s.id,
    }));
  }
  const stages = await getStages(camp.id);
  return c.json({ state, candidates, voting: stages.find((s) => s.stage_key === "voting") ?? null });
});

app.post("/campaigns/:slug/votes", async (c) => {
  const { camp, user } = await collab(c, c.req.param("slug"));
  const b = await body(c);
  if (b.confirm !== true) throw new AppError(400, "CONFIRM_REQUIRED", "Confirme o voto para continuar.");
  if (typeof b.submission_id !== "string") throw new AppError(400, "INVALID_FIELDS", "Escolha uma receita.");
  const r = await rpc<Row>("campaign_cast_vote", { p_campaign: camp.id, p_voter: user.id, p_voter_name: user.name, p_submission: b.submission_id });
  wait(notifyUser(camp.id, user.id, "vote_confirmed", "", "Voto registrado", `Seu voto na campanha ${camp.name} foi registrado e não pode ser alterado.`));
  return c.json({ created_at: r.created_at, dish_name: r.dish_name });
});

app.get("/campaigns/:slug/ranking", async (c) => {
  const { camp, state } = await collab(c, c.req.param("slug"));
  if (!state.ranking_visible) throw new AppError(403, "RANKING_HIDDEN", "O ranking ainda não está disponível.");
  const tally = await rpc<Row[]>("campaign_tally", { p_campaign: camp.id });
  const { data: res } = await sb.from("campaign_results").select("status").eq("campaign_id", camp.id).maybeSingle();
  // oficial só depois da DIVULGAÇÃO; antes disso só aparece se o administrador liberou o ranking parcial da campanha
  return c.json({ official: res?.status === "announced", partial: state.ranking_partial === true, items: rankedTally(tally) });
});

app.get("/campaigns/:slug/results", async (c) => {
  const { camp, state } = await collab(c, c.req.param("slug"));
  if (!state.results_visible) throw new AppError(403, "RESULTS_HIDDEN", "O resultado ainda não foi divulgado.");
  const { data: res } = await sb.from("campaign_results").select("*").eq("campaign_id", camp.id).maybeSingle();
  const { data: win } = await sb.from("campaign_submissions").select("id,dish_name,user_name,description").eq("id", res?.winner_submission_id ?? "").maybeSingle();
  const media = win ? (await mediaFor([win.id]))[win.id] ?? [] : [];
  const tally = camp.visibility?.show_podium ? rankedTally(await rpc<Row[]>("campaign_tally", { p_campaign: camp.id })).slice(0, 3).map((t) => ({ position: t.position, dish_name: t.dish_name, author: t.author, votes: t.votes })) : [];
  return c.json({
    announced_at: res?.announced_at,
    winner: win ? { id: win.id, dish_name: win.dish_name, author: win.user_name, description: win.description, votes: res.winner_votes, photo_url: media.find((m) => m.kind === "main_photo")?.url ?? media[0]?.url ?? null } : null,
    podium: tally, total_valid_votes: res?.total_valid_votes ?? 0,
  });
});

// ---------------------------------------------------------------- admin -----
app.get("/admin/me", async (c) => {
  const user = await requireUser(c);
  const perms = await getPerms(user.id);
  return c.json({ isAdmin: !!perms.campaigns, permissions: perms, name: user.name });
});

app.get("/admin/module", async (c) => {
  await requireAdmin(c, "campaigns");
  return c.json({ enabled: await rpc<boolean>("campaign_module_enabled", {}) });
});
app.put("/admin/module", async (c) => {
  const a = await requireAdmin(c, "campaigns_publish");
  const b = await body(c);
  await rpc("campaign_set_module", { p_actor: a.actor, p_enabled: b.enabled === true });
  return c.json({ enabled: b.enabled === true });
});

app.get("/admin/overview", async (c) => {
  await requireAdmin(c, "campaigns");
  runDueAnnouncements();
  const { data } = await sb.from("campaigns").select("id,status,authorized_at,visible_from,suspended_at").is("deleted_at", null);
  const rows = data ?? [];
  const now = Date.now();
  const counts = { total: rows.length, draft: 0, scheduled: 0, active: 0, closed: 0, with_results: 0 };
  for (const r of rows) {
    if (r.status === "draft" || r.status === "in_review") counts.draft++;
    else if (r.status === "authorized") { if (r.visible_from && new Date(r.visible_from).getTime() > now) counts.scheduled++; else counts.active++; }
    else if (r.status === "closed" || r.status === "archived") counts.closed++;
  }
  const liveIds = new Set(rows.map((r) => r.id));
  const { data: res } = await sb.from("campaign_results").select("campaign_id,status").in("status", ["confirmed", "announced"]);
  counts.with_results = (res ?? []).filter((r) => liveIds.has(r.campaign_id)).length;
  const { data: recent } = await sb.from("campaign_audit_log").select("occurred_at,actor_name,action,entity_type,campaign_id")
    .neq("entity_type", "vote").order("occurred_at", { ascending: false }).limit(10);
  return c.json({ counts, enabled: await rpc<boolean>("campaign_module_enabled", {}), recent: recent ?? [] });
});

app.get("/admin/campaigns", async (c) => {
  await requireAdmin(c, "campaigns");
  const onlyDeleted = c.req.query("deleted") === "1";
  let lq = sb.from("campaigns").select("id,slug,name,status,visible_from,authorized_at,suspended_at,created_at,source_campaign_id,version,deleted_at").order("created_at", { ascending: false });
  lq = onlyDeleted ? lq.not("deleted_at", "is", null) : lq.is("deleted_at", null);
  const { data } = await lq;
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const { data: subs } = ids.length ? await sb.from("campaign_submissions").select("campaign_id,status").in("campaign_id", ids) : { data: [] };
  const { data: stages } = ids.length ? await sb.from("campaign_stages").select("campaign_id,stage_key,starts_at,ends_at,paused").in("campaign_id", ids) : { data: [] };
  return c.json(rows.map((r) => ({
    ...r,
    submissions: (subs ?? []).filter((s) => s.campaign_id === r.id && s.status !== "pending_media").length,
    stages: (stages ?? []).filter((s) => s.campaign_id === r.id),
  })));
});

app.post("/admin/campaigns", async (c) => {
  const a = await requireAdmin(c, "campaigns_create");
  const b = await body(c);
  const name = String(b.name ?? "").trim();
  const base = slugify(typeof b.slug === "string" && b.slug ? b.slug : name);
  let lastErr: unknown;
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    try {
      const id = await rpc<string>("campaign_create", { p_actor: a.actor, p_fields: { ...pickConfig(b), name, slug } });
      return c.json({ id, slug });
    } catch (e) {
      lastErr = e;
      if (!(e instanceof AppError && e.code === "SLUG_TAKEN")) throw e;
    }
  }
  throw lastErr;
});
function pickConfig(b: Row): Row {
  const out: Row = {};
  for (const k of ["description", "objective", "instructions", "cover_path", "audience", "features", "visibility", "media_limits", "type"]) if (k in b) out[k] = b[k];
  return out;
}

app.get("/admin/campaigns/:id", async (c) => {
  await requireAdmin(c, "campaigns");
  const camp = await getCampaignById(c.req.param("id"));
  const [stages, results, eligible] = await Promise.all([
    getStages(camp.id),
    sb.from("campaign_results").select("*").eq("campaign_id", camp.id).maybeSingle(),
    sb.from("campaign_eligible_users").select("user_id").eq("campaign_id", camp.id),
  ]);
  const urls = await signPaths([camp.cover_path]);
  return c.json({ campaign: { ...camp, cover_url: urls[camp.cover_path] ?? null }, stages, results: results.data, eligible_user_ids: (eligible.data ?? []).map((e) => e.user_id) });
});

app.put("/admin/campaigns/:id", async (c) => {
  const a = await requireAdmin(c, "campaigns_edit");
  const b = await body(c);
  const fields = { ...pickConfig(b), ...(typeof b.name === "string" ? { name: b.name } : {}) };
  await rpc("campaign_update", { p_actor: a.actor, p_campaign: c.req.param("id"), p_fields: fields, p_expected_version: typeof b.version === "number" ? b.version : null });
  return c.json({ ok: true });
});

app.put("/admin/campaigns/:id/audience", async (c) => {
  const a = await requireAdmin(c, "campaigns_edit");
  const b = await body(c);
  const id = c.req.param("id");
  const audience = b.audience ?? { mode: "all" };
  await rpc("campaign_update", { p_actor: a.actor, p_campaign: id, p_fields: { audience }, p_expected_version: null });
  if (audience.mode === "users") await rpc("campaign_set_eligible_users", { p_actor: a.actor, p_campaign: id, p_users: Array.isArray(b.users) ? b.users : [] });
  return c.json({ eligible_count: await rpc<number>("campaign_eligible_count", { p_campaign: id }) });
});

app.get("/admin/users", async (c) => {
  await requireAdmin(c, "campaigns_edit");
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return c.json((data?.users ?? []).map((u) => ({ id: u.id, name: u.user_metadata?.name || (u.email ?? "").split("@")[0], department: u.user_metadata?.department ?? "", unit: u.user_metadata?.lunch_location ?? "" })).sort((x, y) => x.name.localeCompare(y.name)));
});

// Participação e votação de campanha COM votação só mudam pelo cronograma (PUT /period): uma etapa isolada poderia
// quebrar a sequência estrita (participação -> votação -> divulgação). Apuração/divulgação e campanha sem votação seguem livres.
async function assertStageEditable(id: string, stage: string) {
  if (stage !== "registration" && stage !== "voting") return;
  const camp = await getCampaignById(id);
  if (camp.features?.voting) throw new AppError(409, "INVALID_STATE", "Use o cronograma da campanha (participação, votação e divulgação): as datas são ajustadas em conjunto.");
}
for (const [route, key] of [["stages/:key", "campaigns_schedule"]] as const) {
  app.put(`/admin/campaigns/:id/${route}`, async (c) => {
    const a = await requireAdmin(c, key);
    const b = await body(c);
    await assertStageEditable(c.req.param("id"), c.req.param("key"));
    await rpc("campaign_set_stage", { p_actor: a.actor, p_campaign: c.req.param("id"), p_stage: c.req.param("key"), p_starts: b.starts_at ?? null, p_ends: b.ends_at ?? null, p_reason: strOrUndef(b.reason) ?? null });
    return c.json({ ok: true });
  });
}
// Cronograma da campanha (rodada 5): participação [starts_at, ends_at] -> votação [voting_starts_at, voting_ends_at] -> divulgação
// (announce_at), em SEQUÊNCIA ESTRITA quando há votação. A PRESENÇA da chave importa: `voting_*` ausentes = modo legado (a votação
// acompanha a participação, igual ao período único de antes; campanha com votação própria mantém a dela); `announce_at` ausente = não
// mexe, nulo = limpa. Tudo numa transação do banco (campaign_set_schedule): reenviar as mesmas datas não grava nem audita.
app.put("/admin/campaigns/:id/period", async (c) => {
  const a = await requireAdmin(c, "campaigns_schedule");
  const b = await body(c);
  const period: Row = { starts_at: isoOrNull(b.starts_at), ends_at: isoOrNull(b.ends_at) };
  if ("voting_starts_at" in b) period.voting_starts_at = isoOrNull(b.voting_starts_at);
  if ("voting_ends_at" in b) period.voting_ends_at = isoOrNull(b.voting_ends_at);
  if ("announce_at" in b) period.announce_at = isoOrNull(b.announce_at);
  const r = await rpc<Row>("campaign_set_schedule", { p_actor: a.actor, p_campaign: c.req.param("id"), p_period: period });
  return c.json({ ok: true, changed: r?.changed === true });
});
app.post("/admin/campaigns/:id/stages/:key/extend", async (c) => {
  const a = await requireAdmin(c, "campaigns_schedule");
  const b = await body(c);
  await assertStageEditable(c.req.param("id"), c.req.param("key"));
  await rpc("campaign_extend_stage", { p_actor: a.actor, p_campaign: c.req.param("id"), p_stage: c.req.param("key"), p_new_ends: b.ends_at ?? null, p_reason: strOrUndef(b.reason) ?? null });
  return c.json({ ok: true });
});
app.post("/admin/campaigns/:id/stages/:key/pause", async (c) => {
  const a = await requireAdmin(c, "campaigns_schedule");
  const b = await body(c);
  await rpc("campaign_pause_stage", { p_actor: a.actor, p_campaign: c.req.param("id"), p_stage: c.req.param("key"), p_pause: b.pause !== false, p_reason: strOrUndef(b.reason) ?? null });
  return c.json({ ok: true });
});

app.post("/admin/campaigns/:id/submit-for-review", async (c) => {
  const a = await requireAdmin(c, "campaigns_edit");
  await rpc("campaign_submit_for_review", { p_actor: a.actor, p_campaign: c.req.param("id") });
  return c.json({ ok: true });
});
app.get("/admin/campaigns/:id/publish-check", async (c) => {
  await requireAdmin(c, "campaigns_edit");
  return c.json(await rpc("campaign_publish_check", { p_campaign: c.req.param("id") }));
});
app.post("/admin/campaigns/:id/publish", async (c) => {
  const a = await requireAdmin(c, "campaigns_publish");
  const b = await body(c);
  const id = c.req.param("id");
  const r = await rpc<Row>("campaign_publish", { p_actor: a.actor, p_campaign: id, p_opts: {
    visible_from: b.visible_from ?? null, allow_preview: b.allow_preview === true,
    tour_enabled: b.tour_enabled !== false, tour_reshow: b.tour_reshow === true, notify: b.notify === true } });
  if (r.notify) {
    const camp = await getCampaignById(id);
    wait(eligibleUserIds(id).then((ids) => notifyMany(id, ids, "campaign_published", `Nova campanha: ${camp.name}`, "Abra o menu Campanhas para participar.")));
  }
  return c.json({ visible_from: r.visible_from, module_enabled_now: r.module_enabled_now, eligible_count: r.eligible_count });
});
for (const [route, fnName, key] of [
  ["suspend", "campaign_suspend", "campaigns_publish"], ["resume", "campaign_resume", "campaigns_publish"],
  ["return-to-draft", "campaign_back_to_draft", "campaigns_edit"], ["close", "campaign_close", "campaigns_publish"],
  ["archive", "campaign_archive", "campaigns_edit"],
] as const) {
  app.post(`/admin/campaigns/:id/${route}`, async (c) => {
    const a = await requireAdmin(c, key);
    const b = await body(c);
    const args: Row = { p_actor: a.actor, p_campaign: c.req.param("id") };
    if (fnName === "campaign_suspend" || fnName === "campaign_close") args.p_reason = strOrUndef(b.reason) ?? null;
    await rpc(fnName, args);
    return c.json({ ok: true });
  });
}
app.delete("/admin/campaigns/:id", async (c) => {
  const a = await requireAdmin(c, "campaigns_edit");
  await rpc("campaign_delete_empty_draft", { p_actor: a.actor, p_campaign: c.req.param("id") });
  return c.json({ ok: true });
});
// "Excluir campanha" = OCULTAR: nada é apagado (receitas, votos e auditoria ficam); só campanha fora do ar; confirma-se digitando o nome.
app.post("/admin/campaigns/:id/soft-delete", async (c) => {
  const a = await requireAdmin(c, "campaigns_edit");
  const b = await body(c);
  await rpc("campaign_soft_delete", { p_actor: a.actor, p_campaign: c.req.param("id"), p_confirm: typeof b.confirm === "string" ? b.confirm : "" });
  return c.json({ ok: true });
});
app.post("/admin/campaigns/:id/restore", async (c) => {
  const a = await requireAdmin(c, "campaigns_edit");
  await rpc("campaign_restore", { p_actor: a.actor, p_campaign: c.req.param("id") });
  return c.json({ ok: true });
});
app.post("/admin/campaigns/:id/duplicate", async (c) => {
  const a = await requireAdmin(c, "campaigns_duplicate");
  const b = await body(c);
  const src = await getCampaignById(c.req.param("id"));
  const name = String(b.name ?? `${src.name} (cópia)`).trim();
  const base = slugify(name);
  for (let i = 0; i < 6; i++) {
    try {
      const id = await rpc<string>("campaign_duplicate", { p_actor: a.actor, p_source: src.id, p_name: name, p_slug: i === 0 ? base : `${base}-${i + 1}` });
      return c.json({ id });
    } catch (e) { if (!(e instanceof AppError && e.code === "SLUG_TAKEN")) throw e; }
  }
  throw new AppError(409, "SLUG_TAKEN", ERR.SLUG_TAKEN[1]);
});

app.get("/admin/campaigns/:id/dashboard", async (c) => {
  const a = await requireAdmin(c, "campaigns");
  const id = c.req.param("id");
  const camp = await getCampaignById(id);
  const [subs, votes, eligible, results, stages] = await Promise.all([
    sb.from("campaign_submissions").select("status,user_id,is_late").eq("campaign_id", id),
    sb.from("campaign_votes").select("voter_id,invalidated_at").eq("campaign_id", id),
    rpc<number>("campaign_eligible_count", { p_campaign: id }),
    sb.from("campaign_results").select("status,winner_submission_id,winner_votes,confirmed_at,announced_at,total_valid_votes,announce_at,announce_scheduled_by_name,announce_scheduled_at").eq("campaign_id", id).maybeSingle(),
    getStages(id),
  ]);
  const sRows = (subs.data ?? []).filter((s) => s.status !== "pending_media");
  const by = (st: string) => sRows.filter((s) => s.status === st).length;
  const vRows = votes.data ?? [];
  const valid = vRows.filter((v) => !v.invalidated_at).length;
  const out: Row = {
    eligible: eligible, submissions: sRows.length, pending: by("submitted") + by("in_review"), approved: by("approved"), rejected: by("rejected"),
    participants: new Set(sRows.map((s) => s.user_id)).size,
    votes_registered: vRows.length, votes_valid: valid, votes_invalidated: vRows.length - valid,
    voters: new Set(vRows.filter((v) => !v.invalidated_at).map((v) => v.voter_id)).size,
    participation_pct: eligible ? Math.round((new Set(sRows.map((s) => s.user_id)).size / eligible) * 100) : 0,
    voting_pct: eligible ? Math.round((new Set(vRows.filter((v) => !v.invalidated_at).map((v) => v.voter_id)).size / eligible) * 100) : 0,
    results: results.data, stages, locked: !!camp.edit_locked_at,
    late: sRows.filter((s) => s.is_late).length,
  };
  // Acompanhamento AO VIVO (só a gestão): ranking e contagem por receita já durante a votação. O colaborador nunca
  // recebe isso (nenhuma rota de colaborador devolve contagem). `results_locked` fica só por compatibilidade com a
  // tela antiga; o que vale é `voting_live` (votação aberta = ranking PARCIAL).
  const gate = await resultsGate(camp, stages);
  out.results_locked = gate.locked;
  out.voting_ends_at = gate.endsAt;
  // ao vivo = votação ABERTA ou PAUSADA (antes de abrir não há ranking parcial a acompanhar); `voting_state` diz em qual estado está
  const vl = votingLive(camp, stages);
  out.voting_live = vl.live;
  out.voting_state = vl.state;
  if (gate.hasVoting) out.tally = rankedTally(await rpc<Row[]>("campaign_tally", { p_campaign: id }));
  return c.json(out);
});

app.get("/admin/campaigns/:id/submissions", async (c) => {
  await requireAdmin(c, "campaigns_review");
  const id = c.req.param("id");
  let q = sb.from("campaign_submissions").select("id,user_id,slot,user_name,user_department,dish_name,status,submitted_at,reviewed_at,rejection_reason,content_version,is_late").eq("campaign_id", id).neq("status", "pending_media").order("submitted_at", { ascending: false }).limit(500);
  const status = c.req.query("status");
  if (status && status !== "all") q = status === "pending" ? q.in("status", ["submitted", "in_review"]) : q.eq("status", status);
  if (c.req.query("from")) q = q.gte("submitted_at", c.req.query("from")!);
  if (c.req.query("to")) q = q.lte("submitted_at", c.req.query("to")!);
  const { data } = await q;
  const term = (c.req.query("q") ?? "").toLowerCase().trim();
  return c.json((data ?? []).filter((s) => !term || s.dish_name.toLowerCase().includes(term) || s.user_name.toLowerCase().includes(term)));
});
app.get("/admin/campaigns/:id/submissions/:sid", async (c) => {
  const a = await requireAdmin(c, "campaigns_review");
  const id = c.req.param("id");
  const { data: s } = await sb.from("campaign_submissions").select("*").eq("id", c.req.param("sid")).eq("campaign_id", id).maybeSingle();
  if (!s) throw new AppError(404, "SUBMISSION_NOT_FOUND", ERR.SUBMISSION_NOT_FOUND[1]);
  const media = (await mediaFor([s.id]))[s.id] ?? [];
  const { data: hist } = await sb.from("campaign_audit_log").select("occurred_at,actor_name,action,before,after,reason").eq("campaign_id", id).eq("entity_type", "submission").eq("entity_id", s.id).order("occurred_at", { ascending: false }).limit(50);
  return c.json({ submission: s, media, history: hist ?? [], locked: await rpc<boolean>("campaign_is_locked", { p_campaign: id }), can_view_votes: a.perms.campaigns_votes_view });
});
app.post("/admin/campaigns/:id/submissions/:sid/approve", async (c) => {
  const a = await requireAdmin(c, "campaigns_review");
  const id = c.req.param("id");
  const r = await rpc<Row>("campaign_review", { p_actor: a.actor, p_campaign: id, p_submission: c.req.param("sid"), p_decision: "approve", p_reason: null }).catch((e) => { throw reviewErr(e); });
  const camp = await getCampaignById(id);
  wait(notifyUser(id, r.user_id, "submission_approved", c.req.param("sid"), "Receita aprovada", `Sua receita ${r.dish_name} foi aprovada na campanha ${camp.name}.`));
  return c.json({ status: r.status });
});
app.post("/admin/campaigns/:id/submissions/:sid/reject", async (c) => {
  const a = await requireAdmin(c, "campaigns_review");
  const id = c.req.param("id");
  const b = await body(c);
  const r = await rpc<Row>("campaign_review", { p_actor: a.actor, p_campaign: id, p_submission: c.req.param("sid"), p_decision: "reject", p_reason: strOrUndef(b.reason) ?? "" }).catch((e) => { throw reviewErr(e); });
  const camp = await getCampaignById(id);
  wait(notifyUser(id, r.user_id, "submission_rejected", c.req.param("sid"), "Receita reprovada", `Sua receita ${r.dish_name} não foi aprovada na campanha ${camp.name}. Veja o motivo em Minhas receitas.`));
  return c.json({ status: r.status });
});
app.put("/admin/campaigns/:id/submissions/:sid", async (c) => {
  const a = await requireAdmin(c, "campaigns_review");
  const b = await body(c);
  const fields: Row = {};
  for (const k of ["dish_name", "description", "ingredients", "preparation"]) if (typeof b[k] === "string") fields[k] = b[k];
  await rpc("campaign_admin_edit_submission", { p_actor: a.actor, p_campaign: c.req.param("id"), p_submission: c.req.param("sid"), p_fields: fields, p_reason: strOrUndef(b.reason) ?? "" });
  return c.json({ ok: true });
});

app.get("/admin/campaigns/:id/participants", async (c) => {
  const a = await requireAdmin(c, "campaigns_participants");
  const withVotes = a.perms.campaigns_votes_view === true;
  const pid = c.req.param("id");
  const rows = await rpc<Row[]>("campaign_participants", { p_campaign: pid, p_with_votes: withVotes });
  const lateIds = await lateSubmissionIds(pid);
  return c.json({ with_votes: withVotes, items: rows.map((r) => ({ ...r, is_late: !!r.submission_id && lateIds.has(r.submission_id) })) });
});

app.get("/admin/campaigns/:id/votes", async (c) => {
  await requireAdmin(c, "campaigns_votes_view");
  const id = c.req.param("id");
  // Acompanhamento ao vivo da gestão: quem votou em qual receita (exige `campaigns_votes_view`) já durante a votação.
  // O colaborador nunca recebe isto. `locked` fica sempre false (compatível com a tela antiga).
  const gate = await resultsGate(await getCampaignById(id));
  const { data: votes } = await sb.from("campaign_votes").select("id,voter_name,submission_id,created_at,invalidated_at,invalidated_by_name,invalidation_reason").eq("campaign_id", id).order("created_at", { ascending: false });
  const { data: subs } = await sb.from("campaign_submissions").select("id,dish_name").eq("campaign_id", id);
  const names = Object.fromEntries((subs ?? []).map((s) => [s.id, s.dish_name]));
  return c.json({ locked: false, items: (votes ?? []).map((v) => ({ ...v, dish_name: names[v.submission_id] })), voting_ends_at: gate.endsAt });
});
app.post("/admin/campaigns/:id/votes/:vid/invalidate", async (c) => {
  const a = await requireAdmin(c, "campaigns_votes_invalidate");
  const b = await body(c);
  await rpc("campaign_invalidate_vote", { p_actor: a.actor, p_campaign: c.req.param("id"), p_vote: c.req.param("vid"), p_reason: strOrUndef(b.reason) ?? "" });
  return c.json({ ok: true });
});

app.post("/admin/campaigns/:id/voting/close", async (c) => {
  const a = await requireAdmin(c, "campaigns_schedule");
  const b = await body(c);
  return c.json(await rpc("campaign_close_voting", { p_actor: a.actor, p_campaign: c.req.param("id"), p_end_now: b.end_now === true }));
});
app.get("/admin/campaigns/:id/results", async (c) => {
  await requireAdmin(c, "campaigns_results");
  const id = c.req.param("id");
  const campR = await getCampaignById(id);
  const stagesR = await getStages(id);
  const gate = await resultsGate(campR, stagesR);
  const { data: res } = await sb.from("campaign_results").select("*").eq("campaign_id", id).maybeSingle();
  // A contagem por receita vem SEMPRE (acompanhamento ao vivo da gestão). `tally_locked` agora só significa
  // "ainda não é o resultado OFICIAL" (votação aberta): apurar/desempatar/confirmar/divulgar seguem só após o
  // encerramento, no banco. `voting_live` = o ranking em `tally` é parcial.
  const tally = await rpc<Row[]>("campaign_tally", { p_campaign: id });
  const vlR = votingLive(campR, stagesR);
  return c.json({ results: res, tally: rankedTally(tally), tally_locked: gate.locked, voting_live: vlR.live, voting_state: vlR.state, voting_ends_at: gate.endsAt });
});
app.post("/admin/campaigns/:id/results/tiebreak", async (c) => {
  const a = await requireAdmin(c, "campaigns_tiebreak");
  const b = await body(c);
  await rpc("campaign_decide_tie", { p_actor: a.actor, p_campaign: c.req.param("id"), p_submission: String(b.submission_id ?? ""), p_justification: strOrUndef(b.justification) ?? "" });
  return c.json({ ok: true });
});
app.post("/admin/campaigns/:id/results/confirm", async (c) => {
  const a = await requireAdmin(c, "campaigns_winner_confirm");
  return c.json(await rpc("campaign_confirm_winner", { p_actor: a.actor, p_campaign: c.req.param("id") }));
});
app.post("/admin/campaigns/:id/results/announce", async (c) => {
  const a = await requireAdmin(c, "campaigns_announce");
  const id = c.req.param("id");
  // Divulgar AGORA. As notificações (vencedor + participantes) são gravadas pelo próprio banco, na mesma
  // transação e uma única vez por pessoa — a API não faz mais envio em segundo plano.
  await rpc<Row>("campaign_announce", { p_actor: a.actor, p_campaign: id });
  return c.json({ ok: true });
});
// ranking PARCIAL para os colaboradores: opção do administrador, por campanha (desligada por padrão)
app.put("/admin/campaigns/:id/partial-ranking", async (c) => {
  const a = await requireAdmin(c, "campaigns_announce");
  const b = await body(c);
  if (typeof b.enabled !== "boolean") throw new AppError(422, "INVALID_FIELDS", ERR.INVALID_FIELDS[1]);
  const r = await rpc<Row>("campaign_set_partial_ranking", { p_actor: a.actor, p_campaign: c.req.param("id"), p_enabled: b.enabled });
  return c.json({ ok: true, enabled: r.enabled === true });
});
app.post("/admin/campaigns/:id/notify", async (c) => {
  await requireAdmin(c, "campaigns_schedule");
  const b = await body(c);
  const id = c.req.param("id");
  if (b.event !== "voting_open") throw new AppError(400, "INVALID_FIELDS", "Evento inválido.");
  const camp = await getCampaignById(id);
  const ids = await eligibleUserIds(id);
  wait(notifyMany(id, ids, "voting_open", "A votação começou", `A votação da campanha ${camp.name} está aberta. Escolha a sua receita favorita.`));
  return c.json({ queued: ids.length });
});

app.get("/admin/campaigns/:id/audit", async (c) => {
  const a = await requireAdmin(c, "campaigns");
  const { data } = await sb.from("campaign_audit_log").select("id,occurred_at,actor_name,actor_role,action,entity_type,entity_id,before,after,reason")
    .eq("campaign_id", c.req.param("id")).order("occurred_at", { ascending: false }).limit(500);
  // Linhas de voto (CAST_VOTE) só para quem tem `campaigns_votes_view` (acompanhamento ao vivo da gestão).
  const seeVotes = a.perms.campaigns_votes_view === true;
  return c.json((data ?? []).filter((r) => seeVotes || r.entity_type !== "vote"));
});

app.get("/admin/campaigns/:id/export/:kind", async (c) => {
  const a = await requireAdmin(c, "campaigns_export");
  const id = c.req.param("id");
  const kind = c.req.param("kind");
  const camp = await getCampaignById(id);
  const gate = await resultsGate(camp);
  const assertResultsOpen = () => { if (gate.locked) throw new AppError(409, "RESULTS_LOCKED", ERR.RESULTS_LOCKED[1]); };
  // Período (`?from=&to=`): sem período = relatório inteiro. A coluna de data muda por relatório (ver abaixo); o relatório
  // `result` (situação do resultado oficial) ignora o período.
  const rr = resolveRange(c.req.query("from"), c.req.query("to"));
  if ("error" in rr) throw new AppError(422, "INVALID_RANGE", ERR.INVALID_RANGE[1], { reason: rr.error });
  const range = kind === "result" ? { from: null, to: null } : rr.range;
  const hasRange = !!(range.from || range.to);
  const inRange = (v: unknown) => {
    if (!hasRange) return true;
    if (!v) return false;
    const t = new Date(String(v)).getTime();
    return (!range.from || t >= new Date(range.from).getTime()) && (!range.to || t <= new Date(range.to).getTime());
  };
  const yn = (b: boolean) => (b ? "Sim" : "Não");
  const sub = async (statuses: string[] | undefined, dateCol: "submitted_at" | "reviewed_at") => {
    let q = sb.from("campaign_submissions").select("user_name,user_department,user_unit,dish_name,description,ingredients,preparation,status,rejection_reason,submitted_at,reviewed_by_name,reviewed_at,is_late").eq("campaign_id", id).neq("status", "pending_media").order("submitted_at");
    if (statuses) q = q.in("status", statuses);
    if (range.from) q = q.gte(dateCol, range.from);
    if (range.to) q = q.lte(dateCol, range.to);
    return (await q).data ?? [];
  };
  const stOf: Record<string, string> = { submitted: "Enviada", in_review: "Em análise", approved: "Aprovada", rejected: "Reprovada" };
  let columns: string[] = []; let rows: unknown[][] = [];
  if (kind === "participants") {
    const withVotes = a.perms.campaigns_votes_view === true;
    const p = await rpc<Row[]>("campaign_participants", { p_campaign: id, p_with_votes: withVotes });
    const lateIds = await lateSubmissionIds(id);
    // com várias receitas por pessoa há uma linha por receita (coluna "Prato" identifica qual). Data do período = data de envio.
    columns = ["Nome", "Departamento", "Unidade", "Receita", "Prato", "Status", "Enviada em", "Fora do prazo", ...(withVotes ? ["Votou"] : [])];
    rows = p.filter((x) => inRange(x.submitted_at)).map((x) => [x.user_name, x.department, x.unit, x.submission_id ? "Sim" : "Não", x.dish_name ?? "", stOf[x.submission_status] ?? "", x.submitted_at ?? "",
      yn(!!x.submission_id && lateIds.has(x.submission_id)), ...(withVotes ? [x.voted ? "Sim" : "Não"] : [])]);
  } else if (kind === "submissions" || kind === "approved" || kind === "rejected") {
    // enviadas = data de envio; aprovadas/reprovadas = data da análise
    const s = await sub(kind === "approved" ? ["approved"] : kind === "rejected" ? ["rejected"] : undefined, kind === "submissions" ? "submitted_at" : "reviewed_at");
    columns = ["Participante", "Departamento", "Prato", "Descrição", "Ingredientes", "Modo de preparo", "Status", "Justificativa", "Enviada em", "Analisada por", "Analisada em", "Fora do prazo"];
    rows = s.map((x) => [x.user_name, x.user_department, x.dish_name, x.description, x.ingredients, x.preparation, stOf[x.status], x.rejection_reason ?? "", x.submitted_at, x.reviewed_by_name ?? "", x.reviewed_at ?? "", yn(!!x.is_late)]);
  } else if (kind === "voting" || kind === "ranking") {
    if (!a.perms.campaigns_results) throw new AppError(403, "FORBIDDEN", "Você não tem permissão para esta ação.");
    // ranking/votação por receita: liberados a qualquer momento para a gestão (acompanhamento ao vivo; parcial durante a votação).
    // Com período, conta só os votos válidos DAQUELE período; as receitas fora do prazo nunca entram.
    const t = hasRange
      ? await rpc<Row[]>("campaign_tally_period", { p_campaign: id, p_from: range.from, p_to: range.to })
      : await rpc<Row[]>("campaign_tally", { p_campaign: id });
    columns = ["Posição", "Prato", "Autor", "Votos válidos"];
    rows = rankedTally(t).map((x) => [x.position, x.dish_name, x.author, x.votes]);
  } else if (kind === "result") {
    if (!a.perms.campaigns_results) throw new AppError(403, "FORBIDDEN", "Você não tem permissão para esta ação.");
    assertResultsOpen();
    const { data: r } = await sb.from("campaign_results").select("*").eq("campaign_id", id).maybeSingle();
    columns = ["Campanha", "Situação", "Votos válidos", "Vencedor (id da receita)", "Votos do vencedor", "Confirmado por", "Confirmado em", "Divulgado em"];
    rows = [[camp.name, r?.status ?? "", r?.total_valid_votes ?? 0, r?.winner_submission_id ?? "", r?.winner_votes ?? "", r?.confirmed_by_name ?? "", r?.confirmed_at ?? "", r?.announced_at ?? ""]];
  } else if (kind === "history") {
    let hq = sb.from("campaign_audit_log").select("occurred_at,actor_name,action,entity_type,reason").eq("campaign_id", id).order("occurred_at");
    if (range.from) hq = hq.gte("occurred_at", range.from);
    if (range.to) hq = hq.lte("occurred_at", range.to);
    const { data } = await hq;
    const seeVotes = a.perms.campaigns_votes_view === true;
    columns = ["Quando", "Quem", "Ação", "Tipo", "Justificativa"];
    rows = (data ?? []).filter((r) => seeVotes || r.entity_type !== "vote").map((r) => [r.occurred_at, r.actor_name, r.action, r.entity_type, r.reason ?? ""]);
  } else if (kind === "votes") {
    if (!a.perms.campaigns_export_votes || !a.perms.campaigns_votes_view) throw new AppError(403, "FORBIDDEN", "Você não tem permissão para exportar votos individuais.");
    let vq = sb.from("campaign_votes").select("voter_name,submission_id,created_at,invalidated_at,invalidation_reason").eq("campaign_id", id).order("created_at");
    if (range.from) vq = vq.gte("created_at", range.from);
    if (range.to) vq = vq.lte("created_at", range.to);
    const { data: votes } = await vq;
    const { data: subs } = await sb.from("campaign_submissions").select("id,dish_name").eq("campaign_id", id);
    const names = Object.fromEntries((subs ?? []).map((s) => [s.id, s.dish_name]));
    columns = ["Votante", "Receita votada", "Votou em", "Invalidado em", "Justificativa da invalidação"];
    rows = (votes ?? []).map((v) => [v.voter_name, names[v.submission_id], v.created_at, v.invalidated_at ?? "", v.invalidation_reason ?? ""]);
  } else throw new AppError(400, "INVALID_FIELDS", "Relatório inválido.");
  await rpc("campaign_audit", { p_campaign: id, p_actor: a.actor, p_action: "EXPORT_REPORT", p_entity_type: "report", p_entity_id: kind, p_before: null, p_after: { rows: rows.length, ...(hasRange ? { from: range.from, to: range.to } : {}) }, p_reason: null });
  return c.json({ kind, columns, rows, range: hasRange ? range : null });
});

app.post("/admin/media/upload-url", async (c) => {
  await requireAdmin(c, "campaigns_edit");
  const b = await body(c);
  const mime = String(b.mime ?? "").toLowerCase();
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[mime];
  if (!ext) throw new AppError(422, "MEDIA_INVALID", ERR.MEDIA_INVALID[1]);
  const path = `covers/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new AppError(500, "UPLOAD_URL", "Não foi possível preparar o envio do arquivo.");
  return c.json({ path, token: data.token, signedUrl: data.signedUrl });
});

app.get("/admin/access", async (c) => {
  await requireAdmin(c, "campaigns_access");
  const { data } = await sb.from("campaign_admins").select("*").order("user_name");
  return c.json({ items: data ?? [], keys: ALL_PERMS });
});
app.put("/admin/access/:userId", async (c) => {
  const a = await requireAdmin(c, "campaigns_access");
  const b = await body(c);
  const perms: Record<string, boolean> = {};
  for (const k of ALL_PERMS) perms[k] = b.permissions?.[k] === true;
  if (Object.values(perms).some(Boolean)) perms.campaigns = true;
  await rpc("campaign_admin_set", { p_actor: a.actor, p_user: c.req.param("userId"), p_name: strOrUndef(b.name) ?? "", p_permissions: perms });
  return c.json({ ok: true });
});
app.delete("/admin/access/:userId", async (c) => {
  const a = await requireAdmin(c, "campaigns_access");
  await rpc("campaign_admin_remove", { p_actor: a.actor, p_user: c.req.param("userId") });
  return c.json({ ok: true });
});

// Livro de Receitas ÚNICO (rotas em recipebook.ts; as regras vivem nas funções recipe_book_* do banco)
registerRecipeBookRoutes(app, { sb, BUCKET, AppError, rpc, requireUser, requireAdmin, body, signPaths, verifyObject });
// Dashboard dos relatórios (rodada 5): GET /admin/campaigns/:id/analytics (rotas em analytics.ts; números vêm do banco)
registerAnalyticsRoutes(app, { AppError, rpc, requireAdmin });

Deno.serve(app.fetch);
