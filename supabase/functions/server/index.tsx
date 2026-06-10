import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";
import { menuItems } from "./data.tsx";
import * as push from "./push.tsx";

// --- Timezone helpers (Brasília = UTC-3, sem horário de verão desde 2019) ---
/** Retorna um objeto Date ajustado para o horário de Brasília (para getUTCHours/etc.) */
function brasiliaDateNow(): Date {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}
/** Retorna a data atual em Brasília no formato "YYYY-MM-DD" */
function brasiliaToday(): string {
  return brasiliaDateNow().toISOString().split('T')[0];
}

const app = new Hono();

// --- Rate Limiting ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

function getRateLimitKey(c: any): string {
  const forwarded = c.req.header('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  const token = c.req.header('X-User-Auth-Token') || '';
  return token ? `user:${token.slice(-16)}` : `ip:${ip}`;
}

// Return JSON for unmatched routes so clients get a parseable error body
app.notFound((c) => c.json({ error: "Not found", path: new URL(c.req.url).pathname }, 404));
app.onError((err: any, c) => {
  console.log("Hono unhandled error:", err?.message ?? err);
  return c.json({ error: err?.message ?? "Internal server error" }, 500);
});

app.use('*', logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-User-Auth-Token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Rate limiting middleware
app.use("/*", async (c, next) => {
  const key = getRateLimitKey(c);
  const now = Date.now();
  let entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(key, entry);
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return c.json({ error: "Muitas requisições. Tente novamente em instantes." }, 429);
  }
  // Cleanup old entries periodically
  if (rateLimitMap.size > 5000) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }
  await next();
});

// Singleton supabase admin client
// Used for privileged operations like user management. Reused across requests
// in the same isolate so we don't pay client-construction cost on every call.
let _adminClient: ReturnType<typeof createClient> | null = null;
function adminClient() {
  if (!_adminClient) {
    _adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }
  return _adminClient;
}

// --- Auth Helpers ---
// Short-lived cache of validated JWTs. A single admin page load fires several
// requests with the SAME token; without this each one hits Supabase Auth over
// the network just to re-validate. Keyed by the token string, so a refreshed
// token (e.g. right after self-promotion) is a cache miss and validates fresh.
const _authCache = new Map<string, { user: { userId: string; userName: string; role: string; dietaryRestrictions: string }; ts: number }>();
const AUTH_CACHE_TTL = 60_000; // 60s

async function getAuthUser(c: any): Promise<{ userId: string; userName: string; role: string } | null> {
  // Prefer the custom header so the Supabase gateway never blocks the request
  // (Authorization always carries the anon key; user JWT travels in X-User-Auth-Token)
  let token = c.req.header('X-User-Auth-Token');

  // Fallback: legacy callers that still put the JWT in Authorization
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.log("getAuthUser: No auth header found");
      return null;
    }
    token = authHeader.split(' ')[1];
    if (!token) {
      console.log("getAuthUser: Empty token");
      return null;
    }
    // Skip the anon key — it is not a user JWT
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (token === anonKey) {
      console.log("getAuthUser: Token is the anon key, skipping user validation");
      return null;
    }
  }

  // Serve from the short-lived validation cache when possible.
  const cached = _authCache.get(token);
  if (cached && Date.now() - cached.ts < AUTH_CACHE_TTL) {
    return cached.user;
  }

  try {
    // Use admin client (service role) for reliable JWT validation
    const supabase = adminClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) {
      console.log("getAuthUser validation error:", error.message);
      return null;
    }
    if (user) {
      const resolved = {
        userId: user.id,
        userName: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
        role: user.user_metadata?.role || 'user',
        dietaryRestrictions: user.user_metadata?.dietary_restrictions || '',
      };
      _authCache.set(token, { user: resolved, ts: Date.now() });
      // Opportunistically evict stale entries so the map can't grow unbounded.
      if (_authCache.size > 1000) {
        const now = Date.now();
        for (const [k, v] of _authCache) {
          if (now - v.ts >= AUTH_CACHE_TTL) _authCache.delete(k);
        }
      }
      return resolved;
    }
    console.log("getAuthUser: getUser returned no user and no error");
  } catch (e) {
    console.log("getAuthUser exception:", e);
  }
  return null;
}

async function requireAuth(c: any): Promise<{ userId: string; userName: string; role: string; dietaryRestrictions: string } | Response> {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: "Não autorizado. Faça login novamente." }, 401);
  return user;
}

async function requireAdmin(c: any): Promise<{ userId: string; userName: string; role: string; dietaryRestrictions: string } | Response> {
  const result = await requireAuth(c);
  if (result instanceof Response) return result;
  // Allow 'admin' or 'master'
  if (result.role !== 'admin' && result.role !== 'master') {
    return c.json({ error: "Acesso negado. Permissão de administrador necessária." }, 403);
  }
  return result;
}

async function requireAdminOrKitchen(c: any): Promise<{ userId: string; userName: string; role: string; dietaryRestrictions: string } | Response> {
  const result = await requireAuth(c);
  if (result instanceof Response) return result;
  if (result.role !== 'admin' && result.role !== 'kitchen' && result.role !== 'master') {
    return c.json({ error: "Acesso negado. Permissão de administrador ou cozinha necessária." }, 403);
  }
  return result;
}

// --- Validation helpers ---
function validateMenuItem(item: any): string | null {
  if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) return "Nome do item é obrigatório.";
  if (item.calories !== undefined && (typeof item.calories !== 'number' || item.calories < 0)) return "Calorias devem ser um número positivo.";
  if (item.available !== undefined && (typeof item.available !== 'number' || item.available < 0)) return "Estoque deve ser um número positivo.";
  if (item.limit !== undefined && (typeof item.limit !== 'number' || item.limit < 1)) return "Limite deve ser pelo menos 1.";
  return null;
}

// --- Audit Log Helper ---
interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  category: string;
  description: string;
  details?: Record<string, any>;
  ip: string;
}

