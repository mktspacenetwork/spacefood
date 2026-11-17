import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Plus, Search, Loader2, User, Check, ShieldCheck, Pencil, Users, ChevronDown, ChevronUp,
  LayoutDashboard, ClipboardList, ChefHat, ClipboardCheck, CalendarDays,
  UtensilsCrossed, MessageSquare, BarChart3, Image as ImageIcon, Bell,
  Settings, AlertTriangle, MapPin, Crown, KeyRound, Phone, ScrollText,
  ClipboardPlus, BookMarked, MoreHorizontal, Trash2, Megaphone, RotateCcw, Info, Trash2 as TrashIcon,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Switch } from "../../components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useForm } from "react-hook-form";
import { SkeletonTable, SkeletonRoleCards } from "../../components/ui/SkeletonCard";
import { useAuth } from "../../context/auth-context";
import { campaignsApi, errMsg as campaignErrMsg } from "../../lib/campaigns/api";
import { invalidateCampaignPerms, useCampaignPerms } from "./campaigns/useCampaignPerms";
import {
  CAMPAIGN_PERM_KEYS, CampaignAccessSection, campaignLevelOf, campaignLevelShort, campaignPermsFromKeys,
} from "../../components/campaigns/CampaignAccessSection";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AppUser {
  id: string;
  email: string;
  user_metadata: {
    name: string;
    role: string;
    department?: string;
    lunch_location?: string;
    dietary_restrictions?: string;
    age?: string;
    phone?: string;
  };
  created_at: string;
  last_sign_in_at?: string;
}

export interface PermRole {
  id: string;
  name: string;
  description: string;
  color: string;
  permissions: Record<string, boolean>;
  createdAt: string;
}

type Perms = Record<string, boolean>;

// ─── Consts ───────────────────────────────────────────────────────────────────
const PERM_GROUPS = [
  {
    group: "Operacional",
    items: [
      { key: "dashboard", label: "Visão Geral", icon: LayoutDashboard },
      { key: "orders", label: "Pedidos", icon: ClipboardList },
      { key: "kds", label: "Cozinha (KDS)", icon: ChefHat },
      { key: "checkin", label: "Check-in", icon: ClipboardCheck },
    ],
  },
  {
    group: "Gestão",
    items: [
      { key: "menu", label: "Cardápio", icon: CalendarDays },
      { key: "items", label: "Gestão de Pratos", icon: UtensilsCrossed },
      { key: "users", label: "Usuários", icon: Users },
      { key: "reviews", label: "Avaliações", icon: MessageSquare },
      { key: "recipe-suggestions", label: "Sugestões de Receita", icon: BookMarked },
    ],
  },
  {
    group: "Inteligência",
    items: [
      { key: "waste", label: "Desperdício", icon: Trash2 },
      { key: "reports", label: "Relatórios", icon: BarChart3 },
      { key: "checkin-report", label: "Relatório de Check-in", icon: ClipboardPlus },
    ],
  },
  {
    group: "Administrativo",
    items: [
      { key: "banners", label: "Banners", icon: ImageIcon },
      { key: "notifications", label: "Notificações", icon: Bell },
      { key: "settings", label: "Configurações", icon: Settings },
      { key: "roles_permissions", label: "Funções & Permissões", icon: ShieldCheck },
      { key: "logs", label: "Log de Auditoria", icon: ScrollText },
    ],
  },
];

const ALL_PERM_KEYS = PERM_GROUPS.flatMap(g => g.items.map(i => i.key));

/**
 * ESPELHO do padrão do backend (`resolveUserPermissions` em supabase/functions/server/index.tsx):
 * conta Cozinha sem perfil atribuído recebe só estas chaves; Admin recebe todas; Colaborador nenhuma.
 * Serve apenas para MOSTRAR o que vem "de graça" da conta; a decisão real continua sendo do servidor.
 * (Se o backend mudar essa lista, atualizar aqui — ou expor um endpoint de permissões resolvidas por pessoa.)
 */
const KITCHEN_BASELINE = ["dashboard", "orders", "kds", "checkin", "waste", "menu", "reviews", "checkin-report", "recipe-suggestions"];

const PRESET_COLORS = [
  "#ff4500", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

const SYSTEM_ROLE_LABELS: Record<string, { label: string; color: string; about: string }> = {
  master: {
    label: "Master",
    color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    about: "Acesso total e irrestrito ao painel.",
  },
  admin: {
    label: "Admin",
    color: "bg-primary/10 text-primary border-primary/20",
    about: "Conta de administrador: por padrão acessa todo o painel.",
  },
  kitchen: {
    label: "Cozinha",
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    about: "Conta de cozinha: por padrão acessa pedidos, KDS, check-in, cardápio e relatórios básicos.",
  },
  user: {
    label: "Colaborador",
    color: "bg-muted text-muted-foreground border-border",
    about: "Conta de colaborador: não entra no painel administrativo.",
  },
};

const SEEN_USERS_KEY = "spacefood:seen_user_ids";

function getSeenUserIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_USERS_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}
function markUserSeen(id: string) {
  const seen = getSeenUserIds();
  seen.add(id);
  localStorage.setItem(SEEN_USERS_KEY, JSON.stringify([...seen]));
}
function countEnabled(perms: Perms) {
  return ALL_PERM_KEYS.filter(k => perms[k] === true).length;
}

// ─── Regras de acesso (espelham o backend; só para exibir) ───────────────────
/** O que a pessoa recebe SEM ajustes individuais: Master = tudo; perfil atribuído = o que o perfil marca; senão, o padrão da conta. */
function baselineFor(systemRole: string, roleId: string | null, roles: PermRole[]): Perms {
  const out: Perms = {};
  if (systemRole === "master") { ALL_PERM_KEYS.forEach(k => { out[k] = true; }); return out; }
  if (roleId) {
    // Igual ao servidor: perfil atribuído mas inexistente => nada liberado.
    const role = roles.find(r => r.id === roleId);
    ALL_PERM_KEYS.forEach(k => { out[k] = role?.permissions?.[k] === true; });
    return out;
  }
  const granted = systemRole === "admin" ? ALL_PERM_KEYS : systemRole === "kitchen" ? KITCHEN_BASELINE : [];
  ALL_PERM_KEYS.forEach(k => { out[k] = granted.includes(k); });
  return out;
}

/** Só chaves conhecidas com boolean de verdade (mesmo filtro que o servidor aplica ao salvar). */
function cleanOverrides(raw: unknown): Perms {
  const out: Perms = {};
  if (raw && typeof raw === "object") {
    for (const k of ALL_PERM_KEYS) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

const effectivePerms = (base: Perms, overrides: Perms): Perms => ({ ...base, ...overrides });

function sameOverrides(a: Perms, b: Perms): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => k in b && a[k] === b[k]);
}
function sameCampaignPerms(a: Perms, b: Perms): boolean {
  return CAMPAIGN_PERM_KEYS.every(k => (a[k] === true) === (b[k] === true));
}

