import { projectId, publicAnonKey } from "/utils/supabase/info";
import { supabase } from "./supabase";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-c3078087`;

// ── Simple in-memory TTL cache for GET requests ──────────────────────────
const _cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL: Record<string, number> = {
  "/admin/settings": 60_000,    // 60s — rarely changes mid-session
  "/menu/available-dates": 30_000, // 30s
};

function getCached(path: string): any | undefined {
  const ttl = CACHE_TTL[path];
  if (!ttl) return undefined;
  const entry = _cache.get(path);
  if (entry && Date.now() - entry.ts < ttl) return entry.data;
  return undefined;
}

function setCache(path: string, data: any) {
  if (CACHE_TTL[path]) _cache.set(path, { data, ts: Date.now() });
}

/** Evict a cached key (call after mutations that change the resource). */
export function invalidateCache(path: string) {
  _cache.delete(path);
}

/**
 * Returns the current user access token, refreshing if needed.
 * Falls back to publicAnonKey if no valid session exists.
 */
async function getAuthToken(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      // Proactively refresh if token expires within 90 seconds
      if (session.expires_at && session.expires_at * 1000 - Date.now() < 90000) {
        console.log('[api] Session near expiry, refreshing proactively...');
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        if (refreshed?.access_token) return refreshed.access_token;
      }
      return session.access_token;
    }
    // No active session in memory — attempt a silent refresh (uses refresh token from storage)
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    if (refreshed?.access_token) return refreshed.access_token;
  } catch (e) {
    console.error('[api] getAuthToken error:', e);
  }
  return publicAnonKey;
}

async function forceRefreshToken(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (session?.access_token) return session.access_token;
  } catch (e) {
    console.error('[api] forceRefreshToken error:', e);
  }
  return publicAnonKey;
}

/**
 * Build headers for non-authenticated requests.
 * ALWAYS uses the anon key in Authorization so the Supabase gateway
 * always allows the Edge Function invocation through.
 */
const buildHeaders = (extra?: Record<string, string>): Record<string, string> => ({
  'Authorization': `Bearer ${publicAnonKey}`,
  ...extra,
});

/**
 * Performs a fetch to a protected endpoint.
 *
 * Key design: the anon key goes in `Authorization` (required by Supabase gateway
 * to invoke the Edge Function), and the user JWT goes in `X-User-Auth-Token`
 * (read by our Hono server for application-level auth). This prevents the Supabase
 * gateway from returning 401 when the user JWT is expired or temporarily invalid.
 */
async function authFetchWithRetry(
  url: string,
  init: RequestInit,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const userToken = await getAuthToken();

  const buildAuthHeaders = (token: string): Record<string, string> => {
    const hdrs: Record<string, string> = {
      'Authorization': `Bearer ${publicAnonKey}`, // Gateway auth (always anon key)
      ...extraHeaders,
    };
    if (token !== publicAnonKey) {
      hdrs['X-User-Auth-Token'] = token; // Application-level user auth
    }
    return hdrs;
  };

  const initHeaders = (init.headers as Record<string, string>) || {};
  let headers = { ...buildAuthHeaders(userToken), ...initHeaders };
  let res = await fetchWithRetry(url, { ...init, headers });

  if (res.status === 401) {
    console.log('[api] Got 401, force-refreshing token and retrying...');
    const newToken = await forceRefreshToken();
    if (newToken !== publicAnonKey) {
      headers = { ...buildAuthHeaders(newToken), ...initHeaders };
      res = await fetchWithRetry(url, { ...init, headers });
    }
  }
  return res;
}

function throwIfError(res: Response, body: any, label = 'Request') {
  if (!res.ok) {
    throw new Error(body?.error || body?.message || `${label} failed (${res.status})`);
  }
}

/**
 * Retry wrapper for network errors with exponential backoff.
 * Only retries on network failures (TypeError from fetch), not HTTP errors.
 */
async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxRetries = 2,
  baseDelay = 1000,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err: any) {
      lastError = err;
      // Only retry on network errors (no response at all)
      if (err instanceof TypeError && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[api] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export const api = {
  // ── Public (uses anon key only) ──────────────────────────────────────────

  get: async (path: string, extraHeaders?: Record<string, string>) => {
    const cached = getCached(path);
    if (cached) return cached;

    const res = await fetchWithRetry(`${BASE}${path}`, { headers: buildHeaders(extraHeaders) });
    const body = await res.json().catch(() => ({}));
    throwIfError(res, body);
    setCache(path, body);
    return body;
  },

  post: async (path: string, body?: any, extraHeaders?: Record<string, string>) => {
    const res = await fetchWithRetry(`${BASE}${path}`, {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json', ...extraHeaders }),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    throwIfError(res, data);
    return data;
  },

  put: async (path: string, body?: any) => {
    const res = await fetchWithRetry(`${BASE}${path}`, {
      method: 'PUT',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    throwIfError(res, data);
    return data;
  },

  del: async (path: string) => {
    const res = await fetchWithRetry(`${BASE}${path}`, {
      method: 'DELETE',
      headers: buildHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    throwIfError(res, data);
    return data;
  },

  // ── Authenticated (user JWT in X-User-Auth-Token) ────────────────────────

  authGet: async (path: string) => {
    const res = await authFetchWithRetry(`${BASE}${path}`, { method: 'GET' });
    const body = await res.json().catch(() => ({}));
    throwIfError(res, body);
    return body;
  },

  authPost: async (path: string, body?: any) => {
    const res = await authFetchWithRetry(
      `${BASE}${path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const data = await res.json().catch(() => ({}));
    throwIfError(res, data);
    return data;
  },

  authPut: async (path: string, body?: any) => {
    const res = await authFetchWithRetry(
      `${BASE}${path}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const data = await res.json().catch(() => ({}));
    throwIfError(res, data);
    return data;
  },

  authDel: async (path: string) => {
    const res = await authFetchWithRetry(`${BASE}${path}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    throwIfError(res, data);
    return data;
  },

  upload: async (path: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const userToken = await getAuthToken();
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${publicAnonKey}`,
    };
    if (userToken !== publicAnonKey) {
      headers['X-User-Auth-Token'] = userToken;
    }

    let res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData });

    if (res.status === 401) {
      console.log('[api] Upload got 401, refreshing token and retrying...');
      const newToken = await forceRefreshToken();
      if (newToken !== publicAnonKey) {
        headers['X-User-Auth-Token'] = newToken;
        res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData });
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Upload failed (${res.status})`);
    }
    return res.json();
  },
};