async function logAudit(
  c: any,
  user: { userId: string; userName: string; role: string },
  action: string,
  category: string,
  description: string,
  details?: Record<string, any>,
) {
  try {
    const now = brasiliaDateNow();
    const ts = now.toISOString();
    const dateStr = ts.split("T")[0];
    const id = `${dateStr}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const forwarded = c.req.header("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    const entry: AuditLogEntry = {
      id,
      timestamp: ts,
      userId: user.userId,
      userName: user.userName,
      userRole: user.role,
      action,
      category,
      description,
      details: details || undefined,
      ip,
    };

    await kv.set(`audit_log:${id}`, JSON.stringify(entry));
    console.log(`[Audit] ${user.userName} (${user.role}) -> ${action}: ${description}`);
  } catch (err: any) {
    console.log(`[Audit] Failed to write log: ${err.message}`);
  }
}

// --- Health ---
app.get("/make-server-c3078087/health", (c) => c.json({ status: "ok" }));

// --- Setup: Promote to Admin ---
// If no admin exists, the authenticated user can promote themselves.
// If admins already exist, only an existing admin can promote others.
app.post("/make-server-c3078087/setup-admin", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const supabase = adminClient();
    // These two lookups are independent — run them in parallel to cut latency.
    const [listResult, currentUserResult] = await Promise.all([
      supabase.auth.admin.listUsers(),
      supabase.auth.admin.getUserById(auth.userId),
    ]);

    const { data: { users }, error: listError } = listResult;
    if (listError) return c.json({ error: listError.message }, 500);

    const existingAdmins = (users || []).filter(
      (u: any) => u.user_metadata?.role === 'admin'
    );

    // If admins exist and caller is not one of them, deny
    if (existingAdmins.length > 0 && auth.role !== 'admin') {
      return c.json({ error: "Já existem administradores. Peça a um admin para alterar sua permissão." }, 403);
    }

    // Promote caller to admin - preserve existing metadata
    const { data: currentUser, error: getUserError } = currentUserResult;
    if (getUserError) return c.json({ error: getUserError.message }, 500);
    
    const { data, error } = await supabase.auth.admin.updateUserById(auth.userId, {
      user_metadata: { 
        ...currentUser.user.user_metadata,
        role: 'admin' 
      }
    });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true, message: "Você agora é administrador! Faça logout e login novamente.", user: data.user });
  } catch (e) {
    console.log("Setup admin error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- Auth: Signup ---
app.post("/make-server-c3078087/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    if (!email || !password || !name) return c.json({ error: "Email, senha e nome são obrigatórios." }, 400);
    if (password.length < 6) return c.json({ error: "Senha deve ter pelo menos 6 caracteres." }, 400);
    const supabase = adminClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role: 'user' },
      email_confirm: true
    });
    if (error) return c.json({ error: error.message }, 400);
    return c.json(data);
  } catch (e) {
    console.log("Signup error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- Auth: Password Reset ---
app.post("/make-server-c3078087/forgot-password", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: "Email é obrigatório." }, 400);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ success: true, message: "Email de recuperação enviado." });
  } catch (e) {
    console.log("Forgot password error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- Admin: Users CRUD (Protected) ---
app.get("/make-server-c3078087/admin/users", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const supabase = adminClient();
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) return c.json({ error: error.message }, 400);
    return c.json(users);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-c3078087/admin/users", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { email, password, name, role, department } = await c.req.json();
    if (!email || !password || !name) return c.json({ error: "Email, senha e nome são obrigatórios." }, 400);
    const supabase = adminClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email, password,
      user_metadata: { name, role: role || 'user', department: department || '' },
      email_confirm: true
    });
    if (error) return c.json({ error: error.message }, 400);
    await logAudit(c, auth, "CREATE_USER", "users", `Criou usuario "${name}" (${email}) com papel "${role || 'user'}".`, { targetEmail: email, role: role || "user" });
    return c.json(data.user);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.put("/make-server-c3078087/admin/users/:id", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const id = c.req.param('id');
    const { name, role, department, email, lunchLocation, dietaryRestrictions, age, phone } = await c.req.json();
    console.log(`[Admin] Updating user ${id}:`, { name, role, department, email, lunchLocation, dietaryRestrictions, age, phone });
    
    const supabase = adminClient();
    
    // First, get the current user data to preserve existing metadata
    const { data: existingUser, error: fetchError } = await supabase.auth.admin.getUserById(id);
    if (fetchError) return c.json({ error: fetchError.message }, 400);
    
    // Merge existing metadata with new values to preserve fields like lunch_location, age, etc.
    const updates: any = { 
        user_metadata: { 
            ...existingUser.user.user_metadata, // Preserve all existing metadata
            name, 
            role, 
            department: department !== undefined ? department : existingUser.user.user_metadata?.department || "",
        } 
    };
    if (lunchLocation !== undefined) updates.user_metadata.lunch_location = lunchLocation;
    if (dietaryRestrictions !== undefined) updates.user_metadata.dietary_restrictions = dietaryRestrictions;
    if (age !== undefined) updates.user_metadata.age = age;
    if (phone !== undefined) updates.user_metadata.phone = phone;
    if (email) updates.email = email;
    
    const { data, error } = await supabase.auth.admin.updateUserById(id, updates);
    if (error) return c.json({ error: error.message }, 400);
    await logAudit(c, auth, "UPDATE_USER", "users", `Atualizou usuario "${name}" (papel: ${role}).`, { targetUserId: id, name, role });
    return c.json(data.user);
  } catch (e) {
    console.error("User update error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- Admin: Reset user password (sends recovery email) ---
app.post("/make-server-c3078087/admin/users/:id/reset-password", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const id = c.req.param('id');
    const supabase = adminClient();
    
    // Get the user's email
    const { data: userData, error: fetchError } = await supabase.auth.admin.getUserById(id);
    if (fetchError) return c.json({ error: fetchError.message }, 400);
    
    const userEmail = userData.user.email;
    if (!userEmail) return c.json({ error: "Usuário não possui email cadastrado." }, 400);
    
    // Use the public reset password flow to send recovery email
    const anonSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { error: resetError } = await anonSupabase.auth.resetPasswordForEmail(userEmail);
    if (resetError) return c.json({ error: resetError.message }, 400);
    
    await logAudit(c, auth, "RESET_PASSWORD", "users", `Solicitou reset de senha para "${userEmail}".`, { targetUserId: id, email: userEmail });
    return c.json({ success: true, email: userEmail, message: `Email de redefinição de senha enviado para ${userEmail}.` });
  } catch (e) {
    console.error("Admin reset password error:", e);
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-c3078087/admin/users/:id", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const id = c.req.param('id');
    const supabase = adminClient();
    // Get user info before deleting
    const { data: userData } = await supabase.auth.admin.getUserById(id).catch(() => ({ data: null }));
    const targetName = userData?.user?.user_metadata?.name || userData?.user?.email || id;
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) return c.json({ error: error.message }, 400);
    await logAudit(c, auth, "DELETE_USER", "users", `Excluiu usuario "${targetName}".`, { targetUserId: id });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Menu Items CRUD ---
app.get("/make-server-c3078087/menu", async (c) => {
  try {
    const date = c.req.query('date');
    let items = await kv.get("menu:items");
    if (!items || items.length === 0) {
      items = menuItems;
      await kv.set("menu:items", items);
    }

    if (date) {
      // Get the published daily menu for this specific date
      const dailyMenu = await kv.get(`daily-menu:${date}`);
      const recurringIds = await kv.get("menu:recurring-items") || [];
      
      const itemIds = new Set(recurringIds);
      if (dailyMenu && Array.isArray(dailyMenu)) {
        dailyMenu.forEach((i: any) => itemIds.add(i.id));
      }

      if (itemIds.size > 0) {
        return c.json(items.filter((i: any) => itemIds.has(i.id)));
      }
      // If no daily menu for this date, return empty
      return c.json([]);
    }

    return c.json(items);
  } catch (e) {
    console.log("Menu fetch error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Get today's menu - shows today's menu or yesterday's in grayscale
app.get("/make-server-c3078087/menu/today", async (c) => {
  try {
    // Better date handling for Brazil (UTC-3)
    const now = new Date();
    const brazilDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayKey = brazilDate.toISOString().split('T')[0];
    
    console.log(`[Menu] Fetching today's menu for: ${todayKey} (UTC: ${now.toISOString()})`);

    // Check if there's a daily menu for today
    const todayMenu = await kv.get(`daily-menu:${todayKey}`);
    const recurringIds = await kv.get("menu:recurring-items") || [];
    const allItems = await kv.get("menu:items") || [];

    const todayItemIds = new Set(recurringIds);
    if (todayMenu && Array.isArray(todayMenu)) {
      todayMenu.forEach((i: any) => todayItemIds.add(i.id));
    }

    if (todayItemIds.size > 0) {
      const todayItems = allItems
        .filter((i: any) => todayItemIds.has(i.id))
        .map((i: any) => ({ ...i, isPreviousDay: false }));
      return c.json(todayItems);
    }

    // No menu for today - try yesterday (show in grayscale)
    const yesterdayDate = new Date(brazilDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = yesterdayDate.toISOString().split('T')[0];
    
    const yesterdayMenu = await kv.get(`daily-menu:${yesterdayKey}`);
    if (yesterdayMenu && Array.isArray(yesterdayMenu) && yesterdayMenu.length > 0) {
      const yesterdayItemIds = new Set(yesterdayMenu.map((i: any) => i.id));
      const yesterdayItems = allItems
        .filter((i: any) => yesterdayItemIds.has(i.id))
        .map((i: any) => ({ ...i, isPreviousDay: true }));
      return c.json(yesterdayItems);
    }

    return c.json([]);
  } catch (e) {
    console.log("Today menu error:", e);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-c3078087/menu", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const item = await c.req.json();
    const validationError = validateMenuItem(item);
    if (validationError) return c.json({ error: validationError }, 400);
    const newItem = { ...item, id: item.id || crypto.randomUUID(), createdAt: new Date().toISOString() };
    let items = await kv.get("menu:items") || [];
    items.push(newItem);
    await kv.set("menu:items", items);
    await logAudit(c, auth, "CREATE_ITEM", "items", `Criou item "${newItem.name}" (${newItem.category}).`, { itemId: newItem.id, itemName: newItem.name });
    return c.json(newItem);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.put("/make-server-c3078087/menu/:id", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const id = c.req.param('id');
    const updates = await c.req.json();
    if (updates.name !== undefined) {
      const validationError = validateMenuItem(updates);
      if (validationError) return c.json({ error: validationError }, 400);
    }
    let items = await kv.get("menu:items") || [];
    items = items.map((i: any) => i.id === id ? { ...i, ...updates, updatedAt: new Date().toISOString() } : i);
    await kv.set("menu:items", items);
    const updated = items.find((i: any) => i.id === id);
    await logAudit(c, auth, "UPDATE_ITEM", "items", `Atualizou item "${updated?.name || id}".`, { itemId: id, fields: Object.keys(updates) });
    return c.json(updated);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-c3078087/menu/:id", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const id = c.req.param('id');
    let items = await kv.get("menu:items") || [];
    const deleted = items.find((i: any) => i.id === id);
    items = items.filter((i: any) => i.id !== id);
    await kv.set("menu:items", items);
    await logAudit(c, auth, "DELETE_ITEM", "items", `Excluiu item "${deleted?.name || id}".`, { itemId: id });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Categories CRUD ---
app.get("/make-server-c3078087/categories", async (c) => {
  try {
    const cats = await kv.get("categories") || ["Principal", "Guarnição", "Salada", "Sobremesa", "Bebida"];
    return c.json(cats);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-c3078087/categories", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { name } = await c.req.json();
    if (!name || !name.trim()) return c.json({ error: "Nome da categoria é obrigatório." }, 400);
    const cats = await kv.get("categories") || ["Principal", "Guarnição", "Salada", "Sobremesa", "Bebida"];
    if (!cats.includes(name.trim())) {
      cats.push(name.trim());
      await kv.set("categories", cats);
    }
    return c.json(cats);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-c3078087/categories/:name", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const name = decodeURIComponent(c.req.param('name'));
    let cats = await kv.get("categories") || [];
    cats = cats.filter((cat: string) => cat !== name);
    await kv.set("categories", cats);
    return c.json(cats);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.put("/make-server-c3078087/categories/:name", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const oldName = decodeURIComponent(c.req.param('name'));
    const { newName } = await c.req.json();
    
    if (!newName || !newName.trim()) return c.json({ error: "Novo nome é obrigatório." }, 400);
    
    // Update category list
    let cats = await kv.get("categories") || [];
    const index = cats.indexOf(oldName);
    if (index === -1) return c.json({ error: "Categoria não encontrada." }, 404);
    
    cats[index] = newName.trim();
    await kv.set("categories", cats);

    // Update all items that use this category
    let items = await kv.get("menu:items") || [];
    let itemsUpdated = false;
    items = items.map((item: any) => {
      if (item.category === oldName) {
        itemsUpdated = true;
        return { ...item, category: newName.trim() };
      }
      return item;
    });

    if (itemsUpdated) {
      await kv.set("menu:items", items);
    }

    return c.json(cats);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Orders ---
app.get("/make-server-c3078087/orders", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const orders = await kv.get(`orders:${auth.userId}`) || [];
    return c.json(orders);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-c3078087/orders", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const orderData = await c.req.json();

    if (!orderData.items || orderData.items.length === 0) {
      return c.json({ error: "Pedido deve conter pelo menos um item." }, 400);
    }

    // Check if user already ordered today (using Brasília date)
    const today = brasiliaToday();
    const existingOrders = await kv.get(`orders:${auth.userId}`) || [];
    const todayOrder = existingOrders.find((o: any) => o.date?.startsWith(today) && o.status !== 'Cancelado');
    if (todayOrder) {
      return c.json({ error: "Você já realizou um pedido hoje. Limite de 1 pedido por dia." }, 400);
    }

    // Check abstention (using same Brasília date key)
    const abstentions = await kv.get(`abstentions:${today}`) || [];
    if (abstentions.find((a: any) => a.userId === auth.userId)) {
      return c.json({ error: "Você registrou abstenção hoje. Cancele a abstenção primeiro." }, 400);
    }

    // Check cutoff time (compare in Brasília timezone, not UTC)
    const settings = await kv.get("settings") || {};
    if (settings.cutoffTime) {
      const nowBrasilia = brasiliaDateNow();
      const [h, m] = settings.cutoffTime.split(':').map(Number);
      const brasiliaHour = nowBrasilia.getUTCHours();
      const brasiliaMinute = nowBrasilia.getUTCMinutes();
      const pastCutoff = brasiliaHour > h || (brasiliaHour === h && brasiliaMinute >= m);

      // For future dates, don't apply today's cutoff
      const orderDateStr = orderData.date ? new Date(orderData.date).toISOString().split('T')[0] : today;
      if (orderDateStr === today && pastCutoff) {
        return c.json({ error: `Horário de pedido encerrado. O limite era ${settings.cutoffTime}.` }, 400);
      }
    }

    // Decrement stock with optimistic retry to mitigate race conditions
    const MAX_STOCK_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_STOCK_RETRIES; attempt++) {
      let menuItemsData = await kv.get("menu:items") || [];
      let stockOk = true;
      for (const orderItem of orderData.items) {
        const menuItem = menuItemsData.find((mi: any) => mi.id === orderItem.id);
        if (menuItem) {
          const qty = orderItem.quantity || 1;
          if (menuItem.available < qty) {
            return c.json({ error: `"${menuItem.name}" não tem estoque suficiente (disponível: ${menuItem.available}).` }, 400);
          }
          menuItem.available -= qty;
        }
      }
      try {
        await kv.set("menu:items", menuItemsData);
        break; // success
      } catch (stockErr: any) {
        if (attempt === MAX_STOCK_RETRIES - 1) {
          console.log("Stock update failed after retries:", stockErr);
          return c.json({ error: "Erro ao atualizar estoque. Tente novamente." }, 500);
        }
        // Small delay before retry
        await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
      }
    }

    const newOrder = {
      ...orderData,
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      userId: auth.userId,
      userName: auth.userName,
      userDietaryRestrictions: auth.dietaryRestrictions || '',
      status: "Confirmado",
      consumptionMode: orderData.consumptionMode || 'dine_in_damasceno',
      deliveryAddress: orderData.deliveryAddress,
      contactPhone: orderData.contactPhone
    };

    await kv.set(`orders:${auth.userId}`, [newOrder, ...existingOrders]);

    // Also save to daily index for efficient admin queries
    const dailyOrders = await kv.get(`orders-daily:${today}`) || [];
    dailyOrders.push(newOrder);
    await kv.set(`orders-daily:${today}`, dailyOrders);

    return c.json(newOrder);
  } catch (e) {
    console.log("Order creation error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Delete Own Order
app.delete("/make-server-c3078087/orders/:id", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const id = c.req.param('id');
    const userOrders = await kv.get(`orders:${auth.userId}`) || [];
    const orderIndex = userOrders.findIndex((o: any) => o.id === id);
    if (orderIndex === -1) return c.json({ error: "Pedido não encontrado." }, 404);

    const order = userOrders[orderIndex];
    
    // Check cutoff AND 30-minute buffer before cutoff (Brasília timezone)
    const settings = await kv.get("settings") || {};
    if (settings.cutoffTime) {
      const nowBrasilia = brasiliaDateNow();
      const [h, m] = settings.cutoffTime.split(':').map(Number);
      const nowMinutes = nowBrasilia.getUTCHours() * 60 + nowBrasilia.getUTCMinutes();
      const cutoffMinutes = h * 60 + m;

      if (nowMinutes >= cutoffMinutes) {
        return c.json({ error: "Horário limite excedido. Não é possível excluir/editar." }, 400);
      }
      // 30-minute buffer: block delete/edit within 30 minutes of cutoff
      const cancelLimitMinutes = cutoffMinutes - 30;
      if (nowMinutes >= cancelLimitMinutes) {
        const deadlineH = Math.floor(cancelLimitMinutes / 60);
        const deadlineM = cancelLimitMinutes % 60;
        const deadlineStr = `${String(deadlineH).padStart(2, '0')}:${String(deadlineM).padStart(2, '0')}`;
        return c.json({ error: `O prazo para excluir/editar já passou (limite: ${deadlineStr}).` }, 400);
      }
    }

    // Restore stock
    if (order.items && order.items.length > 0) {
        let menuItemsData = await kv.get("menu:items") || [];
        let stockUpdated = false;
        for (const orderItem of order.items) {
            const menuItem = menuItemsData.find((mi: any) => mi.id === orderItem.id);
            if (menuItem) {
                menuItem.available += (orderItem.quantity || 1);
                stockUpdated = true;
            }
        }
        if (stockUpdated) await kv.set("menu:items", menuItemsData);
    }

    // Remove from user list
    userOrders.splice(orderIndex, 1);
    await kv.set(`orders:${auth.userId}`, userOrders);

    // Remove from daily list
    const date = order.date.split('T')[0];
    const dailyOrders = await kv.get(`orders-daily:${date}`) || [];
    const dailyIndex = dailyOrders.findIndex((o: any) => o.id === id);
    if (dailyIndex >= 0) {
        dailyOrders.splice(dailyIndex, 1);
        await kv.set(`orders-daily:${date}`, dailyOrders);
    }

    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Get All Orders (uses daily index when possible)
app.get("/make-server-c3078087/admin/orders", async (c) => {
  const auth = await requireAdminOrKitchen(c);
  if (auth instanceof Response) return auth;
  try {
    const date = c.req.query('date');
    const from = c.req.query('from');
    const to = c.req.query('to');

    if (date) {
      const dailyOrders = await kv.get(`orders-daily:${date}`) || [];
      return c.json(dailyOrders);
    }

    // Date range query: fetch each day in the range
    if (from && to) {
      const startDate = new Date(from + "T00:00:00");
      const endDate = new Date(to + "T23:59:59");
      const days: string[] = [];
      const current = new Date(startDate);
      while (current <= endDate && days.length <= 90) {
        days.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }
      if (days.length > 0) {
        const keys = days.map(d => `orders-daily:${d}`);
        const results = await kv.mget(keys);
        const allOrders = (results || []).flat().filter((o: any) => o && o.id);
        return c.json(allOrders);
      }
      return c.json([]);
    }

    // Fallback: get all orders from user prefixes
    const allOrdersMap = await kv.getByPrefix("orders:");
    // Filter out daily index entries
    const allOrders = allOrdersMap.flat().filter((o: any) => o && o.id);
    return c.json(allOrders);
  } catch (e) {
    console.log("Admin orders fetch error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Update Order Status
app.put("/make-server-c3078087/admin/orders/:id/status", async (c) => {
  const auth = await requireAdminOrKitchen(c);
  if (auth instanceof Response) return auth;
  try {
    const orderId = c.req.param('id');
    const { status } = await c.req.json();
    const validStatuses = ["Confirmado", "Em Preparo", "Pronto", "Retirado", "Cancelado"];
    if (!validStatuses.includes(status)) {
      return c.json({ error: `Status inválido. Use: ${validStatuses.join(', ')}` }, 400);
    }

    // Update in daily index
    const today = brasiliaToday();
    const dailyOrders = await kv.get(`orders-daily:${today}`) || [];
    let updatedOrder: any = null;
    for (const order of dailyOrders) {
      if (order.id === orderId) {
        order.status = status;
        updatedOrder = order;
        break;
      }
    }
    if (updatedOrder) {
      await kv.set(`orders-daily:${today}`, dailyOrders);
      // Also update in user's orders
      const userOrders = await kv.get(`orders:${updatedOrder.userId}`) || [];
      for (const order of userOrders) {
        if (order.id === orderId) {
          order.status = status;
          break;
        }
      }
      await kv.set(`orders:${updatedOrder.userId}`, userOrders);

      // Send push notification for important status changes
      const pushMessages: Record<string, { title: string; body: string }> = {
        "Em Preparo": {
          title: "Seu pedido está sendo preparado!",
          body: `Pedido #${orderId.slice(0, 6)} está em preparo. Fique de olho!`,
        },
        "Pronto": {
          title: "Seu pedido está pronto!",
          body: `Pedido #${orderId.slice(0, 6)} está pronto para retirada. Bom apetite!`,
        },
        "Cancelado": {
          title: "Pedido cancelado",
          body: `Pedido #${orderId.slice(0, 6)} foi cancelado.`,
        },
      };

      if (pushMessages[status]) {
        // Fire and forget - don't block the response
        push.sendPushToUser(updatedOrder.userId, {
          ...pushMessages[status],
          icon: "/icon-192.png",
          tag: `order-${orderId}`,
          data: { url: "/", orderId },
        }).catch((err: any) => console.log("[Push] Error sending order status push:", err));
      }
    }

    if (updatedOrder) {
      await logAudit(c, auth, "UPDATE_ORDER_STATUS", "orders", `Alterou status do pedido #${orderId.slice(0, 6)} para "${status}" (usuario: ${updatedOrder.userName || updatedOrder.userId}).`, { orderId, status, userId: updatedOrder.userId });
    }
    return c.json({ success: true, order: updatedOrder });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Delete/Remove Order (for cancelled orders)
app.delete("/make-server-c3078087/admin/orders/:id", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const orderId = c.req.param('id');
    
    // Search daily indices to find and remove the order
    const now = new Date();
    const brazilDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayKey = brazilDate.toISOString().split('T')[0];
    
    let foundOrder: any = null;
    
    // Check today's daily orders
    const dailyOrders = await kv.get(`orders-daily:${todayKey}`) || [];
    const dailyIdx = dailyOrders.findIndex((o: any) => o.id === orderId);
    if (dailyIdx >= 0) {
      foundOrder = dailyOrders[dailyIdx];
      dailyOrders.splice(dailyIdx, 1);
      await kv.set(`orders-daily:${todayKey}`, dailyOrders);
    }
    
    // If not found today, check yesterday
    if (!foundOrder) {
      const yesterdayDate = new Date(brazilDate);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayKey = yesterdayDate.toISOString().split('T')[0];
      const yesterdayOrders = await kv.get(`orders-daily:${yesterdayKey}`) || [];
      const yIdx = yesterdayOrders.findIndex((o: any) => o.id === orderId);
      if (yIdx >= 0) {
        foundOrder = yesterdayOrders[yIdx];
        yesterdayOrders.splice(yIdx, 1);
        await kv.set(`orders-daily:${yesterdayKey}`, yesterdayOrders);
      }
    }
    
    // Remove from user's orders list
    if (foundOrder?.userId) {
      const userOrders = await kv.get(`orders:${foundOrder.userId}`) || [];
      const uIdx = userOrders.findIndex((o: any) => o.id === orderId);
      if (uIdx >= 0) {
        userOrders.splice(uIdx, 1);
        await kv.set(`orders:${foundOrder.userId}`, userOrders);
      }
    }
    
    console.log(`[Admin] Order ${orderId} removed by ${auth.userName}`);
    await logAudit(c, auth, "DELETE_ORDER", "orders", `Excluiu pedido #${orderId.slice(0, 6)} (usuario: ${foundOrder?.userName || foundOrder?.userId || "desconhecido"}).`, { orderId, userId: foundOrder?.userId });
    return c.json({ success: true });
  } catch (e: any) {
    console.error("Admin order delete error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- Abstention (Não quero almoçar) ---
app.post("/make-server-c3078087/abstention", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const today = brasiliaToday();

    // Check if already ordered today (exclude cancelled orders)
    const existingOrders = await kv.get(`orders:${auth.userId}`) || [];
    const todayOrder = existingOrders.find((o: any) => o.date?.startsWith(today) && o.status !== 'Cancelado');
    if (todayOrder) {
      return c.json({ error: "Você já realizou um pedido hoje. Não é possível registrar abstenção." }, 400);
    }

    const key = `abstentions:${today}`;
    const list = await kv.get(key) || [];
    if (!list.find((a: any) => a.userId === auth.userId)) {
      list.push({ userId: auth.userId, userName: auth.userName, date: new Date().toISOString() });
      await kv.set(key, list);
    }
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-c3078087/abstention", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const today = brasiliaToday();
    const key = `abstentions:${today}`;
    let list = await kv.get(key) || [];
    list = list.filter((a: any) => a.userId !== auth.userId);
    await kv.set(key, list);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-c3078087/abstention/me", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const today = brasiliaToday();
    const list = await kv.get(`abstentions:${today}`) || [];
    const abstained = list.some((a: any) => a.userId === auth.userId);
    return c.json({ abstained });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-c3078087/admin/abstentions", async (c) => {
  const auth = await requireAdminOrKitchen(c);
  if (auth instanceof Response) return auth;
  try {
    const date = c.req.query('date') || brasiliaToday();
    const list = await kv.get(`abstentions:${date}`) || [];
    return c.json(list);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Notifications ---
app.get("/make-server-c3078087/notifications", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const globalNotifs = await kv.get("notifications:global") || [];
    const userNotifs = await kv.get(`notifications:user:${auth.userId}`) || [];
    // Combine and sort
    const all = [...userNotifs, ...globalNotifs].sort((a: any, b: any) => 
      new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    );
    return c.json(all);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-c3078087/admin/notifications", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    // Admin sees sent history (mostly global, but maybe all?)
    // For simplicity, let's return global history
    const globalNotifs = await kv.get("notifications:global") || [];
    return c.json(globalNotifs);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-c3078087/notifications", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { title, message, type, targetUserId } = await c.req.json();
    if (!title || !message) return c.json({ error: "Título e mensagem obrigatórios" }, 400);
    
    const notif = {
        id: crypto.randomUUID(),
        title, message, type,
        sentAt: new Date().toISOString(),
        sentByName: auth.userName,
        targetUserId: targetUserId || 'all'
    };

    if (targetUserId && targetUserId !== 'all') {
        const key = `notifications:user:${targetUserId}`;
        const list = await kv.get(key) || [];
        await kv.set(key, [notif, ...list].slice(0, 50));
    } else {
        const key = "notifications:global";
        const list = await kv.get(key) || [];
        await kv.set(key, [notif, ...list].slice(0, 200));
    }
    return c.json(notif);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-c3078087/notifications/:id", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const id = c.req.param('id');
    // Try to delete from global first
    const globalKey = "notifications:global";
    let list = await kv.get(globalKey) || [];
    const initialLen = list.length;
    list = list.filter((n: any) => n.id !== id);
    if (list.length !== initialLen) {
        await kv.set(globalKey, list);
    }
    // We could try to delete from individual users but we don't know who it was sent to easily without searching all.
    // For now, only global deletions supported or if we knew the user.
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Menu Publishing ---
app.get("/make-server-c3078087/admin/menu/published", async (c) => {
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    try {
        const week = c.req.query('week');
        if (!week) return c.json({ error: "Week param required" }, 400);
        const publishedDays = await kv.get(`menu:published:${week}`) || [];
        return c.json(publishedDays);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-c3078087/admin/menu/publish-day", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { date } = await c.req.json();
    if (!date) return c.json({ error: "Data é obrigatória." }, 400);

    const dayDate = new Date(date);
    const dayOfWeek = dayDate.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeekDate = new Date(dayDate);
    startOfWeekDate.setDate(dayDate.getDate() + diff);
    const weekKey = startOfWeekDate.toISOString().split('T')[0];

    const publishedKey = `menu:published:${weekKey}`;
    let publishedDays = await kv.get(publishedKey) || [];
    
    if (!publishedDays.includes(date)) {
        publishedDays.push(date);
        await kv.set(publishedKey, publishedDays);

        // Notify
        const notif = {
            id: crypto.randomUUID(),
            title: "🍽️ Cardápio Disponível!",
            message: `O cardápio de ${dayDate.toLocaleDateString('pt-BR')} já está disponível.`,
            type: "info",
            sentAt: new Date().toISOString(),
            sentByName: "Sistema",
            targetUserId: "all"
        };
        const currentNotifs = await kv.get("notifications:global") || [];
        await kv.set("notifications:global", [notif, ...currentNotifs].slice(0, 200));
    }
    
    await logAudit(c, auth, "PUBLISH_MENU", "menu", `Publicou cardapio do dia ${date}.`, { date });
    return c.json({ success: true, publishedDays });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Permissions ---
app.get("/make-server-c3078087/admin/permissions", async (c) => {
    try {
        const supabase = adminClient();
        const { data: { users }, error } = await supabase.auth.admin.listUsers();
        if (error) throw error;
        const permsMap: Record<string, any> = {};
        users.forEach((u: any) => {
            if (u.user_metadata?.permissions) {
                permsMap[u.id] = u.user_metadata.permissions;
            }
        });
        return c.json(permsMap);
    } catch (e) {
        return c.json({});
    }
});

// All permission keys used across the admin panel
const ALL_PERM_KEYS = [
  'dashboard', 'orders', 'kds', 'checkin', 'waste',
  'menu', 'items', 'users', 'reviews', 'reports',
  'banners', 'notifications', 'settings', 'roles_permissions', 'logs'
];

// --- Custom Roles CRUD ---
app.get("/make-server-c3078087/admin/roles", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const roles = await kv.get("roles:list") || [];
    return c.json(roles);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-c3078087/admin/roles", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { name, description, color, permissions } = await c.req.json();
    if (!name?.trim()) return c.json({ error: "Nome é obrigatório." }, 400);
    const roles = await kv.get("roles:list") || [];
    const newRole = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description || "",
      color: color || "#6366f1",
      permissions: permissions || {},
      createdAt: new Date().toISOString(),
      createdBy: auth.userName,
    };
    roles.push(newRole);
    await kv.set("roles:list", roles);
    return c.json(newRole);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.put("/make-server-c3078087/admin/roles/:id", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const id = c.req.param("id");
    const { name, description, color, permissions } = await c.req.json();
    if (!name?.trim()) return c.json({ error: "Nome é obrigatório." }, 400);
    let roles = await kv.get("roles:list") || [];
    const idx = roles.findIndex((r: any) => r.id === id);
    if (idx === -1) return c.json({ error: "Função não encontrada." }, 404);
    roles[idx] = { ...roles[idx], name: name.trim(), description, color, permissions, updatedAt: new Date().toISOString() };
    await kv.set("roles:list", roles);
    return c.json(roles[idx]);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-c3078087/admin/roles/:id", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const id = c.req.param("id");
    let roles = await kv.get("roles:list") || [];
    roles = roles.filter((r: any) => r.id !== id);
    await kv.set("roles:list", roles);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- User-Role Assignments ---
app.get("/make-server-c3078087/admin/user-roles", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const supabase = adminClient();
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) return c.json({ error: error.message }, 400);
    const result: any[] = [];
    for (const user of users || []) {
      const assignment = await kv.get(`user-role:${user.id}`);
      result.push({
        userId: user.id,
        userName: user.user_metadata?.name || user.email,
        email: user.email,
        avatar: user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.user_metadata?.name || 'U')}&background=random`,
        systemRole: user.user_metadata?.role || "user",
        customRoleId: assignment?.roleId || null,
        assignedAt: assignment?.assignedAt || null,
        assignedBy: assignment?.assignedBy || null,
      });
    }
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.put("/make-server-c3078087/admin/user-roles/:userId", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const userId = c.req.param("userId");
    const { roleId } = await c.req.json();
    if (roleId) {
      await kv.set(`user-role:${userId}`, {
        roleId,
        assignedAt: new Date().toISOString(),
        assignedBy: auth.userName,
      });
    } else {
      await kv.set(`user-role:${userId}`, null);
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- User Permission Overrides (per-person) ---
app.get("/make-server-c3078087/admin/user-permissions/:userId", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const userId = c.req.param("userId");
    const overrides = await kv.get(`user-perms-override:${userId}`) || {};
    return c.json(overrides);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.put("/make-server-c3078087/admin/user-permissions/:userId", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const userId = c.req.param("userId");
    const overrides = await c.req.json();
    await kv.set(`user-perms-override:${userId}`, overrides);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Resolved Permissions for current user ---
app.get("/make-server-c3078087/admin/my-permissions", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({});
  try {
    if (auth.role === 'master') {
      const allPerms: Record<string, boolean> = {};
      ALL_PERM_KEYS.forEach(k => { allPerms[k] = true; });
      return c.json(allPerms);
    }
    let resolvedPerms: Record<string, boolean> = {};
    const assignment = await kv.get(`user-role:${auth.userId}`);
    if (assignment?.roleId) {
      const roles = await kv.get("roles:list") || [];
      const role = roles.find((r: any) => r.id === assignment.roleId);
      if (role?.permissions) {
        resolvedPerms = { ...role.permissions };
      }
    } else {
      if (auth.role === 'admin') {
        ALL_PERM_KEYS.forEach(k => { resolvedPerms[k] = true; });
      } else if (auth.role === 'kitchen') {
        ['dashboard', 'orders', 'kds', 'checkin', 'waste'].forEach(k => { resolvedPerms[k] = true; });
      }
    }
    // Apply per-user overrides on top of role perms
    const overrides = await kv.get(`user-perms-override:${auth.userId}`) || {};
    for (const [key, val] of Object.entries(overrides)) {
      if (val !== null && val !== undefined) {
        resolvedPerms[key] = val as boolean;
      }
    }
    return c.json(resolvedPerms);
  } catch (e: any) {
    console.log("my-permissions error:", e);
    return c.json({});
  }
});

// --- Check-in ---
app.get("/make-server-c3078087/admin/checkins", async (c) => {
  const auth = await requireAdminOrKitchen(c);
  if (auth instanceof Response) return auth;
  try {
    const date = c.req.query('date') || brasiliaToday();
    const checkins = await kv.get(`checkins:${date}`) || [];
    return c.json(checkins);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-c3078087/admin/checkins", async (c) => {
  const auth = await requireAdminOrKitchen(c);
  if (auth instanceof Response) return auth;
  try {
    const { orderId, userId, userName, confirmed, unit, isManual } = await c.req.json();
    // For manual checkins (units without orders), orderId may be absent
    const entryId = orderId || (isManual ? `manual:${userId || userName}:${Date.now()}` : null);
    if (!entryId && !isManual) return c.json({ error: "orderId é obrigatório." }, 400);
    const today = brasiliaToday();
    const key = `checkins:${today}`;
    let checkins = await kv.get(key) || [];
    const idx = isManual
      ? checkins.findIndex((ci: any) => ci.userId === userId && ci.unit === unit && ci.isManual)
      : checkins.findIndex((ci: any) => ci.orderId === orderId);
    if (idx >= 0) {
      checkins[idx].confirmed = confirmed;
    } else {
      checkins.push({ orderId: entryId, userId, userName, confirmed, unit: unit || '', isManual: !!isManual, date: new Date().toISOString() });
    }
    await kv.set(key, checkins);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// Batch check-in
app.post("/make-server-c3078087/admin/checkins/batch", async (c) => {
  const auth = await requireAdminOrKitchen(c);
  if (auth instanceof Response) return auth;
  try {
    const { entries } = await c.req.json(); // [{ orderId, userId, userName, confirmed }]
    if (!Array.isArray(entries)) return c.json({ error: "entries deve ser um array." }, 400);
    const today = brasiliaToday();
    const key = `checkins:${today}`;
    let checkins = await kv.get(key) || [];
    for (const entry of entries) {
      const idx = checkins.findIndex((ci: any) => ci.orderId === entry.orderId);
      if (idx >= 0) {
        checkins[idx].confirmed = entry.confirmed;
      } else {
        checkins.push({ ...entry, date: new Date().toISOString() });
      }
    }
    await kv.set(key, checkins);
    return c.json({ success: true, count: entries.length });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Ratings ---
app.post("/make-server-c3078087/ratings", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const { orderId, stars, comment, unit } = await c.req.json();
    if (!stars) return c.json({ error: "Stars é obrigatório." }, 400);

    // Resolve user unit from metadata if not provided
    let userUnit = unit || '';
    if (!userUnit) {
      try {
        const supabase = adminClient();
        const { data: { user } } = await supabase.auth.admin.getUserById(auth.userId);
        userUnit = user?.user_metadata?.lunch_location || '';
      } catch (_) {}
    }

    const newRating = {
      id: crypto.randomUUID(),
      orderId: orderId || null,
      userId: auth.userId,
      userName: auth.userName,
      userUnit,
      date: new Date().toISOString(),
      stars,
      comment
    };

    // Store in a daily list for easier admin retrieval
    const today = brasiliaToday();
    const key = `ratings:${today}`;
    let dailyRatings = await kv.get(key) || [];
    dailyRatings.push(newRating);
    await kv.set(key, dailyRatings);

    // Update the specific order to reflect it has been rated (only if orderId provided)
    if (orderId) {
      const userOrders = await kv.get(`orders:${auth.userId}`) || [];
      let orderUpdated = false;
      for (const order of userOrders) {
        if (order.id === orderId) {
          order.rating = stars;
          order.ratingComment = comment;
          order.ratingDate = newRating.date;
          orderUpdated = true;
          break;
        }
      }
      if (orderUpdated) {
        await kv.set(`orders:${auth.userId}`, userOrders);
      }
      
      const orderDate = userOrders.find((o: any) => o.id === orderId)?.date?.split('T')[0];
      if (orderDate) {
          const dailyIndex = await kv.get(`orders-daily:${orderDate}`) || [];
          const idx = dailyIndex.findIndex((o: any) => o.id === orderId);
          if (idx >= 0) {
              dailyIndex[idx].rating = stars;
              dailyIndex[idx].ratingComment = comment;
              await kv.set(`orders-daily:${orderDate}`, dailyIndex);
          }
      }
    }

    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// User's own ratings (last 7 days)
app.get("/make-server-c3078087/ratings/mine", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const myRatings: any[] = [];
    for (let i = 0; i < 7; i++) {
      const d = brasiliaDateNow();
      d.setUTCDate(d.getUTCDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const dayRatings = await kv.get(`ratings:${dayStr}`) || [];
      for (const r of dayRatings) {
        if (r.userId === auth.userId) {
          myRatings.push(r);
        }
      }
    }
    myRatings.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return c.json(myRatings);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-c3078087/admin/ratings", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const date = c.req.query('date');
    const days = parseInt(c.req.query('days') || '30');
    if (date) {
      const ratings = await kv.get(`ratings:${date}`) || [];
      return c.json(ratings);
    }
    // Return last N days (default 30) for filtering
    const ratings: any[] = [];
    for (let i = 0; i < days; i++) {
      const d = brasiliaDateNow();
      d.setUTCDate(d.getUTCDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const dayRatings = await kv.get(`ratings:${dayStr}`) || [];
      ratings.push(...dayRatings);
    }
    return c.json(ratings);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- User Profile Update ---
app.put("/make-server-c3078087/users/me", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const { name, avatar, department, phone, lunchLocation, dietaryRestrictions } = await c.req.json();
    const supabase = adminClient();
    
    // Get current user metadata first to preserve existing fields
    const { data: currentUser, error: getUserError } = await supabase.auth.admin.getUserById(auth.userId);
    if (getUserError) return c.json({ error: getUserError.message }, 500);
    
    const updates: any = { ...currentUser.user.user_metadata };
    if (name) updates.name = name;
    if (avatar) updates.avatar_url = avatar;
    if (department !== undefined) updates.department = department;
    if (phone !== undefined) updates.phone = phone;
    if (lunchLocation !== undefined) updates.lunch_location = lunchLocation;
    if (dietaryRestrictions !== undefined) updates.dietary_restrictions = dietaryRestrictions;
    
    // Update user_metadata while preserving existing fields
    const { data, error } = await supabase.auth.admin.updateUserById(auth.userId, {
      user_metadata: updates
    });
    
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ success: true, user: data.user });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Avatar Upload ---
app.post("/make-server-c3078087/users/me/avatar", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const supabase = adminClient();
    const bucketName = "make-c3078087-avatars";

    // Idempotently create bucket
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((bucket: any) => bucket.name === bucketName);
    if (!bucketExists) {
      await supabase.storage.createBucket(bucketName, { public: false });
    }

    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return c.json({ error: "Nenhum arquivo enviado." }, 400);
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: "Tipo de arquivo não suportado. Use JPEG, PNG, WebP ou GIF." }, 400);
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: "Arquivo muito grande. Máximo 5MB." }, 400);
    }

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${auth.userId}/avatar-${Date.now()}.${ext}`;

    // Upload file
    const arrayBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.log("Avatar upload error:", uploadError);
      return c.json({ error: uploadError.message }, 500);
    }

    // Cleanup old avatars: list all files in user's folder, delete all except the new one
    try {
      const { data: existingFiles } = await supabase.storage
        .from(bucketName)
        .list(auth.userId, { limit: 100 });
      if (existingFiles && existingFiles.length > 0) {
        const newFileName = filePath.split('/').pop();
        const oldFiles = existingFiles
          .filter((f: any) => f.name !== newFileName && f.name.startsWith('avatar-'))
          .map((f: any) => `${auth.userId}/${f.name}`);
        if (oldFiles.length > 0) {
          const { error: deleteError } = await supabase.storage
            .from(bucketName)
            .remove(oldFiles);
          if (deleteError) {
            console.log("Old avatar cleanup warning (non-blocking):", deleteError.message);
          } else {
            console.log(`Cleaned up ${oldFiles.length} old avatar(s) for user ${auth.userId}`);
          }
        }
      }
    } catch (cleanupErr: any) {
      // Non-blocking: log but don't fail the upload
      console.log("Avatar cleanup exception (non-blocking):", cleanupErr.message);
    }

    // Create a signed URL (valid for 1 year)
    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);

    if (signedError) {
      console.log("Signed URL error:", signedError);
      return c.json({ error: signedError.message }, 500);
    }

    const avatarUrl = signedData.signedUrl;

    // Get current user metadata first to preserve existing fields
    const { data: currentUser, error: getUserError } = await supabase.auth.admin.getUserById(auth.userId);
    if (getUserError) {
      console.log("Get user error:", getUserError);
      return c.json({ error: getUserError.message }, 500);
    }

    // Update user metadata with new avatar URL while preserving other fields
    const { data: userData, error: userError } = await supabase.auth.admin.updateUserById(auth.userId, {
      user_metadata: { 
        ...currentUser.user.user_metadata,
        avatar_url: avatarUrl 
      }
    });

    if (userError) {
      console.log("User metadata update error:", userError);
      return c.json({ error: userError.message }, 500);
    }

    return c.json({ success: true, avatarUrl });
  } catch (e) {
    console.log("Avatar upload exception:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- Weekly Menu ---
app.get("/make-server-c3078087/admin/weekly-menu", async (c) => {
  const auth = await requireAdminOrKitchen(c);
  if (auth instanceof Response) return auth;
  try {
    const weekKey = c.req.query('week');
    if (weekKey) {
      const data = await kv.get(`weekly-menu:${weekKey}`) || {};
      return c.json(data);
    }
    const all = await kv.getByPrefix("weekly-menu:");
    return c.json(all);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-c3078087/admin/weekly-menu", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { weekKey, data } = await c.req.json();
    if (!weekKey) return c.json({ error: "weekKey é obrigatório." }, 400);
    await kv.set(`weekly-menu:${weekKey}`, data);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Daily Menu Management ---
// Get daily menu for a specific date
app.get("/make-server-c3078087/admin/daily-menu", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const date = c.req.query('date');
    if (date) {
      const menu = await kv.get(`daily-menu:${date}`) || [];
      return c.json(menu);
    }
    // Get all daily menus
    const all = await kv.getByPrefix("daily-menu:");
    return c.json(all);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// Set daily menu for a specific date
app.post("/make-server-c3078087/admin/daily-menu", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { date, itemIds } = await c.req.json();
    if (!date) return c.json({ error: "date é obrigatório." }, 400);
    if (!Array.isArray(itemIds)) return c.json({ error: "itemIds deve ser um array." }, 400);
    
    // Store array of item IDs for the date
    const menuItems = itemIds.map((id: string) => ({ id }));
    await kv.set(`daily-menu:${date}`, menuItems);
    
    return c.json({ success: true, date, count: menuItems.length });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// Delete daily menu for a specific date
app.delete("/make-server-c3078087/admin/daily-menu/:date", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const date = c.req.param('date');
    
    // Delete the daily menu
    await kv.del(`daily-menu:${date}`);
    
    // Also remove from published list
    const dayDate = new Date(date);
    const dayOfWeek = dayDate.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeekDate = new Date(dayDate);
    startOfWeekDate.setDate(dayDate.getDate() + diff);
    const weekKey = startOfWeekDate.toISOString().split('T')[0];
    
    const publishedKey = `menu:published:${weekKey}`;
    let publishedDays = await kv.get(publishedKey) || [];
    publishedDays = publishedDays.filter((d: string) => d !== date);
    await kv.set(publishedKey, publishedDays);
    
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Recurring Items ---
// GET: returns array of item IDs marked as recurring (daily)
app.get("/make-server-c3078087/admin/recurring-items", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const ids = await kv.get("menu:recurring-items") || [];
    return c.json(ids);
  } catch (e) {
    console.log("Error fetching recurring items:", e);
    return c.json({ error: e.message }, 500);
  }
});

// POST: saves the full list of recurring item IDs
app.post("/make-server-c3078087/admin/recurring-items", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const body = await c.req.json();
    const itemIds = body.itemIds;
    if (!Array.isArray(itemIds)) {
      return c.json({ error: "itemIds deve ser um array" }, 400);
    }
    await kv.set("menu:recurring-items", itemIds);
    return c.json({ success: true, count: itemIds.length });
  } catch (e) {
    console.log("Error saving recurring items:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- Image Upload ---
app.post("/make-server-c3078087/admin/upload", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const supabase = adminClient();
    const bucketName = "make-c3078087-images";

    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b: any) => b.name === bucketName);
    if (!bucketExists) {
      await supabase.storage.createBucket(bucketName, { public: false });
    }

    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!file) return c.json({ error: "Nenhum arquivo enviado." }, 400);

    // Sanitize filename: remove accents, spaces, and special characters
    const originalName = (file as File).name;
    const sanitizedName = originalName
      .normalize('NFD') // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace invalid chars with underscore
      .replace(/_+/g, '_') // Collapse multiple underscores
      .toLowerCase();
    
    const fileName = `${Date.now()}-${sanitizedName}`;
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file, { contentType: (file as File).type });

    if (error) return c.json({ error: error.message }, 500);

    const { data: urlData } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);

    return c.json({ url: urlData?.signedUrl, path: data?.path });
  } catch (e) {
    console.log("Upload error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- AI Image Generation (multi-provider with fallback) ---

// Helper: fetch image bytes from a URL with browser-like headers & timeout
async function fetchImageBytes(
  url: string,
  timeoutMs = 60000,
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return { buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}

// --- PT→EN translation dictionary for food terms ---
const foodTranslations: Record<string, string> = {
  // Grains & carbs
  arroz: "rice", "feijão": "beans", "macarrão": "pasta", "pão": "bread",
  farofa: "toasted cassava flour", mandioca: "cassava", milho: "corn",
  "purê": "mashed potatoes", batata: "potato", lasanha: "lasagna",
  nhoque: "gnocchi", polenta: "polenta", cuscuz: "couscous",
  tapioca: "tapioca", "mingau": "porridge",
  // Proteins
  frango: "chicken", carne: "beef", peixe: "fish", porco: "pork",
  "suíno": "pork", picanha: "picanha steak", costela: "ribs",
  linguica: "sausage", "linguiça": "sausage", bacon: "bacon",
  ovo: "egg", ovos: "eggs", "camarão": "shrimp", atum: "tuna",
  "salmão": "salmon", tilapia: "tilapia", "tilápia": "tilapia",
  sardinha: "sardine", "filé": "fillet", "bife": "steak",
  "cupim": "beef hump", "alcatra": "top sirloin",
  "maminha": "tri-tip steak", "acém": "chuck beef",
  "patinho": "eye of round", "músculo": "beef shank",
  // Vegetables & greens
  salada: "salad", legumes: "vegetables", cenoura: "carrot",
  beterraba: "beet", abobrinha: "zucchini", "abóbora": "pumpkin",
  berinjela: "eggplant", "brócolis": "broccoli", couve: "collard greens",
  espinafre: "spinach", repolho: "cabbage", "pepino": "cucumber",
  tomate: "tomato", cebola: "onion", alho: "garlic",
  "pimentão": "bell pepper", quiabo: "okra", chuchu: "chayote",
  "vagem": "green beans", "ervilha": "peas", "lentilha": "lentils",
  sopa: "soup",
  // Dairy
  queijo: "cheese", leite: "milk", iogurte: "yogurt",
  "requeijão": "cream cheese", manteiga: "butter", creme: "cream",
  // Preparations / styles
  grelhado: "grilled", assado: "roasted", frito: "fried",
  cozido: "stew", ensopado: "stew", refogado: "sauteed",
  empanado: "breaded", recheado: "stuffed", "à milanesa": "breaded cutlet",
  gratinado: "au gratin", defumado: "smoked",
  // Classic Brazilian dishes (multi-word first)
  "feijão tropeiro": "Brazilian tropeiro beans with sausage and collard greens",
  "estrogonofe": "stroganoff", "parmegiana": "chicken parmigiana",
  "frango à passarinho": "crispy fried chicken pieces",
  "carne de sol": "sun-dried beef", feijoada: "Brazilian feijoada black bean stew with pork",
  "moqueca": "Brazilian fish moqueca stew", "vatapá": "vatapa Brazilian shrimp paste",
  "acarajé": "acaraje fried bean cake", "bobó": "bobo shrimp cassava puree",
  "tutu": "tutu mashed beans", "virado": "virado beans with egg",
  "baião de dois": "baiao rice and beans", "galinhada": "Brazilian chicken rice",
  "escondidinho": "escondidinho beef cassava casserole",
  "coxinha": "coxinha chicken croquette", "empadão": "Brazilian pot pie",
  // Desserts & sweets
  bolo: "cake", torta: "pie", pudim: "flan pudding",
  sobremesa: "dessert", "brigadeiro": "brigadeiro chocolate truffle",
  "beijinho": "beijinho coconut truffle", "paçoca": "pacoca peanut candy",
  "mousse": "mousse", sorvete: "ice cream", "doce": "sweet dessert",
  // Beverages
  suco: "juice", "café": "coffee", "chá": "tea",
  vitamina: "smoothie", "limonada": "lemonade",
};

// Translate a Portuguese dish name to English for image generation
function translateDishToEnglish(dishName: string, description?: string): string {
  let text = (description ? `${dishName} ${description}` : dishName).toLowerCase();
  // Sort keys by length descending so multi-word matches are replaced first
  const sortedKeys = Object.keys(foodTranslations).sort((a, b) => b.length - a.length);
  for (const pt of sortedKeys) {
    const en = foodTranslations[pt];
    text = text.replace(new RegExp(pt, "gi"), en);
  }
  // Clean non-ascii leftovers
  return text.replace(/[^\w\s,.-]/gi, " ").replace(/\s+/g, " ").trim();
}

// Provider 1 – Pollinations.ai (AI-generated, dish-specific)
async function tryPollinations(dishName: string, description?: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const translated = translateDishToEnglish(dishName, description);
  
  const variations = [
    "professional food photography, overhead angle, on a white ceramic plate, soft natural lighting, clean background, high resolution, realistic",
    "appetizing close-up shot, shallow depth of field, on a rustic wooden table, warm lighting, realistic food photo, detailed texture",
    "restaurant style plating, side angle, garnished beautifully, studio lighting, clean composition, photorealistic, delicious looking",
    "top-down flat lay food photo, colorful fresh ingredients visible, marble surface, bright natural light, editorial style, ultra detailed"
  ];
  const variation = variations[Math.floor(Math.random() * variations.length)];
  
  // Build a highly specific prompt emphasizing it's a FOOD photo
  const prompt = `A real photograph of a delicious plate of ${translated}, Brazilian cuisine, ${variation}`;
  const encoded = encodeURIComponent(prompt);
  // Use high-entropy randomness + timestamp for unique seeds
  const seed = Math.floor(Math.random() * 99999999) + Date.now();

  // Try with flux model first (best quality), then fallback without model param
  const urls = [
    `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&seed=${seed}&nologo=true&model=flux`,
    `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&seed=${seed + 7777}&nologo=true`,
  ];

  for (let i = 0; i < urls.length; i++) {
    try {
      console.log(`[AI Image] Pollinations attempt ${i + 1} for "${dishName}" → translated: "${translated.substring(0, 60)}..." seed=${seed + (i * 7777)}`);
      const result = await fetchImageBytes(urls[i], 50000);
      if (result.buffer.byteLength > 10000 && result.contentType.startsWith("image/")) {
        console.log(`[AI Image] Pollinations OK – ${result.buffer.byteLength} bytes, type: ${result.contentType}`);
        return result;
      }
      console.log(`[AI Image] Pollinations attempt ${i + 1}: rejected (${result.buffer.byteLength}b / ${result.contentType})`);
    } catch (err: any) {
      console.log(`[AI Image] Pollinations attempt ${i + 1} failed: ${err.message}`);
    }
    if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

// Provider 2 – LoremFlickr (keyword-based food photo fallback)
async function tryLoremFlickr(dishName: string, description?: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const translated = translateDishToEnglish(dishName, description);
  // Extract the most meaningful keywords (up to 4) and always include "food"
  const keywords = translated.replace(/[^a-z0-9 ]/gi, " ").trim().split(/\s+/)
    .filter((w: string) => w.length > 2)
    .slice(0, 4);
  keywords.unshift("food"); // Always lead with "food" to anchor results
  const keywordStr = [...new Set(keywords)].join(",");
  const lock = Math.floor(Math.random() * 99999) + Date.now() % 99999;
  const url = `https://loremflickr.com/512/512/${encodeURIComponent(keywordStr)}?lock=${lock}`;
  
  try {
    console.log(`[AI Image] LoremFlickr fallback for "${dishName}" → keywords: "${keywordStr}", lock: ${lock}`);
    const result = await fetchImageBytes(url, 15000);
    if (result.buffer.byteLength > 5000 && result.contentType.startsWith("image/")) {
      console.log(`[AI Image] LoremFlickr OK – ${result.buffer.byteLength} bytes`);
      return result;
    }
    console.log(`[AI Image] LoremFlickr rejected (${result.buffer.byteLength}b / ${result.contentType})`);
  } catch (err: any) {
    console.log(`[AI Image] LoremFlickr failed: ${err.message}`);
  }
  return null;
}

app.post("/make-server-c3078087/admin/generate-ai-image", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { dishName, description } = await c.req.json();
    if (!dishName || typeof dishName !== "string") {
      return c.json({ error: "Nome do prato é obrigatório." }, 400);
    }

    console.log(`[AI Image] Generating image for: "${dishName}" (Description: ${description?.substring(0, 30)}...)`);

    // Try providers in order: Pollinations (AI) → LoremFlickr (food keyword)
    let imageData: { buffer: ArrayBuffer; contentType: string } | null = null;
    let provider = "";

    imageData = await tryPollinations(dishName, description);
    if (imageData) { provider = "pollinations"; }

    if (!imageData) {
      imageData = await tryLoremFlickr(dishName, description);
      if (imageData) { provider = "loremflickr"; }
    }

    if (!imageData) {
      return c.json(
        { error: "Não foi possível gerar imagem. Todos os provedores falharam. Tente novamente mais tarde ou faça upload manual." },
        502,
      );
    }

    console.log(`[AI Image] Using provider: ${provider} (${imageData.buffer.byteLength} bytes)`);

    // Upload to Supabase Storage
    const supabase = adminClient();
    const bucketName = "make-c3078087-images";

    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b: any) => b.name === bucketName);
    if (!bucketExists) {
      await supabase.storage.createBucket(bucketName, { public: false });
    }

    const ct = imageData.contentType;
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const safeName = dishName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50);
    const fileName = `ai-generated/${Date.now()}-${safeName}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, imageData.buffer, { contentType: ct, upsert: true });

    if (uploadError) {
      console.log("[AI Image] Upload error:", uploadError);
      return c.json({ error: `Erro ao salvar imagem: ${uploadError.message}` }, 500);
    }

    const { data: urlData, error: urlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);

    if (urlError) {
      console.log("[AI Image] Signed URL error:", urlError);
      return c.json({ error: `Erro ao gerar URL: ${urlError.message}` }, 500);
    }

    console.log(`[AI Image] Success! Provider=${provider}, stored as ${fileName}`);
    return c.json({ url: urlData?.signedUrl, path: uploadData?.path, provider });
  } catch (e: any) {
    console.log("[AI Image] Exception:", e);
    return c.json({ error: e.message || "Erro interno ao gerar imagem." }, 500);
  }
});

// --- Dashboard aggregated data ---
app.get("/make-server-c3078087/admin/dashboard", async (c) => {
  const auth = await requireAdminOrKitchen(c);
  if (auth instanceof Response) return auth;
  try {
    const today = brasiliaToday();

    // Try daily index first for today
    let todayOrders = await kv.get(`orders-daily:${today}`) || [];

    // If no daily index, fallback to prefix scan
    if (todayOrders.length === 0) {
      const allOrdersMap = await kv.getByPrefix("orders:");
      const allOrders = allOrdersMap.flat().filter((o: any) => o && o.id);
      todayOrders = allOrders.filter((o: any) => o.date?.startsWith(today));
    }

    const uniqueUserIds = new Set(todayOrders.map((o: any) => o.userId));
    const abstentions = await kv.get(`abstentions:${today}`) || [];

    const todayItems: any[] = todayOrders.flatMap((o: any) => o.items || []);
    const itemCount: Record<string, { name: string; count: number; category: string }> = {};
    todayItems.forEach((item: any) => {
      const qty = item.quantity || 1;
      if (itemCount[item.id]) {
        itemCount[item.id].count += qty;
      } else {
        itemCount[item.id] = { name: item.name, count: qty, category: item.category || '' };
      }
    });
    const topItems = Object.values(itemCount).sort((a, b) => b.count - a.count);

    // Weekly data (last 7 days) using daily indexes - batched read
    const weekDates: { dateStr: string; dayName: string }[] = [];
    const weekKeys: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = brasiliaDateNow();
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getUTCDay()];
      weekDates.push({ dateStr, dayName });
      weekKeys.push(`orders-daily:${dateStr}`);
    }
    
    const weekOrdersArr = await kv.mget(weekKeys);
    const weekData: any[] = weekDates.map((wd, idx) => {
      const dayOrders = weekOrdersArr[idx] || [];
      return {
        name: wd.dayName,
        date: wd.dateStr,
        orders: dayOrders.length,
        items: dayOrders.reduce((acc: number, o: any) => acc + (o.items?.reduce((s: number, it: any) => s + (it.quantity || 1), 0) || 0), 0),
      };
    });

    const lastOrders = todayOrders
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    return c.json({
      todayOrdersCount: todayOrders.length,
      uniqueUsersOrdered: uniqueUserIds.size,
      topItems,
      weekData,
      lastOrders,
      abstentions,
      allOrdersCount: todayOrders.length,
    });
  } catch (e) {
    console.log("Dashboard error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- Settings ---
app.get("/make-server-c3078087/admin/settings", async (c) => {
  // Settings read is public (user app needs cutoff time, unit name, etc.)
  try {
    const settings = await kv.get("settings") || {};
    return c.json(settings);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-c3078087/admin/settings", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const incoming = await c.req.json();
    // Merge with existing settings so fields like pwaIconUrl/pwaIconPath are preserved
    const existing: any = await kv.get("settings") || {};
    const merged = { ...existing, ...incoming };
    await kv.set("settings", merged);
    const changedKeys = Object.keys(incoming).join(", ");
    await logAudit(c, auth, "UPDATE_SETTINGS", "settings", `Atualizou configuracoes: ${changedKeys}.`, { fields: Object.keys(incoming) });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- PWA Icon Upload ---
app.post("/make-server-c3078087/admin/pwa-icon", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const supabase = adminClient();
    const bucketName = "make-c3078087-images";

    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b: any) => b.name === bucketName);
    if (!bucketExists) {
      await supabase.storage.createBucket(bucketName, { public: false });
    }

    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return c.json({ error: "Nenhum arquivo enviado." }, 400);
    }

    if (!file.type.startsWith("image/")) {
      return c.json({ error: "Arquivo deve ser uma imagem (PNG, JPG, SVG, etc.)." }, 400);
    }

    // Delete old icon if exists
    const settings: any = await kv.get("settings") || {};
    if (settings.pwaIconPath) {
      await supabase.storage.from(bucketName).remove([settings.pwaIconPath]);
    }

    const ext = file.type.includes("png") ? "png" : file.type.includes("svg") ? "svg" : file.type.includes("webp") ? "webp" : "png";
    const fileName = `pwa-icon-${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file, { contentType: file.type, upsert: true });

    if (error) return c.json({ error: error.message }, 500);

    // Signed URL with 10-year expiry
    const { data: urlData } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 10);

    settings.pwaIconUrl = urlData?.signedUrl;
    settings.pwaIconPath = data?.path || fileName;
    await kv.set("settings", settings);

    return c.json({ url: urlData?.signedUrl, path: data?.path });
  } catch (e) {
    console.log("PWA icon upload error:", e);
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-c3078087/admin/pwa-icon", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const supabase = adminClient();
    const bucketName = "make-c3078087-images";
    const settings: any = await kv.get("settings") || {};

    if (settings.pwaIconPath) {
      await supabase.storage.from(bucketName).remove([settings.pwaIconPath]);
    }

    delete settings.pwaIconUrl;
    delete settings.pwaIconPath;
    await kv.set("settings", settings);

    return c.json({ success: true });
  } catch (e) {
    console.log("PWA icon delete error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- Notifications (served under /inbox to avoid relay-level path caching) ---

// GET /inbox  — fetch all notifications for the authenticated user
app.get("/make-server-c3078087/inbox", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const globalNotifs: any[] = await kv.get("notifications:global") || [];
    const userNotifs: any[] = await kv.get(`notifications:user:${auth.userId}`) || [];
    const readIds: string[] = await kv.get(`notifications:read:${auth.userId}`) || [];
    const readSet = new Set(readIds);

    const now = new Date();

    // Filter global notifications
    const visibleGlobal = globalNotifs.filter((n: any) => {
      // 1. Check scheduling
      if (n.scheduledFor && new Date(n.scheduledFor) > now) return false;

      // 2. Check recipients
      if (!n.recipients || n.recipients.type === 'all') return true;
      
      if (n.recipients.type === 'role') {
        // e.g. value can be 'admin' or ['admin', 'master']
        const roles = Array.isArray(n.recipients.value) ? n.recipients.value : [n.recipients.value];
        return roles.includes(auth.role);
      }
      
      if (n.recipients.type === 'users') {
        const userIds = Array.isArray(n.recipients.value) ? n.recipients.value : [n.recipients.value];
        return userIds.includes(auth.userId);
      }

      // Fallback for legacy "targetUserId" if it somehow ended up in global (though usually it's in user specific list)
      if (n.targetUserId && n.targetUserId !== 'all' && n.targetUserId !== auth.userId) return false;

      return true;
    });

    // Filter user notifications (scheduling only)
    const visibleUser = userNotifs.filter((n: any) => {
      if (n.scheduledFor && new Date(n.scheduledFor) > now) return false;
      return true;
    });

    const all = [...visibleGlobal, ...visibleUser]
      .sort((a: any, b: any) => {
         const dateA = a.scheduledFor ? new Date(a.scheduledFor).getTime() : new Date(a.sentAt).getTime();
         const dateB = b.scheduledFor ? new Date(b.scheduledFor).getTime() : new Date(b.sentAt).getTime();
         return dateB - dateA;
      })
      .map((n: any) => ({ ...n, read: readSet.has(n.id) }));

    return c.json(all);
  } catch (e: any) {
    console.log("Get inbox error:", e);
    return c.json({ error: e?.message ?? "Unknown error" }, 500);
  }
});

// POST /inbox/mark-all-read  — static route, registered BEFORE /:id/mark-read
app.post("/make-server-c3078087/inbox/mark-all-read", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const globalNotifs: any[] = await kv.get("notifications:global") || [];
    const userNotifs: any[] = await kv.get(`notifications:user:${auth.userId}`) || [];
    const allIds = [...globalNotifs, ...userNotifs].map((n: any) => n.id);
    await kv.set(`notifications:read:${auth.userId}`, allIds);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message ?? "Unknown error" }, 500);
  }
});

// POST /inbox/:id/mark-read  — parameterised, registered AFTER the static route above
app.post("/make-server-c3078087/inbox/:id/mark-read", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const notifId = c.req.param("id");
    const key = `notifications:read:${auth.userId}`;
    const readIds: string[] = await kv.get(key) || [];
    if (!readIds.includes(notifId)) {
      readIds.push(notifId);
      await kv.set(key, readIds);
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message ?? "Unknown error" }, 500);
  }
});

// Admin: send a notification
app.post("/make-server-c3078087/admin/inbox/send", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { title, message, type, recipients, scheduledFor } = await c.req.json();
    if (!title || !message) return c.json({ error: "Título e mensagem são obrigatórios." }, 400);

    const notif = {
      id: crypto.randomUUID(),
      title,
      message,
      type: type || "info",
      sentAt: new Date().toISOString(),
      scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      sentBy: auth.userId,
      sentByName: auth.userName,
      recipients: recipients || { type: 'all' }, // { type: 'all' | 'role' | 'users', value?: any }
      targetUserId: recipients?.type === 'users' && recipients.value.length === 1 ? recipients.value[0] : 'all', // Legacy fallback
    };

    // Determine where to save based on recipients
    if (!recipients || recipients.type === 'all' || recipients.type === 'role') {
      // Save to global list (filtered on read for roles)
      const globalNotifs: any[] = await kv.get("notifications:global") || [];
      globalNotifs.unshift(notif);
      await kv.set("notifications:global", globalNotifs.slice(0, 200));
    } else if (recipients.type === 'users') {
      // Save to individual user lists
      const userIds = Array.isArray(recipients.value) ? recipients.value : [recipients.value];
      for (const uid of userIds) {
        const userNotifs: any[] = await kv.get(`notifications:user:${uid}`) || [];
        userNotifs.unshift(notif);
        await kv.set(`notifications:user:${uid}`, userNotifs.slice(0, 50));
      }
    }

    return c.json({ success: true, notification: notif });
  } catch (e: any) {
    console.log("Send notification error:", e);
    return c.json({ error: e?.message ?? "Unknown error" }, 500);
  }
});

// Admin: list all global notifications
app.get("/make-server-c3078087/admin/inbox", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const globalNotifs: any[] = await kv.get("notifications:global") || [];
    return c.json(globalNotifs);
  } catch (e: any) {
    return c.json({ error: e?.message ?? "Unknown error" }, 500);
  }
});

// Admin: delete a notification
app.delete("/make-server-c3078087/admin/inbox/:id", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const notifId = c.req.param("id");
    let globalNotifs: any[] = await kv.get("notifications:global") || [];
    globalNotifs = globalNotifs.filter((n: any) => n.id !== notifId);
    await kv.set("notifications:global", globalNotifs);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message ?? "Unknown error" }, 500);
  }
});

// Legacy aliases — keep the old /notifications paths alive so existing
// deployments do not break; they simply delegate to the same KV logic.
app.get("/make-server-c3078087/notifications", async (c) => {
  return c.redirect(c.req.url.replace("/notifications", "/inbox"), 307);
});

// --- Menu: Available Dates (Public) ---
// Returns dates that have a published weekly menu
app.get("/make-server-c3078087/menu/available-dates", async (c) => {
  try {
    const allWeeklyMenus = await kv.getByPrefix("weekly-menu:");
    const recurringIds = await kv.get("menu:recurring-items") || [];
    const dates: string[] = [];

    // 1. Get dates from planned weekly menus
    for (const weekData of allWeeklyMenus) {
      if (weekData && typeof weekData === 'object' && !Array.isArray(weekData)) {
        for (const [dateKey, items] of Object.entries(weekData)) {
          if (Array.isArray(items) && items.length > 0) {
            dates.push(dateKey);
          }
        }
      }
    }

    // 2. If there are recurring items, ensure at least the current week and next week are available
    if (recurringIds.length > 0) {
      const now = new Date(Date.now() - 3 * 60 * 60 * 1000); // Brasília
      // Start of current week (Monday)
      const day = now.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      const start = new Date(now);
      start.setUTCDate(now.getUTCDate() + diff);
      
      // Add 14 days (current week + next week)
      for (let i = 0; i < 14; i++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        dates.push(d.toISOString().split('T')[0]);
      }
    }

    // Sort and deduplicate
    const unique = [...new Set(dates)].sort();
    return c.json(unique);
  } catch (e: any) {
    console.log("Available dates error:", e);
    return c.json({ error: e?.message ?? "Unknown error" }, 500);
  }
});

// --- Order Status Polling (for real-time updates) ---
app.get("/make-server-c3078087/orders/today-status", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const today = brasiliaToday();
    const userOrders = await kv.get(`orders:${auth.userId}`) || [];
    const todayOrder = userOrders.find((o: any) => o.date?.startsWith(today) && o.status !== 'Cancelado');
    if (!todayOrder) return c.json({ order: null });
    return c.json({ order: { id: todayOrder.id, status: todayOrder.status, items: todayOrder.items } });
  } catch (e: any) {
    return c.json({ error: e?.message ?? "Unknown error" }, 500);
  }
});

// --- Bootstrap: Consolidated initial data in a single round-trip ---
// Returns everything the Home screen needs: settings, available dates, today's menu,
// user orders, and abstention status. Drastically reduces cold-start latency.
app.get("/make-server-c3078087/bootstrap", async (c) => {
  try {
    const auth = await getAuthUser(c);
    const today = brasiliaToday();
    const dateParam = c.req.query("date"); // optional, defaults to today

    // Fire all KV reads in parallel
    const settingsP = kv.get("settings").then((s: any) => s || {}).catch(() => ({}));
    const weeklyMenusP = kv.getByPrefix("weekly-menu:").catch(() => []);
    const recurringIdsP = kv.get("menu:recurring-items").then((r: any) => r || []).catch(() => []);
    const allItemsP = kv.get("menu:items").then((i: any) => i || []).catch(() => []);
    const ordersP = auth
      ? kv.get(`orders:${auth.userId}`).then((o: any) => o || []).catch(() => [])
      : Promise.resolve([]);
    const abstentionP = auth
      ? kv.get(`abstentions:${today}`).then((list: any) => {
          return { abstained: (list || []).some((a: any) => a.userId === auth.userId) };
        }).catch(() => ({ abstained: false }))
      : Promise.resolve({ abstained: false });

    const [settings, allWeeklyMenus, recurringIds, allItems, orders, abstention] = await Promise.all([
      settingsP, weeklyMenusP, recurringIdsP, allItemsP, ordersP, abstentionP,
    ]);

    // ── Compute available dates (same logic as /menu/available-dates) ──
    const datesSet = new Set<string>();
    for (const weekData of allWeeklyMenus) {
      if (weekData && typeof weekData === "object" && !Array.isArray(weekData)) {
        for (const [dateKey, items] of Object.entries(weekData)) {
          if (Array.isArray(items) && items.length > 0) datesSet.add(dateKey);
        }
      }
    }
    if (recurringIds.length > 0) {
      const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const day = now.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      const start = new Date(now);
      start.setUTCDate(now.getUTCDate() + diff);
      for (let i = 0; i < 14; i++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        datesSet.add(d.toISOString().split("T")[0]);
      }
    }
    const availableDates = [...datesSet].sort();

    // ── Compute today's menu (same logic as /menu/today) ──
    const menuDateKey = dateParam || today;
    const isToday = menuDateKey === today;

    const todayDailyMenu = await kv.get(`daily-menu:${menuDateKey}`).catch(() => null);
    const itemIds = new Set(recurringIds);
    if (todayDailyMenu && Array.isArray(todayDailyMenu)) {
      todayDailyMenu.forEach((i: any) => itemIds.add(i.id));
    }

    let menuItems: any[] = [];
    if (itemIds.size > 0) {
      menuItems = allItems
        .filter((i: any) => itemIds.has(i.id))
        .map((i: any) => ({ ...i, isPreviousDay: false }));
    } else if (isToday) {
      // Fallback: show yesterday's menu greyed out
      const yesterdayDate = new Date(Date.now() - 3 * 60 * 60 * 1000);
      yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
      const yesterdayKey = yesterdayDate.toISOString().split("T")[0];
      const yesterdayDailyMenu = await kv.get(`daily-menu:${yesterdayKey}`).catch(() => null);
      if (yesterdayDailyMenu && Array.isArray(yesterdayDailyMenu) && yesterdayDailyMenu.length > 0) {
        const yIds = new Set(yesterdayDailyMenu.map((i: any) => i.id));
        menuItems = allItems
          .filter((i: any) => yIds.has(i.id))
          .map((i: any) => ({ ...i, isPreviousDay: true }));
      }
    }

    return c.json({
      settings,
      availableDates,
      menuItems,
      orders,
      abstention,
    });
  } catch (e: any) {
    console.log("Bootstrap error:", e);
    return c.json({ error: e?.message ?? "Bootstrap failed" }, 500);
  }
});

// --- Admin: Data Cleanup ---
app.post("/make-server-c3078087/admin/cleanup", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { daysToKeep = 90 } = await c.req.json().catch(() => ({ daysToKeep: 90 }));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    let cleaned = { dailyOrders: 0, abstentions: 0, checkins: 0, ratings: 0 };

    // We scan daily-indexed keys. Since we can't enumerate easily with kv_store,
    // we clean up individual known date ranges.
    for (let i = daysToKeep; i < daysToKeep + 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const daily = await kv.get(`orders-daily:${dateStr}`);
      if (daily) { await kv.del(`orders-daily:${dateStr}`); cleaned.dailyOrders++; }
      
      const abs = await kv.get(`abstentions:${dateStr}`);
      if (abs) { await kv.del(`abstentions:${dateStr}`); cleaned.abstentions++; }
      
      const ci = await kv.get(`checkins:${dateStr}`);
      if (ci) { await kv.del(`checkins:${dateStr}`); cleaned.checkins++; }
      
      const rt = await kv.get(`ratings:${dateStr}`);
      if (rt) { await kv.del(`ratings:${dateStr}`); cleaned.ratings++; }
    }

    return c.json({ success: true, cleaned, message: `Dados anteriores a ${cutoffStr} removidos.` });
  } catch (e: any) {
    console.log("Cleanup error:", e);
    return c.json({ error: e?.message ?? "Unknown error" }, 500);
  }
});

// --- Admin: Full Export (JSON) ---
app.get("/make-server-c3078087/admin/export", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const dateFrom = c.req.query('from');
    const dateTo = c.req.query('to');
    
    if (!dateFrom || !dateTo) {
      return c.json({ error: "Parâmetros 'from' e 'to' são obrigatórios (YYYY-MM-DD)." }, 400);
    }

    const allOrders: any[] = [];
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOrders = await kv.get(`orders-daily:${dateStr}`) || [];
      allOrders.push(...dayOrders);
    }

    return c.json({
      period: { from: dateFrom, to: dateTo },
      totalOrders: allOrders.length,
      orders: allOrders,
    });
  } catch (e: any) {
    console.log("Export error:", e);
    return c.json({ error: e?.message ?? "Unknown error" }, 500);
  }
});

// --- Menu CSV Import ---
app.post("/make-server-c3078087/admin/menu/import-csv", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { csv } = await c.req.json();
    if (!csv) return c.json({ error: "CSV string é necessária." }, 400);

    // Remove BOM if present
    const cleanCsv = csv.replace(/^\uFEFF/, '');
    const lines = cleanCsv.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
    if (lines.length < 2) return c.json({ error: "CSV deve conter cabeçalho e pelo menos uma linha de dados." }, 400);

    // Detect delimiter
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    // Helper to parse CSV line respecting quotes
    const parseCSVLine = (text: string, delimiter: string): string[] => {
      const result: string[] = [];
      let curVal = "";
      let inQuote = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
          if (inQuote && text[i + 1] === '"') {
            curVal += '"';
            i++; 
          } else {
            inQuote = !inQuote;
          }
        } else if (char === delimiter && !inQuote) {
          result.push(curVal.trim());
          curVal = "";
        } else {
          curVal += char;
        }
      }
      result.push(curVal.trim());
      return result;
    };

    // Header mapping (Portuguese support + English normalization)
    const HEADER_MAP: Record<string, string> = {
      // English
      "name": "name", "description": "description", "category": "category",
      "unit": "unit", "kitchenunit": "kitchenUnit", "image": "image",
      "portionweight": "portionWeight", "available": "available", "limit": "limit", "calories": "calories",
      "protein": "protein", "carbs": "carbs", "fat": "fat", "fiber": "fiber", "tip": "tip",
      
      // Portuguese
      "nome": "name", "prato": "name", "item": "name",
      "descrição": "description", "descricao": "description",
      "categoria": "category",
      "unidade": "unit", "unid": "unit",
      "calorias": "calories", "kcal": "calories",
      "estoque": "available", "disponivel": "available", "qtd": "available",
      "imagem": "image", "url": "image", "url da imagem": "image", "url imagem": "image", "foto": "image", "link imagem": "image",
      "peso": "portionWeight", "peso da porção": "portionWeight", "peso porcao": "portionWeight",
      "peso vol/porção": "portionWeight", "peso vol/porcao": "portionWeight", "peso/vol porção": "portionWeight",
      "unidade cozinha": "kitchenUnit", "unid cozinha": "kitchenUnit", "unidade de medida": "kitchenUnit",
      "limite": "limit", "maximo": "limit", "limite por pessoa": "limit",
      // Nutritional - Portuguese
      "prot. (g)": "protein", "prot.(g)": "protein", "prot (g)": "protein", "proteina": "protein", "proteína": "protein", "proteinas": "protein", "proteínas": "protein", "prot": "protein", "proteina (g)": "protein", "proteína (g)": "protein",
      "carb. (g)": "carbs", "carb.(g)": "carbs", "carb (g)": "carbs", "carboidrato": "carbs", "carboidratos": "carbs", "carb": "carbs", "carboidrato (g)": "carbs", "carboidratos (g)": "carbs",
      "gord. (g)": "fat", "gord.(g)": "fat", "gord (g)": "fat", "gordura": "fat", "gorduras": "fat", "gord": "fat", "gordura (g)": "fat", "gorduras (g)": "fat",
      "fibras (g)": "fiber", "fibras(g)": "fiber", "fibra (g)": "fiber", "fibra": "fiber", "fibras": "fiber",
      "dica": "tip", "dicas": "tip", "observação": "tip", "observacao": "tip", "obs": "tip"
    };

    const rawHeaders = parseCSVLine(firstLine, delimiter);
    const headers = rawHeaders.map((h: string) => {
      const normalized = h.toLowerCase().trim().replace(/^"|"$/g, '').replace(/\s+/g, ' ').normalize('NFC');
      const mapped = HEADER_MAP[normalized];
      if (mapped) return mapped;

      // Fallback: strip non-alphanumeric for fuzzy matching (handles extra spaces, special chars)
      const stripped = normalized.replace(/[^a-z0-9àáâãéèêíóôõúüçñ().]/g, '');
      for (const [key, val] of Object.entries(HEADER_MAP)) {
        if (key.replace(/[^a-z0-9àáâãéèêíóôõúüçñ().]/g, '') === stripped) return val;
      }

      return normalized;
    });

    console.log('[CSV Import] Raw headers:', JSON.stringify(rawHeaders));
    console.log('[CSV Import] Mapped headers:', JSON.stringify(headers));

    const newItems: any[] = [];

    const NUMERIC_FIELDS = new Set(['calories', 'available', 'limit', 'portionWeight', 'protein', 'carbs', 'fat', 'fiber']);
    const STRING_FIELDS = new Set(['name', 'description', 'category', 'unit', 'kitchenUnit', 'image', 'tip']);

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i], delimiter);
      // Skip empty lines
      if (values.length === 1 && !values[0]) continue;

      const item: any = { id: crypto.randomUUID(), createdAt: new Date().toISOString() };

      headers.forEach((h: string, idx: number) => {
        let val = values[idx];
        if (val === undefined || val === null || val === '') return;

        // Remove quotes if present
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        val = val.trim();
        if (!val) return;

        if (NUMERIC_FIELDS.has(h)) {
          val = val.replace(/[R$\s]/g, ''); // remove currency symbol & whitespace
          if (!val) return; // skip if nothing left
          if (delimiter === ';') {
            // BR format: 1.000,00 -> 1000.00
            val = val.replace(/\./g, '').replace(',', '.');
          } else {
            // US format: 1,000.00 -> 1000.00
            val = val.replace(/,/g, '');
          }
          const num = Number(val);
          item[h] = isNaN(num) ? 0 : num;
        } else if (STRING_FIELDS.has(h)) {
          item[h] = val;
        }
      });

      // Log first item for debugging
      if (i === 1) {
        console.log('[CSV Import] Row 1 values:', JSON.stringify(values));
        console.log('[CSV Import] Row 1 parsed:', JSON.stringify(item));
      }

      // Simple validation
      if (!item.name) continue;
      if (!item.category) item.category = "Principal";
      if (!item.unit) item.unit = "porção";
      if (!item.kitchenUnit) item.kitchenUnit = "kg";
      if (item.available === undefined) item.available = 100;
      if (item.limit === undefined) item.limit = 1;
      
      newItems.push(item);
    }

    if (newItems.length === 0) return c.json({ error: "Nenhum item válido encontrado no CSV. Verifique se o cabeçalho contém 'name'." }, 400);

    // Replace all items
    await kv.set("menu:items", newItems);
    
    // Also update categories dynamically
    const existingCats = ["Principal", "Guarnição", "Salada", "Sobremesa", "Bebida"];
    const newCats = [...new Set(newItems.map(i => i.category))];
    const updatedCats = Array.from(new Set([...existingCats, ...newCats]));
    await kv.set("categories", updatedCats);

    console.log('[CSV Import] Success!', newItems.length, 'items. Sample:', JSON.stringify(newItems[0]));
    return c.json({ success: true, count: newItems.length, categories: updatedCats, sampleItem: newItems[0] });
  } catch (e: any) {
    console.log("CSV Import error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- Banners ---
app.get("/make-server-c3078087/banners", async (c) => {
  try {
    const banners = await kv.get("banners") || [];
    const activeBanners = banners
      .filter((b: any) => b.active)
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    return c.json(activeBanners);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-c3078087/admin/banners", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const banners = await kv.get("banners") || [];
    return c.json(banners.sort((a: any, b: any) => (a.order || 0) - (b.order || 0)));
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-c3078087/admin/banners", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { id, imageUrl, link, active, order, title, description, backgroundColor, textColor, buttonText } = await c.req.json();
    let banners = await kv.get("banners") || [];
    
    if (id) {
      const idx = banners.findIndex((b: any) => b.id === id);
      if (idx >= 0) {
        banners[idx] = { ...banners[idx], imageUrl, link, active, order, title, description, backgroundColor, textColor, buttonText };
      } else {
        banners.push({ id, imageUrl, link, active, order: order || banners.length, title, description, backgroundColor, textColor, buttonText });
      }
    } else {
      banners.push({ 
        id: crypto.randomUUID(), 
        imageUrl, 
        link, 
        active: active !== undefined ? active : true, 
        order: order !== undefined ? order : banners.length,
        title,
        description,
        backgroundColor,
        textColor,
        buttonText
      });
    }
    
    await kv.set("banners", banners);
    await logAudit(c, auth, id ? "UPDATE_BANNER" : "CREATE_BANNER", "banners", `${id ? "Atualizou" : "Criou"} banner "${title || id || "sem titulo"}".`, { bannerId: id });
    return c.json({ success: true, banners });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-c3078087/admin/banners/:id", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const id = c.req.param('id');
    let banners = await kv.get("banners") || [];
    banners = banners.filter((b: any) => b.id !== id);
    await kv.set("banners", banners);
    await logAudit(c, auth, "DELETE_BANNER", "banners", `Excluiu banner "${id}".`, { bannerId: id });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Push Notifications ---

// Get VAPID public key (public, no auth required)
app.get("/make-server-c3078087/push/vapid-key", async (c) => {
  try {
    const keys = await push.getOrCreateVAPIDKeys();
    return c.json({ publicKey: keys.publicKey });
  } catch (e) {
    console.log("VAPID key error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Save push subscription (requires auth)
app.post("/make-server-c3078087/push/subscribe", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const { subscription } = await c.req.json();
    if (!subscription || !subscription.endpoint) {
      return c.json({ error: "Subscription inválida." }, 400);
    }
    await push.saveSubscription(auth.userId, subscription);
    return c.json({ success: true });
  } catch (e) {
    console.log("Push subscribe error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Unsubscribe from push (requires auth)
app.post("/make-server-c3078087/push/unsubscribe", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const { endpoint } = await c.req.json();
    if (!endpoint) {
      return c.json({ error: "Endpoint obrigatório." }, 400);
    }
    await push.removeSubscription(auth.userId, endpoint);
    return c.json({ success: true });
  } catch (e) {
    console.log("Push unsubscribe error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Send test push (admin only)
app.post("/make-server-c3078087/admin/push/test", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { userId, title, body } = await c.req.json();
    if (!userId) return c.json({ error: "userId obrigatório." }, 400);
    const result = await push.sendPushToUser(userId, {
      title: title || "SpaceFood - Teste",
      body: body || "Esta é uma notificação de teste!",
      icon: "/icon-192.png",
      tag: "test-" + Date.now(),
    });
    return c.json({ success: true, ...result });
  } catch (e) {
    console.log("Push test error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- Waste Management ---
app.get("/make-server-c3078087/admin/waste", async (c) => {
  const auth = await requireAdminOrKitchen(c);
  if (auth instanceof Response) return auth;
  try {
    const date = c.req.query('date');
    if (date) {
      const log = await kv.get(`waste:${date}`);
      return c.json(log ? [log] : []);
    }
    const logsMap = await kv.getByPrefix("waste:");
    const logs = logsMap.flat().filter(Boolean).sort((a: any, b: any) => b.date.localeCompare(a.date));
    return c.json(logs);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-c3078087/admin/waste", async (c) => {
  const auth = await requireAdminOrKitchen(c);
  if (auth instanceof Response) return auth;
  try {
    const data = await c.req.json();
    if (!data.date) return c.json({ error: "Data é obrigatória." }, 400);
    
    const log = {
      ...data,
      updatedBy: auth.userId,
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(`waste:${data.date}`, log);
    return c.json(log);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Audit Log Endpoints ---

// GET /admin/audit-logs – list audit logs with optional filters
app.get("/make-server-c3078087/admin/audit-logs", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const url = new URL(c.req.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const category = url.searchParams.get("category") || "";
    const userId = url.searchParams.get("userId") || "";
    const search = url.searchParams.get("search") || "";
    const limitParam = parseInt(url.searchParams.get("limit") || "200", 10);

    const rawLogs = await kv.getByPrefix("audit_log:");
    const logs: AuditLogEntry[] = rawLogs
      .map((raw: any) => {
        try { return typeof raw === "string" ? JSON.parse(raw) : raw; }
        catch { return null; }
      })
      .filter(Boolean);

    // Sort by timestamp descending (newest first)
    logs.sort((a: AuditLogEntry, b: AuditLogEntry) => b.timestamp.localeCompare(a.timestamp));

    // Apply filters
    let filtered = logs;
    if (from) {
      filtered = filtered.filter((l: AuditLogEntry) => l.timestamp.split("T")[0] >= from);
    }
    if (to) {
      filtered = filtered.filter((l: AuditLogEntry) => l.timestamp.split("T")[0] <= to);
    }
    if (category) {
      filtered = filtered.filter((l: AuditLogEntry) => l.category === category);
    }
    if (userId) {
      filtered = filtered.filter((l: AuditLogEntry) => l.userId === userId);
    }
    if (search) {
      const lower = search.toLowerCase();
      filtered = filtered.filter((l: AuditLogEntry) =>
        l.description.toLowerCase().includes(lower) ||
        l.userName.toLowerCase().includes(lower) ||
        l.action.toLowerCase().includes(lower)
      );
    }

    const total = filtered.length;
    filtered = filtered.slice(0, limitParam);

    return c.json({ logs: filtered, total });
  } catch (e: any) {
    console.log("Error fetching audit logs:", e.message);
    return c.json({ error: e.message }, 500);
  }
});

// DELETE /admin/audit-logs – clear all audit logs (master only)
app.delete("/make-server-c3078087/admin/audit-logs", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;
  if (auth.role !== "master") {
    return c.json({ error: "Apenas Admin Master pode limpar logs." }, 403);
  }
  try {
    const rawLogs = await kv.getByPrefix("audit_log:");
    // We need the keys, so re-fetch via prefix and delete
    // kv.getByPrefix returns values; we need to reconstruct keys from log IDs
    const logs = rawLogs.map((raw: any) => {
      try { return typeof raw === "string" ? JSON.parse(raw) : raw; }
      catch { return null; }
    }).filter(Boolean);

    const keys = logs.map((l: any) => `audit_log:${l.id}`);
    if (keys.length > 0) {
      await kv.mdel(keys);
    }

    await logAudit(c, auth, "CLEAR_LOGS", "system", `Limpou ${keys.length} registros de log de auditoria.`);
    return c.json({ deleted: keys.length });
  } catch (e: any) {
    console.log("Error clearing audit logs:", e.message);
    return c.json({ error: e.message }, 500);
  }
});

Deno.serve(app.fetch);