const roleStyle = (color: string) => ({ backgroundColor: color + "22", color, borderColor: color + "44" });

// ─── Hook: bolinha "Novo" ─────────────────────────────────────────────────────
function useSeenDot<T extends HTMLElement>(isNew: boolean, id: string, onSeen: (id: string) => void) {
  const ref = useRef<T>(null);
  const [showDot, setShowDot] = useState(isNew);
  useEffect(() => { setShowDot(isNew); }, [isNew]);
  useEffect(() => {
    if (!showDot || !ref.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { timer = setTimeout(() => { setShowDot(false); onSeen(id); }, 1500); }
      else { if (timer) { clearTimeout(timer); timer = null; } }
    }, { threshold: 0.5 });
    observer.observe(ref.current);
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [showDot, id, onSeen]);
  return { ref, showDot };
}

// ─── Main component ───────────────────────────────────────────────────────────
// `defaultTab` é mantido só por compatibilidade com as rotas: "permissions" abre direto o diálogo de perfis.
export function AdminUsers({ defaultTab = "users" }: { defaultTab?: "users" | "permissions" }) {
  const { user: me } = useAuth();
  const campaignPerms = useCampaignPerms();
  const canManageCampaignAccess = !campaignPerms.loading && campaignPerms.isAdmin && campaignPerms.perms.campaigns_access === true;

  // ── Pessoas ─────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AppUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileFilter, setProfileFilter] = useState("all");
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [newUserIds, setNewUserIds] = useState<Set<string>>(new Set());
  // Perfil escolhido ao CRIAR uma pessoa (na edição, o perfil muda no editor de acessos)
  const [newUserRoleId, setNewUserRoleId] = useState<string>("");
  const [userRoleMap, setUserRoleMap] = useState<Record<string, string | null>>({});
  // Ajustes individuais por pessoa (só buscados para contas que entram no painel)
  const [overridesMap, setOverridesMap] = useState<Record<string, Perms>>({});
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [editLunchLocation, setEditLunchLocation] = useState("");
  const [editDietaryRestrictions, setEditDietaryRestrictions] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCanOrderMeal, setEditCanOrderMeal] = useState(true);
  const [resettingPassword, setResettingPassword] = useState(false);

  const { register, handleSubmit, reset, unregister, formState: { errors } } = useForm();

  // ── Perfis (funções nomeadas) ───────────────────────────────────────────────
  const [roles, setRoles] = useState<PermRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  /** Perfis e atribuições (quem usa qual perfil) precisam carregar JUNTOS: editar com um dos dois faltando mostraria dados errados. */
  const [rolesStatus, setRolesStatus] = useState<"loading" | "ok" | "error">("loading");
  const [roleMapStatus, setRoleMapStatus] = useState<"loading" | "ok" | "error">("loading");
  const accessState: "loading" | "ok" | "denied" =
    rolesStatus === "error" || roleMapStatus === "error" ? "denied"
    : rolesStatus === "ok" && roleMapStatus === "ok" ? "ok"
    : "loading";
  const [rolesDialogOpen, setRolesDialogOpen] = useState(defaultTab === "permissions");
  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<PermRole | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<PermRole | null>(null);
  const [deletingRole, setDeletingRole] = useState(false);
  const [roleSearchQuery, setRoleSearchQuery] = useState("");

  // ── Acessos às Campanhas (lista própria do módulo) ──────────────────────────
  const [campaignAccess, setCampaignAccess] = useState<Record<string, Perms> | null>(null);

  // ── Editor de acessos de uma pessoa ─────────────────────────────────────────
  const [sheetUser, setSheetUser] = useState<AppUser | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchUsers(); fetchRoles(); fetchUserRoleMap();
    api.get("/admin/settings").then((settings) => {
      const raw = settings?.units;
      if (Array.isArray(raw) && raw.length > 0) {
        setAvailableUnits(raw.map((u: any) => typeof u === "string" ? u : u.name));
      } else {
        setAvailableUnits(["Sede Damasceno", "Sede Taipas", "Externo (Marmita)"]);
      }
    }).catch(() => {
      setAvailableUnits(["Sede Damasceno", "Sede Taipas", "Externo (Marmita)"]);
    });
  }, []);

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const data = await api.authGet("/admin/users");
      if (Array.isArray(data)) {
        setUsers(data);
        const seen = getSeenUserIds();
        const unseen = new Set<string>();
        for (const u of data) { if (!seen.has(u.id)) unseen.add(u.id); }
        setNewUserIds(unseen);
      }
    } catch (e) {
      toast.error("Erro ao carregar usuários.");
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      setRolesLoading(true);
      const data = await api.authGet("/admin/roles");
      if (!Array.isArray(data)) throw new Error("Resposta inesperada ao carregar perfis.");
      setRoles(data);
      setRolesStatus("ok");
    } catch (e) {
      console.error("Fetch roles error:", e);
      setRolesStatus("error");
    } finally {
      setRolesLoading(false);
    }
  };

  const fetchUserRoleMap = async () => {
    try {
      const data = await api.authGet("/admin/user-roles");
      if (!Array.isArray(data)) throw new Error("Resposta inesperada ao carregar atribuições.");
      const map: Record<string, string | null> = {};
      for (const entry of data) { map[entry.userId] = entry.customRoleId || null; }
      setUserRoleMap(map);
      setRoleMapStatus("ok");
    } catch (e) {
      console.error("Fetch user-role map error:", e);
      setRoleMapStatus("error");
    }
  };

  // Acessos às Campanhas de todas as pessoas (só para quem gerencia esses acessos)
  useEffect(() => {
    if (!canManageCampaignAccess) { setCampaignAccess(null); return; }
    let alive = true;
    campaignsApi.get<{ items: { user_id: string; permissions: Perms }[] }>("/admin/access")
      .then((r) => {
        if (!alive) return;
        const map: Record<string, Perms> = {};
        for (const row of r.items ?? []) {
          map[row.user_id] = campaignPermsFromKeys(CAMPAIGN_PERM_KEYS.filter(k => row.permissions?.[k] === true));
        }
        setCampaignAccess(map);
      })
      .catch(() => { if (alive) setCampaignAccess(null); });
    return () => { alive = false; };
  }, [canManageCampaignAccess]);

  // Ajustes individuais: só para contas que entram no painel (Admin/Cozinha/Master) ou que têm perfil.
  // Colaboradores comuns não entram no painel, então não vale a pena (nem é barato) buscar um a um.
  // Não cancelamos a busca quando a lista muda (isso deixaria gente sem dados): ela termina e só descarta
  // o resultado se a página já foi fechada. Quem falhar sai da fila e é tentado de novo na próxima mudança.
  const fetchedOverridesRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => {
    if (accessState !== "ok" || users.length === 0) return;
    const todo = users.filter(u => {
      const sys = u.user_metadata?.role || "user";
      return (sys !== "user" || !!userRoleMap[u.id]) && !fetchedOverridesRef.current.has(u.id);
    });
    if (todo.length === 0) return;
    todo.forEach(u => fetchedOverridesRef.current.add(u.id));
    (async () => {
      for (let i = 0; i < todo.length; i += 5) {
        const batch = todo.slice(i, i + 5);
        const results = await Promise.allSettled(batch.map(u => api.authGet(`/admin/user-permissions/${u.id}`)));
        if (!mountedRef.current) return;
        results.forEach((r, idx) => { if (r.status === "rejected") fetchedOverridesRef.current.delete(batch[idx].id); });
        setOverridesMap(prev => {
          const next = { ...prev };
          results.forEach((r, idx) => { if (r.status === "fulfilled") next[batch[idx].id] = cleanOverrides(r.value); });
          return next;
        });
      }
    })();
  }, [accessState, users, userRoleMap]);

  // Formulário de dados da pessoa (criar/editar)
  useEffect(() => {
    if (!isUserModalOpen) return;
    if (editingUser) {
      unregister("password");
      reset({
        name: editingUser.user_metadata.name,
        email: editingUser.email,
        role: editingUser.user_metadata.role || "user",
        department: editingUser.user_metadata.department || "",
      });
      setEditLunchLocation(editingUser.user_metadata.lunch_location || "");
      setEditDietaryRestrictions(editingUser.user_metadata.dietary_restrictions || "");
      setEditAge(editingUser.user_metadata.age || "");
      setEditPhone(editingUser.user_metadata.phone || "");
      setEditCanOrderMeal((editingUser.user_metadata as any).can_order_meal !== false);
    } else {
      reset({ name: "", email: "", password: "", role: "user", department: "" });
      setNewUserRoleId("");
      setEditLunchLocation("");
      setEditDietaryRestrictions("");
      setEditAge("");
      setEditPhone("");
      setEditCanOrderMeal(true);
    }
  }, [editingUser, isUserModalOpen, reset, unregister]);

  const handleResetPassword = async () => {
    const target = resetTarget;
    if (!target) return;
    setResetTarget(null);
    setResettingPassword(true);
    try {
      const result = await api.authPost(`/admin/users/${target.id}/reset-password`, {});
      toast.success(result.message || "Email de redefinição enviado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar email de redefinição.");
    } finally {
      setResettingPassword(false);
    }
  };

  const onUserSubmit = async (data: any) => {
    setSaving(true);
    try {
      // `role` (tipo da conta) é reenviado como está: o servidor o grava a cada PUT.
      const payload: any = { name: data.name, role: data.role, department: data.department || "" };
      if (editingUser) {
        payload.lunchLocation = editLunchLocation;
        payload.dietaryRestrictions = editDietaryRestrictions;
        payload.age = editAge;
        payload.phone = editPhone;
        payload.canOrderMeal = editCanOrderMeal;
        const updated = await api.authPut(`/admin/users/${editingUser.id}`, payload);
        setUsers(users.map(u => u.id === editingUser.id
          ? { ...u, user_metadata: { ...u.user_metadata, ...updated.user_metadata } }
          : u
        ));
        toast.success("Usuário atualizado!");
      } else {
        const newUser = await api.authPost("/admin/users", { ...payload, email: data.email, password: data.password });
        if (newUserRoleId && newUser?.id) {
          await api.authPut(`/admin/user-roles/${newUser.id}`, { roleId: newUserRoleId });
          setUserRoleMap(prev => ({ ...prev, [newUser.id]: newUserRoleId }));
        }
        setUsers([newUser, ...users]);
        toast.success("Usuário criado!");
      }
      setIsUserModalOpen(false);
      setEditingUser(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar usuário");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await api.authDel(`/admin/users/${deleteTarget}`);
      setUsers(users.filter(u => u.id !== deleteTarget));
      toast.success("Usuário removido.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleMarkSeen = useCallback((userId: string) => {
    markUserSeen(userId);
    setNewUserIds(prev => { const n = new Set(prev); n.delete(userId); return n; });
  }, []);

  // Excluir perfil: o servidor só remove o perfil da lista — as atribuições ficariam apontando para um perfil
  // que não existe e a pessoa perderia TODOS os acessos (o servidor trata "perfil sumido" como "nada liberado").
  // Por isso, antes de excluir, devolvemos quem usa esse perfil ao padrão da conta (o que o aviso sempre prometeu).
  const roleAssignedUserIds = (roleId: string) =>
    Object.entries(userRoleMap).filter(([, id]) => id === roleId).map(([uid]) => uid);

  const handleDeleteRole = async () => {
    const target = deleteRoleTarget;
    if (!target) return;
    if (roleMapStatus !== "ok") {
      toast.error("Não foi possível verificar quem usa este perfil. Recarregue a página antes de excluir.");
      setDeleteRoleTarget(null);
      return;
    }
    setDeletingRole(true);
    try {
      const affected = roleAssignedUserIds(target.id);
      for (const uid of affected) {
        await api.authPut(`/admin/user-roles/${uid}`, { roleId: null });
      }
      if (affected.length > 0) {
        setUserRoleMap(prev => {
          const next = { ...prev };
          affected.forEach(uid => { next[uid] = null; });
          return next;
        });
      }
      await api.authDel(`/admin/roles/${target.id}`);
      setRoles(prev => prev.filter(r => r.id !== target.id));
      toast.success("Perfil removido.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir perfil. Nada foi apagado se alguma etapa falhou.");
    } finally {
      setDeletingRole(false);
      setDeleteRoleTarget(null);
    }
  };

  // ── Lista filtrada ──────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return users.filter(u => {
      const matchesText =
        u.user_metadata?.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.user_metadata?.lunch_location?.toLowerCase().includes(q) ||
        u.user_metadata?.department?.toLowerCase().includes(q);
      if (!matchesText) return false;
      if (profileFilter === "all") return true;
      const sys = u.user_metadata?.role || "user";
      if (profileFilter.startsWith("sys:")) return sys === profileFilter.slice(4);
      if (profileFilter.startsWith("role:")) return userRoleMap[u.id] === profileFilter.slice(5);
      return true;
    });
  }, [users, searchQuery, profileFilter, userRoleMap]);

  // Resumo de acessos de uma pessoa, para a lista
  const accessSummary = (u: AppUser): { text: string; custom: boolean } => {
    const sys = u.user_metadata?.role || "user";
    const roleId = userRoleMap[u.id] || null;
    if (sys === "user" && !roleId) return { text: "Sem acesso ao painel", custom: false };
    const base = baselineFor(sys, roleId, roles);
    const ov = overridesMap[u.id];
    const eff = ov ? effectivePerms(base, ov) : base;
    return {
      text: `${countEnabled(eff)} de ${ALL_PERM_KEYS.length} acessos`,
      custom: !!ov && Object.keys(ov).length > 0,
    };
  };

  const campaignBadge = (u: AppUser): string | null => {
    if (!campaignAccess) return null;
    const perms = campaignAccess[u.id];
    if (!perms) return null;
    const level = campaignLevelOf(perms);
    return level === "none" ? null : campaignLevelShort(level);
  };

  const canEditAccess = accessState === "ok";

  const openEdit = (u: AppUser) => { setEditingUser(u); setIsUserModalOpen(true); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Usuários & Permissões</h1>
        <p className="text-muted-foreground text-xs">Pessoas, perfis e acessos — tudo em um só lugar.</p>
      </div>

      {/* Barra de ações */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-sm lg:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <input
            type="text" placeholder="Buscar por nome, email, unidade ou depto..."
            aria-label="Buscar pessoa"
            className="w-full pl-9 pr-4 py-2 h-10 rounded-lg border border-input text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <select
            aria-label="Filtrar por perfil"
            className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm lg:w-52 lg:flex-none"
            value={profileFilter}
            onChange={e => setProfileFilter(e.target.value)}
          >
            <option value="all">Todos os perfis</option>
            <optgroup label="Tipo de conta">
              <option value="sys:master">Master</option>
              <option value="sys:admin">Admin</option>
              <option value="sys:kitchen">Cozinha</option>
              <option value="sys:user">Colaborador</option>
            </optgroup>
            {roles.length > 0 && (
              <optgroup label="Perfis de acesso">
                {roles.map(r => <option key={r.id} value={`role:${r.id}`}>{r.name}</option>)}
              </optgroup>
            )}
          </select>
          {canEditAccess && (
            <Button variant="outline" className="h-10 shrink-0 gap-2" onClick={() => setRolesDialogOpen(true)}>
              <ShieldCheck size={15} /> <span className="hidden sm:inline">Gerenciar perfis</span><span className="sm:hidden">Perfis</span>
            </Button>
          )}
          <Button onClick={() => { setEditingUser(null); setIsUserModalOpen(true); }} className="h-10 shrink-0 gap-2">
            <Plus size={16} /> <span className="hidden sm:inline">Novo Usuário</span><span className="sm:hidden">Novo</span>
          </Button>
        </div>
      </div>

      {accessState === "denied" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            Você pode ver as pessoas, mas não tem permissão para alterar perfis e acessos (ou não foi possível carregá-los).{" "}
            <button type="button" className="font-semibold underline" onClick={() => { setRolesStatus("loading"); setRoleMapStatus("loading"); fetchRoles(); fetchUserRoleMap(); }}>Tentar de novo</button>
          </span>
        </div>
      )}

      {/* Lista única de pessoas */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        {usersLoading ? (
          <SkeletonTable />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-accent text-muted-foreground uppercase font-medium text-xs">
                  <tr>
                    <th className="px-5 py-3">Pessoa</th>
                    <th className="px-5 py-3">Perfil</th>
                    <th className="px-5 py-3">Acessos</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map(u => (
                    <PersonRow
                      key={u.id}
                      user={u}
                      isNew={newUserIds.has(u.id)}
                      onSeen={handleMarkSeen}
                      roles={roles}
                      roleId={userRoleMap[u.id] || null}
                      summary={accessSummary(u)}
                      campaignText={campaignBadge(u)}
                      canEditAccess={canEditAccess}
                      busyReset={resettingPassword}
                      onAccess={setSheetUser}
                      onEdit={openEdit}
                      onReset={setResetTarget}
                      onDelete={id => setDeleteTarget(id)}
                    />
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">Nenhum usuário encontrado.</div>
              )}
            </div>

            <div className="md:hidden divide-y divide-border">
              {filteredUsers.map(u => (
                <PersonCard
                  key={u.id}
                  user={u}
                  isNew={newUserIds.has(u.id)}
                  onSeen={handleMarkSeen}
                  roles={roles}
                  roleId={userRoleMap[u.id] || null}
                  summary={accessSummary(u)}
                  campaignText={campaignBadge(u)}
                  canEditAccess={canEditAccess}
                  busyReset={resettingPassword}
                  onAccess={setSheetUser}
                  onEdit={openEdit}
                  onReset={setResetTarget}
                  onDelete={id => setDeleteTarget(id)}
                />
              ))}
              {filteredUsers.length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">Nenhum usuário encontrado.</div>
              )}
            </div>
          </>
        )}
      </div>
      {!usersLoading && (
        <p className="text-[11px] text-muted-foreground">
          {filteredUsers.length} {filteredUsers.length === 1 ? "pessoa" : "pessoas"}
        </p>
      )}

      {/* ── Editor único de acessos de uma pessoa ───────────────────────────── */}
      <PersonAccessSheet
        person={sheetUser}
        roles={roles}
        initialRoleId={sheetUser ? userRoleMap[sheetUser.id] || null : null}
        campaignEnabled={canManageCampaignAccess && campaignAccess !== null}
        initialCampaignPerms={sheetUser && campaignAccess ? campaignAccess[sheetUser.id] ?? null : null}
        currentUserId={me?.id}
        onClose={() => setSheetUser(null)}
        onSaved={r => {
          const { userId, roleId, overrides, campaignPerms } = r;
          if (roleId !== undefined) setUserRoleMap(prev => ({ ...prev, [userId]: roleId }));
          if (overrides !== undefined) setOverridesMap(prev => ({ ...prev, [userId]: overrides }));
          if (campaignPerms !== undefined) {
            setCampaignAccess(prev => {
              const next = { ...(prev ?? {}) };
              if (campaignPerms === null) delete next[userId];
              else next[userId] = campaignPerms;
              return next;
            });
          }
        }}
      />

      {/* ── Dados da pessoa (criar/editar) ──────────────────────────────────── */}
      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>{editingUser ? "Editar dados" : "Novo Usuário"}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Dados do cadastro. Perfil e acessos ficam em “Acessos”."
                : "Preencha os dados do novo usuário."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onUserSubmit)} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome Completo *</Label>
                <Input {...register("name", { required: true })} placeholder="Ex: João Silva" />
                {errors.name && <span className="text-xs text-destructive">Obrigatório</span>}
              </div>
              <div className="space-y-1.5">
                <Label>Email {!editingUser && "*"}</Label>
                <Input {...register("email", { required: !editingUser })} type="email" placeholder="usuario@exemplo.com" disabled={!!editingUser} />
                {errors.email && <span className="text-xs text-destructive">Obrigatório</span>}
              </div>
            </div>

            {!editingUser && (
              <div className="space-y-1.5">
                <Label>Senha Provisória *</Label>
                <Input {...register("password", { required: !editingUser, minLength: 6 })} type="password" placeholder="Mínimo 6 caracteres" />
                {errors.password && <span className="text-xs text-destructive">Mínimo 6 caracteres</span>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Departamento</Label>
              <Input {...register("department")} placeholder="Ex: Financeiro" />
            </div>

            {/* Perfil só na criação; depois, fica no editor de acessos (um lugar só) */}
            {!editingUser && canEditAccess && roles.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-primary" /> Perfil de acesso
                </Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={newUserRoleId}
                  onChange={e => setNewUserRoleId(e.target.value)}
                >
                  <option value="">Padrão da conta</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-primary" /> Unidade (Almoço)
                </Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={editLunchLocation}
                  onChange={e => setEditLunchLocation(e.target.value)}
                >
                  <option value="">-- Selecione --</option>
                  {availableUnits.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Idade</Label>
                <Input
                  type="number" min="14" max="100"
                  value={editAge}
                  onChange={e => setEditAge(e.target.value)}
                  placeholder="Ex: 30"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Phone size={13} className="text-muted-foreground" /> Telefone
              </Label>
              <Input
                type="tel"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-500" /> Restrições Alimentares
              </Label>
              <Input
                value={editDietaryRestrictions}
                onChange={e => setEditDietaryRestrictions(e.target.value)}
                placeholder="Ex: Intolerância a Lactose, Sem Glúten..."
              />
            </div>

            {editingUser && (
              <div className={cn(
                "flex items-center justify-between p-3 rounded-lg border transition-colors",
                editCanOrderMeal
                  ? "border-green-200 dark:border-green-800 bg-green-50/40 dark:bg-green-900/10"
                  : "border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10"
              )}>
                <div className="flex items-center gap-2.5">
                  <UtensilsCrossed size={15} className={editCanOrderMeal ? "text-green-600 dark:text-green-400" : "text-red-500"} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Permissão para pedir marmita</p>
                    <p className="text-[11px] text-muted-foreground">
                      {editCanOrderMeal ? "Usuário pode fazer pedidos normalmente." : "Usuário bloqueado de fazer pedidos."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Permissão para pedir marmita"
                  onClick={() => setEditCanOrderMeal(v => !v)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-300",
                    editCanOrderMeal ? "bg-green-500 dark:bg-green-600" : "bg-red-400 dark:bg-red-500"
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300",
                    editCanOrderMeal ? "translate-x-6" : "translate-x-1"
                  )} />
                </button>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsUserModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin mr-2" />}
                {editingUser ? "Salvar Alterações" : "Criar Usuário"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Gerenciar perfis (dentro desta mesma página) ────────────────────── */}
      <Dialog open={rolesDialogOpen} onOpenChange={setRolesDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2"><ShieldCheck size={18} className="text-primary" /> Perfis de acesso</DialogTitle>
            <DialogDescription>
              Conjuntos de acessos prontos para dar a várias pessoas de uma vez. Para ajustar uma pessoa só, use “Acessos” na lista.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 justify-between">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <input
                  type="text" placeholder="Buscar perfil..."
                  className="w-full pl-9 pr-4 py-2 h-10 rounded-lg border border-input text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background"
                  value={roleSearchQuery} onChange={e => setRoleSearchQuery(e.target.value)}
                />
              </div>
              <Button onClick={() => { setEditingRole(null); setRoleFormOpen(true); }} className="gap-2 shrink-0 h-10">
                <Plus size={16} /> Novo perfil
              </Button>
            </div>

            {rolesLoading ? (
              <SkeletonRoleCards />
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {roles
                  .filter(r => !roleSearchQuery || r.name.toLowerCase().includes(roleSearchQuery.toLowerCase()))
                  .map(role => (
                    <RoleCard
                      key={role.id}
                      role={role}
                      usersWithRole={roleAssignedUserIds(role.id).length}
                      onEdit={r => { setEditingRole(r); setRoleFormOpen(true); }}
                      onDelete={r => setDeleteRoleTarget(r)}
                    />
                  ))}
                {roles.length === 0 && (
                  <div className="col-span-full text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                    <ShieldCheck className="mx-auto h-10 w-10 opacity-20 mb-3" />
                    <p className="text-sm">Nenhum perfil criado ainda.</p>
                    <p className="text-xs mt-1">Sem perfil, cada conta usa o padrão do seu tipo (Admin, Cozinha ou Colaborador).</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <RoleFormModal
        open={roleFormOpen}
        onClose={() => setRoleFormOpen(false)}
        role={editingRole}
        onSaved={saved => {
          if (editingRole) {
            setRoles(roles.map(r => r.id === saved.id ? saved : r));
          } else {
            setRoles([saved, ...roles]);
          }
        }}
      />

      {/* ── Confirmações ────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Excluir Usuário?"
        description="Esta ação removerá o acesso deste usuário permanentemente."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDeleteUser}
      />
      <ConfirmDialog
        open={!!resetTarget}
        onOpenChange={o => !o && setResetTarget(null)}
        title="Redefinir senha?"
        description={`Enviaremos um email de redefinição para ${resetTarget?.email ?? ""}. A pessoa poderá criar uma nova senha pelo link recebido.`}
        confirmLabel="Enviar email"
        onConfirm={handleResetPassword}
      />
      <ConfirmDialog
        open={!!deleteRoleTarget && !deletingRole}
        onOpenChange={o => !o && setDeleteRoleTarget(null)}
        title="Excluir perfil?"
        description={(() => {
          const n = deleteRoleTarget ? roleAssignedUserIds(deleteRoleTarget.id).length : 0;
          const who = n === 0
            ? "Ninguém usa este perfil."
            : `${n} ${n === 1 ? "pessoa volta" : "pessoas voltam"} ao acesso padrão da conta.`;
          return `O perfil “${deleteRoleTarget?.name ?? ""}” será removido. ${who}`;
        })()}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDeleteRole}
      />
    </div>
  );
}

// ─── Peças da lista ───────────────────────────────────────────────────────────
type PersonItemProps = {
  user: AppUser;
  isNew: boolean;
  onSeen: (id: string) => void;
  roles: PermRole[];
  roleId: string | null;
  summary: { text: string; custom: boolean };
  campaignText: string | null;
  canEditAccess: boolean;
  busyReset: boolean;
  onAccess: (u: AppUser) => void;
  onEdit: (u: AppUser) => void;
  onReset: (u: AppUser) => void;
  onDelete: (id: string) => void;
};

function SystemRoleBadge({ role }: { role: string }) {
  const meta = SYSTEM_ROLE_LABELS[role] ?? SYSTEM_ROLE_LABELS.user;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border", meta.color)}>
      {role === "master" && <Crown size={9} className="fill-current" />} {meta.label}
    </span>
  );
}

function RoleChip({ role }: { role?: PermRole }) {
  if (!role) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border" style={roleStyle(role.color)}>
      <ShieldCheck size={10} /> {role.name}
    </span>
  );
}

function PersonMenu({ user, canEditAccess, busyReset, onEdit, onReset, onDelete, onAccess }: Pick<PersonItemProps, "user" | "canEditAccess" | "busyReset" | "onEdit" | "onReset" | "onDelete" | "onAccess">) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label={`Mais ações de ${user.user_metadata?.name || user.email}`}>
          <MoreHorizontal size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {canEditAccess && (
          <DropdownMenuItem onSelect={() => onAccess(user)} className="cursor-pointer gap-2">
            <ShieldCheck size={14} /> Acessos
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onEdit(user)} className="cursor-pointer gap-2">
          <Pencil size={14} /> Editar dados
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onReset(user)} disabled={busyReset} className="cursor-pointer gap-2">
          <KeyRound size={14} /> Redefinir senha
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onDelete(user.id)} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
          <TrashIcon size={14} /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PersonIdentity({ user, showDot, compact }: { user: AppUser; showDot: boolean; compact?: boolean }) {
  const meta = user.user_metadata;
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="relative shrink-0">
        <div className={cn("rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold", compact ? "h-10 w-10" : "h-9 w-9 text-sm")}>
          {meta?.name?.charAt(0).toUpperCase() || <User size={16} />}
        </div>
        {showDot && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-500 border-2 border-card" />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground truncate">{meta?.name || "Sem Nome"}</span>
          {showDot && <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full">Novo</span>}
        </div>
        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
        {(meta?.lunch_location || meta?.department) && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 truncate">
            <MapPin size={10} className="text-primary shrink-0" />
            <span className="truncate">{[meta?.lunch_location, meta?.department].filter(Boolean).join(" · ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AccessSummary({ summary, campaignText }: { summary: { text: string; custom: boolean }; campaignText: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-foreground">
        {summary.text}
        {summary.custom && <span className="ml-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">· personalizado</span>}
      </p>
      {campaignText && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Megaphone size={10} className="text-primary shrink-0" /> Campanhas: {campaignText}
        </p>
      )}
    </div>
  );
}

function PersonRow(p: PersonItemProps) {
  const { ref, showDot } = useSeenDot<HTMLTableRowElement>(p.isNew, p.user.id, p.onSeen);
  const sys = p.user.user_metadata?.role || "user";
  return (
    <tr ref={ref} className="hover:bg-accent/40 transition-colors">
      <td className="px-5 py-3"><PersonIdentity user={p.user} showDot={showDot} /></td>
      <td className="px-5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <SystemRoleBadge role={sys} />
          <RoleChip role={p.roles.find(r => r.id === p.roleId)} />
        </div>
      </td>
      <td className="px-5 py-3"><AccessSummary summary={p.summary} campaignText={p.campaignText} /></td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {p.canEditAccess && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => p.onAccess(p.user)}>
              <ShieldCheck size={13} /> Acessos
            </Button>
          )}
          <PersonMenu {...p} />
        </div>
      </td>
    </tr>
  );
}

function PersonCard(p: PersonItemProps) {
  const { ref, showDot } = useSeenDot<HTMLDivElement>(p.isNew, p.user.id, p.onSeen);
  const sys = p.user.user_metadata?.role || "user";
  return (
    <div ref={ref} className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <PersonIdentity user={p.user} showDot={showDot} compact />
        <PersonMenu {...p} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SystemRoleBadge role={sys} />
        <RoleChip role={p.roles.find(r => r.id === p.roleId)} />
      </div>
      <AccessSummary summary={p.summary} campaignText={p.campaignText} />
      {p.canEditAccess && (
        <Button variant="outline" className="h-11 w-full gap-2" onClick={() => p.onAccess(p.user)}>
          <ShieldCheck size={15} /> Acessos
        </Button>
      )}
    </div>
  );
}

// ─── Editor único de acessos (perfil + acessos + Campanhas) ───────────────────
type SavedResult = { userId: string; roleId?: string | null; overrides?: Perms; campaignPerms?: Perms | null };

function PersonAccessSheet({ person, roles, initialRoleId, campaignEnabled, initialCampaignPerms, currentUserId, onClose, onSaved }: {
  person: AppUser | null;
  roles: PermRole[];
  initialRoleId: string | null;
  campaignEnabled: boolean;
  initialCampaignPerms: Perms | null;
  currentUserId?: string;
  onClose: () => void;
  onSaved: (r: SavedResult) => void;
}) {
  const open = !!person;
  const sys = person?.user_metadata?.role || "user";
  const isMaster = sys === "master";
  const personId = person?.id ?? "";
  const personName = person?.user_metadata?.name || person?.email || "";
  const isSelf = !!person && person.id === currentUserId;

  const [roleId, setRoleId] = useState("");
  const [overrides, setOverrides] = useState<Perms>({});
  const [campPerms, setCampPerms] = useState<Perms>(campaignPermsFromKeys([]));
  // O que está salvo no servidor (atualizado a cada etapa concluída, para uma nova tentativa não repetir etapas)
  const [orig, setOrig] = useState<{ roleId: string; overrides: Perms; camp: Perms }>({ roleId: "", overrides: {}, camp: campaignPermsFromKeys([]) });
  const [loadingOverrides, setLoadingOverrides] = useState(false);
  const [overridesError, setOverridesError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [riskText, setRiskText] = useState<string | null>(null);

  const loadOverrides = useCallback((id: string) => {
    setLoadingOverrides(true);
    setOverridesError(false);
    return api.authGet(`/admin/user-permissions/${id}`)
      .then(data => {
        const clean = cleanOverrides(data);
        setOverrides(clean);
        setOrig(o => ({ ...o, overrides: clean }));
      })
      .catch(() => setOverridesError(true))
      .finally(() => setLoadingOverrides(false));
  }, []);

  // Ao abrir para uma pessoa: carrega os ajustes individuais fresquinhos do servidor
  useEffect(() => {
    if (!person) return;
    const emptyCamp = campaignPermsFromKeys([]);
    setRoleId(initialRoleId || "");
    setCampPerms(emptyCamp);
    setOverrides({});
    setOrig({ roleId: initialRoleId || "", overrides: {}, camp: emptyCamp });
    setRiskText(null);
    if (person.user_metadata?.role !== "master") loadOverrides(person.id);
    else { setLoadingOverrides(false); setOverridesError(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id]);

  // Acesso a Campanhas: só entra no estado quando os dados do módulo já chegaram (a seção fica oculta até lá),
  // para nunca mostrar "Sem acesso" por engano e um Salvar sobrescrever o acesso real.
  useEffect(() => {
    if (!person || !campaignEnabled) return;
    const camp = campaignPermsFromKeys(CAMPAIGN_PERM_KEYS.filter(k => initialCampaignPerms?.[k] === true));
    setCampPerms(camp);
    setOrig(o => ({ ...o, camp }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id, campaignEnabled]);

  const selectedRole = roles.find(r => r.id === roleId) || null;
  const baseline = useMemo(() => baselineFor(sys, roleId || null, roles), [sys, roleId, roles]);
  const effective = effectivePerms(baseline, overrides);
  const origEffective = effectivePerms(baselineFor(sys, orig.roleId || null, roles), orig.overrides);

  const siteReady = !isMaster && !loadingOverrides && !overridesError;
  const siteDirty = siteReady && (roleId !== orig.roleId || !sameOverrides(overrides, orig.overrides));
  const campDirty = campaignEnabled && !sameCampaignPerms(campPerms, orig.camp);
  const dirty = siteDirty || campDirty;
  const customCount = ALL_PERM_KEYS.filter(k => overrides[k] !== undefined && overrides[k] !== baseline[k]).length;

  const toggle = (key: string, value: boolean) => {
    setOverrides(prev => {
      const next = { ...prev };
      // Com perfil atribuído o "padrão" é exato (vem dos dados do perfil): voltar ao padrão remove o ajuste.
      // Sem perfil, o padrão é o espelho do backend: gravamos o valor explícito para não depender dele.
      if (selectedRole && value === baseline[key]) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  // Etapas gravadas em sequência; cada uma só roda se mudou. Se uma falhar, as anteriores ficam registradas.
  const doSave = async () => {
    if (!person) return;
    setSaving(true);
    const done: SavedResult = { userId: person.id };
    const cur = { ...orig };
    try {
      if (siteReady) {
        if (roleId !== cur.roleId) {
          await api.authPut(`/admin/user-roles/${person.id}`, { roleId: roleId || null });
          cur.roleId = roleId; done.roleId = roleId || null;
          setOrig(o => ({ ...o, roleId }));
        }
        if (!sameOverrides(overrides, cur.overrides)) {
          // Servidor guarda só chaves conhecidas com boolean real; "sem ajuste" = chave ausente (herda do perfil).
          const clean = cleanOverrides(overrides);
          await api.authPut(`/admin/user-permissions/${person.id}`, clean);
          cur.overrides = clean; done.overrides = clean;
          setOrig(o => ({ ...o, overrides: clean }));
        }
      }
      if (campaignEnabled && !sameCampaignPerms(campPerms, cur.camp)) {
        // Sempre as 17 chaves explícitas (true/false). Sem nenhuma ligada => remove a pessoa da lista do módulo.
        const finalPerms = campaignPermsFromKeys(CAMPAIGN_PERM_KEYS.filter(k => campPerms[k] === true));
        const any = CAMPAIGN_PERM_KEYS.some(k => finalPerms[k]);
        if (!any) {
          await campaignsApi.del(`/admin/access/${person.id}`);
          done.campaignPerms = null;
        } else {
          await campaignsApi.put(`/admin/access/${person.id}`, { name: personName, permissions: finalPerms });
          done.campaignPerms = finalPerms;
        }
        cur.camp = finalPerms;
        setOrig(o => ({ ...o, camp: finalPerms }));
        if (person.id === currentUserId) invalidateCampaignPerms();
      }
      onSaved(done);
      toast.success(`Acessos de ${personName} atualizados!`);
      onClose();
    } catch (e: any) {
      // Mostra o motivo do servidor (ex.: "É preciso manter pelo menos uma pessoa com gestão de acessos.")
      const message = e && e.name === "CampaignApiError" ? campaignErrMsg(e) : (e?.message || "Erro ao salvar.");
      if (Object.keys(done).length > 1) onSaved(done);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Antes de salvar: avisa se a própria pessoa logada está tirando um acesso que usa agora
  const handleSave = () => {
    if (!person) return;
    const risks: string[] = [];
    if (isSelf && siteReady) {
      const after = effective;
      if (origEffective.roles_permissions && !after.roles_permissions) risks.push("a tela de Usuários & Permissões (você não conseguirá desfazer isso sozinho)");
      else if (origEffective.users && !after.users) risks.push("a lista de Usuários");
    }
    if (isSelf && campaignEnabled && campDirty) {
      if (orig.camp.campaigns_access && !campPerms.campaigns_access) risks.push("a gestão de acessos de Campanhas");
      else if (orig.camp.campaigns && !campPerms.campaigns) risks.push("o módulo de Campanhas");
    }
    if (risks.length > 0) { setRiskText(`Você está tirando de você mesmo(a) o acesso a: ${risks.join("; ")}. Continuar?`); return; }
    doSave();
  };

  const roleAbout = selectedRole
    ? (selectedRole.description || `${countEnabled(selectedRole.permissions)} de ${ALL_PERM_KEYS.length} acessos`)
    : (SYSTEM_ROLE_LABELS[sys]?.about ?? "");

  return (
    <>
      <Sheet open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-xl" aria-describedby={undefined}>
          {person && (
            <>
              <SheetHeader className="border-b px-5 pb-4 pt-5 pr-12">
                <SheetTitle className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {person.user_metadata?.name?.charAt(0).toUpperCase() || <User size={16} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold">
                      {personName}{isSelf && <span className="ml-2 text-[11px] font-normal text-muted-foreground">(você)</span>}
                    </span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">{person.email}</span>
                  </span>
                </SheetTitle>
                <SheetDescription className="sr-only">Perfil, acessos ao painel e acesso a Campanhas desta pessoa.</SheetDescription>
                <div className="flex items-center gap-2 pt-1">
                  <SystemRoleBadge role={sys} />
                </div>
              </SheetHeader>

              <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                {/* 1. Perfil */}
                <section className="space-y-2" aria-label="Perfil">
                  <h3 className="text-sm font-bold text-foreground">Perfil</h3>
                  {isMaster ? (
                    <div className="flex items-start gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-700 dark:text-yellow-400">
                      <Crown size={14} className="mt-0.5 shrink-0" />
                      Usuários Master têm acesso total e irrestrito ao painel — não há o que ajustar aqui.
                    </div>
                  ) : (
                    <>
                      <select
                        aria-label="Perfil de acesso"
                        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60"
                        value={roleId}
                        disabled={!siteReady || saving}
                        onChange={e => setRoleId(e.target.value)}
                      >
                        <option value="">Padrão da conta ({SYSTEM_ROLE_LABELS[sys]?.label ?? sys})</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <p className="text-[11px] leading-snug text-muted-foreground">{roleAbout}</p>
                      {sys === "user" && (
                        <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
                          <Info size={12} className="mt-0.5 shrink-0" />
                          Conta de colaborador: não entra no painel administrativo, então os acessos abaixo só passam a valer se a conta for Admin ou Cozinha.
                        </p>
                      )}
                    </>
                  )}
                </section>

                {/* 2. Acessos ao painel */}
                {!isMaster && (
                  <section className="space-y-3" aria-label="Acessos ao painel">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-foreground">
                        Acessos ao painel{" "}
                        <span className="font-normal text-muted-foreground">({countEnabled(effective)}/{ALL_PERM_KEYS.length})</span>
                      </h3>
                      {customCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setOverrides({})}
                          disabled={!siteReady || saving}
                          className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                        >
                          <RotateCcw size={12} /> Voltar ao padrão do perfil
                        </button>
                      )}
                    </div>

                    {loadingOverrides ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground" role="status">
                        <Loader2 size={16} className="animate-spin" /> Carregando acessos...
                      </div>
                    ) : overridesError ? (
                      <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                        <p>Não foi possível carregar os ajustes desta pessoa. Para não sobrescrever nada por engano, a edição está bloqueada.</p>
                        <Button variant="outline" size="sm" onClick={() => loadOverrides(personId)}>Tentar de novo</Button>
                      </div>
                    ) : (
                      PERM_GROUPS.map(group => (
                        <div key={group.group} className="space-y-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group.group}</p>
                          <div className="divide-y divide-border rounded-xl border">
                            {group.items.map(item => {
                              const on = effective[item.key] === true;
                              const custom = overrides[item.key] !== undefined && overrides[item.key] !== baseline[item.key];
                              return (
                                <label key={item.key} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <item.icon size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                                    <span className="truncate text-sm font-medium">{item.label}</span>
                                    {custom && (
                                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                        personalizado
                                      </span>
                                    )}
                                  </span>
                                  <Switch
                                    checked={on}
                                    onCheckedChange={v => toggle(item.key, v)}
                                    disabled={!siteReady || saving}
                                    aria-label={item.label}
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </section>
                )}

                {/* 3. Campanhas (lista própria do módulo; só para quem gerencia esses acessos) */}
                {campaignEnabled && (
                  <CampaignAccessSection perms={campPerms} onChange={setCampPerms} disabled={saving} />
                )}
              </div>

              <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-4">
                <Button variant="outline" className="h-11" onClick={() => !saving && onClose()} disabled={saving}>Cancelar</Button>
                <Button className="h-11 min-w-[120px] gap-2" onClick={handleSave} disabled={!dirty || saving}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Salvar
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={riskText !== null}
        onOpenChange={o => !o && setRiskText(null)}
        title="Remover o seu próprio acesso?"
        description={riskText ?? ""}
        confirmLabel="Sim, remover"
        variant="destructive"
        onConfirm={() => { setRiskText(null); doSave(); }}
      />
    </>
  );
}

// ─── RoleCard ─────────────────────────────────────────────────────────────────
function RoleCard({ role, usersWithRole, onEdit, onDelete }: {
  role: PermRole; usersWithRole: number;
  onEdit: (r: PermRole) => void; onDelete: (r: PermRole) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const enabled = countEnabled(role.permissions);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
              style={{ backgroundColor: role.color + "22", color: role.color }}>
              <ShieldCheck size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{role.name}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: role.color + "22", color: role.color }}>
                  {enabled}/{ALL_PERM_KEYS.length} acessos
                </span>
              </div>
              {role.description && <p className="text-xs text-muted-foreground truncate">{role.description}</p>}
              <div className="flex items-center gap-1 mt-1">
                <Users size={11} className="text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">
                  {usersWithRole === 0
                    ? "Ninguém usa este perfil"
                    : `${usersWithRole} ${usersWithRole !== 1 ? "pessoas" : "pessoa"}`
                  }
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Editar perfil ${role.name}`} onClick={() => onEdit(role)}><Pencil size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 hover:text-destructive" aria-label={`Excluir perfil ${role.name}`} onClick={() => onDelete(role)}><Trash2 size={13} /></Button>
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="text-xs text-primary hover:underline flex items-center gap-1 mt-3 min-h-8">
          {expanded ? "Ocultar" : "Ver acessos"}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-3">
          {PERM_GROUPS.map(group => (
            <div key={group.group}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{group.group}</p>
              <div className="flex flex-wrap gap-1">
                {group.items.map(item => {
                  const on = role.permissions[item.key] === true;
                  return (
                    <span key={item.key} className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium",
                      on ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border opacity-50")}>
                      {item.label}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── RoleFormModal ────────────────────────────────────────────────────────────
function RoleFormModal({ open, onClose, role, onSaved }: {
  open: boolean; onClose: () => void; role: PermRole | null; onSaved: (r: PermRole) => void;
}) {
  const isEdit = !!role;
  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  const [color, setColor] = useState(role?.color || "#6366f1");
  const [permissions, setPermissions] = useState<Perms>(role?.permissions || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(role?.name || ""); setDescription(role?.description || "");
      setColor(role?.color || "#6366f1"); setPermissions(role?.permissions || {});
    }
  }, [open, role]);

  const togglePerm = (key: string) => setPermissions(p => ({ ...p, [key]: !p[key] }));
  const selectAll = () => { const a: Perms = {}; ALL_PERM_KEYS.forEach(k => a[k] = true); setPermissions(a); };
  const selectNone = () => setPermissions({});

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nome do perfil é obrigatório."); return; }
    setSaving(true);
    try {
      // Write an explicit true/false for every current permission key, not just
      // the ones toggled on. Otherwise an unchecked-but-never-touched key stays
      // absent from the stored object, and the resolver treats "absent" as
      // "allowed" — so a role can look restricted in this screen while actually
      // granting everything it never explicitly denied.
      const normalizedPermissions: Perms = {};
      ALL_PERM_KEYS.forEach((k) => { normalizedPermissions[k] = permissions[k] === true; });

      let saved: PermRole;
      if (isEdit && role) {
        saved = await api.authPut(`/admin/roles/${role.id}`, { name, description, color, permissions: normalizedPermissions });
        toast.success("Perfil atualizado!");
      } else {
        saved = await api.authPost("/admin/roles", { name, description, color, permissions: normalizedPermissions });
        toast.success("Perfil criado!");
      }
      onSaved(saved); onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "22", color }}>
              <ShieldCheck size={18} />
            </div>
            {isEdit ? "Editar perfil" : "Novo perfil"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "Edite os detalhes e acessos do perfil." : "Preencha os detalhes e acessos do novo perfil."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nome do perfil *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Gerente de Cozinha" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição opcional" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setColor(c)}
                  className={cn("h-7 w-7 rounded-full border-2 transition-all", color === c ? "border-foreground scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }} />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)} aria-label="Cor personalizada"
                className="h-7 w-7 rounded-full cursor-pointer border border-border bg-transparent" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Acessos ({countEnabled(permissions)}/{ALL_PERM_KEYS.length})</Label>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={selectAll} className="text-primary hover:underline">Todos</button>
                <span className="text-muted-foreground">/</span>
                <button type="button" onClick={selectNone} className="text-muted-foreground hover:underline">Nenhum</button>
              </div>
            </div>
            {PERM_GROUPS.map(group => (
              <div key={group.group}>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.group}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {group.items.map(item => {
                    const on = permissions[item.key] === true;
                    return (
                      <button key={item.key} type="button" onClick={() => togglePerm(item.key)}
                        className={cn("flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left",
                          on ? "border-primary/30 bg-primary/8 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent")}>
                        <div className={cn("h-5 w-5 rounded flex items-center justify-center flex-shrink-0", on ? "bg-primary text-primary-foreground" : "bg-muted")}>
                          {on ? <Check size={11} /> : <item.icon size={11} />}
                        </div>
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2">
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[120px]">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {isEdit ? "Salvar" : "Criar perfil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
