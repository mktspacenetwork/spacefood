import { projectId, publicAnonKey } from "/utils/supabase/info";
import { supabase } from "../supabase";

/**
 * Cliente da API do Gerenciador de Campanhas (Edge Function `campaigns-api`,
 * separada da função principal do site). Mesmo esquema de autenticação do
 * `lib/api.ts`: chave anon em `Authorization` (gateway) e JWT do usuário em
 * `X-User-Auth-Token` (autenticação da aplicação).
 */
const BASE = `https://${projectId}.supabase.co/functions/v1/campaigns-api`;

export class CampaignApiError extends Error {
  status: number;
  code: string;
  details?: any;
  constructor(status: number, code: string, message: string, details?: any) {
    super(message);
    this.name = "CampaignApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Mensagem pronta para o usuário a partir de qualquer erro. */
export function errMsg(e: unknown, fallback = "Não foi possível concluir a ação. Tente novamente."): string {
  if (e instanceof CampaignApiError) return e.message || fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

async function getToken(force = false): Promise<string | null> {
  try {
    if (!force) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        if (session.expires_at && session.expires_at * 1000 - Date.now() < 90_000) {
          const { data: { session: refreshed } } = await supabase.auth.refreshSession();
          if (refreshed?.access_token) return refreshed.access_token;
        }
        return session.access_token;
      }
    }
    const { data: { session: s } } = await supabase.auth.refreshSession();
    return s?.access_token ?? null;
  } catch {
    return null;
  }
}

async function doFetch(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${publicAnonKey}` };
  if (token) headers["X-User-Auth-Token"] = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const init: RequestInit = { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined };
  // Só repete GET em falha de rede; POST/PUT não repetem para nunca duplicar uma ação.
  const attempts = method === "GET" ? 3 : 1;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(`${BASE}${path}`, init);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw new CampaignApiError(0, "NETWORK", "Sem conexão com o servidor. Verifique sua internet e tente de novo.", lastErr);
}

async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let token = await getToken();
  let res = await doFetch(method, path, token, body);
  if (res.status === 401) {
    token = await getToken(true);
    if (token) res = await doFetch(method, path, token, body);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new CampaignApiError(res.status, data?.code ?? "ERROR", data?.error ?? `Erro inesperado (${res.status}).`, data?.details);
  }
  return data as T;
}

export const campaignsApi = {
  get: <T = any>(path: string) => request<T>("GET", path),
  post: <T = any>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T = any>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  del: <T = any>(path: string) => request<T>("DELETE", path),
};

/**
 * Envia um arquivo direto ao Storage por URL assinada (não passa pela função),
 * com progresso. Mesmo formato que o cliente oficial usa em `uploadToSignedUrl`.
 */
export function uploadToSignedUrl(
  signedUrl: string,
  file: Blob,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("apikey", publicAnonKey);
    xhr.setRequestHeader("Authorization", `Bearer ${publicAnonKey}`);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new CampaignApiError(xhr.status, "UPLOAD_FAILED", "Falha ao enviar o arquivo. Tente novamente."));
      }
    };
    xhr.onerror = () => reject(new CampaignApiError(0, "NETWORK", "Falha de conexão durante o envio. Tente novamente."));
    xhr.onabort = () => reject(new CampaignApiError(0, "ABORTED", "Envio cancelado."));
    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}

/** Ponto único de verificação: "este usuário vê o menu Campanhas?" (não bloqueia a tela em caso de erro). */
export type CampaignAvailability = {
  enabled: boolean;
  /** Há campanha visível OU o Livro de Receitas está publicado: o item "Campanhas" aparece no menu. */
  hasVisible: boolean;
  /** O Livro de Receitas (único) está publicado para os colaboradores. */
  book: boolean;
  campaigns: { id: string; slug: string; tour: { enabled: boolean; version: number } }[];
};

export async function fetchCampaignAvailability(): Promise<CampaignAvailability> {
  try {
    const r = await campaignsApi.get<Partial<CampaignAvailability>>("/campaigns/availability");
    const book = r.book === true;
    return { enabled: r.enabled === true, hasVisible: r.hasVisible === true || book, book, campaigns: r.campaigns ?? [] };
  } catch {
    return { enabled: false, hasVisible: false, book: false, campaigns: [] };
  }
}

/** "Este usuário administra campanhas?" — lista própria do módulo, independente das permissões do site. */
export async function fetchCampaignAdminMe(): Promise<{ isAdmin: boolean; permissions: Record<string, boolean>; name: string }> {
  try {
    return await campaignsApi.get("/admin/me");
  } catch {
    return { isAdmin: false, permissions: {}, name: "" };
  }
}
