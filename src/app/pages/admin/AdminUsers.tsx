import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Search, Edit2, Trash2, Loader2, User, Shield,
  Check, X, ShieldCheck, Pencil, Users, ChevronDown, ChevronUp,
  LayoutDashboard, ClipboardList, ChefHat, ClipboardCheck, CalendarDays,
  UtensilsCrossed, MessageSquare, BarChart3, Image as ImageIcon, Bell,
  Settings, Info, AlertTriangle, UserCog, MapPin, Crown, KeyRound, Phone, ScrollText
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/Badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useForm } from "react-hook-form";
import { SkeletonTable, SkeletonRoleCards } from "../../components/ui/SkeletonCard";

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

interface UserRoleAssignment {
  userId: string;
  userName: string;
  email: string;
  avatar: string;
  systemRole: string;
  customRoleId: string | null;
  assignedAt: string | null;
}

// ─── Consts ───────────────────────────────────────────────────────────────────
const ROLES = [
  { value: "user", label: "Usuário (Padrão)" },
  { value: "kitchen", label: "Cozinha (KDS)" },
  { value: "admin", label: "Administrador" },
];

const PERM_GROUPS = [
  {
    group: "Operacional",
    items: [
      { key: "dashboard", label: "Visão Geral", icon: LayoutDashboard },
      { key: "orders", label: "Pedidos", icon: ClipboardList },
      { key: "kds", label: "Cozinha (KDS)", icon: ChefHat },
      { key: "checkin", label: "Check-in", icon: ClipboardCheck },
      { key: "waste", label: "Desperdício", icon: Trash2 },
    ],
  },
  {
    group: "Gestão",
    items: [
      { key: "menu", label: "Cardápio", icon: CalendarDays },
      { key: "items", label: "Gestão de Pratos", icon: UtensilsCrossed },
      { key: "users", label: "Usuários", icon: Users },
      { key: "reviews", label: "Avaliações", icon: MessageSquare },
      { key: "reports", label: "Relatórios", icon: BarChart3 },
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

const PRESET_COLORS = [
  "#ff4500", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

const SYSTEM_ROLE_LABELS: Record<string, { label: string; color: string }> = {
  master: { label: "Master", color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  admin: { label: "Admin", color: "bg-primary/10 text-primary border-primary/20" },
  kitchen: { label: "Cozinha", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  user: { label: "Usuário", color: "bg-muted text-muted-foreground border-border" },
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
function countEnabled(perms: Record<string, boolean>) {
  return ALL_PERM_KEYS.filter(k => perms[k] === true).length;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdminUsers({ defaultTab = "users" }: { defaultTab?: "users" | "permissions" }) {
  // ── User state ──────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AppUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newUserIds, setNewUserIds] = useState<Set<string>>(new Set());
  // Custom role assignment for the user being edited/created
  const [editingCustomRoleId, setEditingCustomRoleId] = useState<string>("");
  // Map userId -> customRoleId from server
  const [userRoleMap, setUserRoleMap] = useState<Record<string, string | null>>({});
  // Permissions modal for a user
  const [userPermEntry, setUserPermEntry] = useState<UserRoleAssignment | null>(null);
  // Available units for lunch location select
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  // Extra edit fields (not in react-hook-form for simpler control)
  const [editLunchLocation, setEditLunchLocation] = useState("");
  const [editDietaryRestrictions, setEditDietaryRestrictions] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCanOrderMeal, setEditCanOrderMeal] = useState(true);
  const [resettingPassword, setResettingPassword] = useState(false);

  const { register, handleSubmit, reset, unregister, formState: { errors } } = useForm();

  // ── Roles state ─────────────────────────────────────────────────────────────
  const [roles, setRoles] = useState<PermRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<PermRole | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<PermRole | null>(null);
  const [roleSearchQuery, setRoleSearchQuery] = useState("");

  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchUsers(); fetchRoles(); fetchUserRoleMap();
    // Fetch available units for lunch location
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
      if (Array.isArray(data)) setRoles(data);
    } catch (e) {
      console.error("Fetch roles error:", e);
    } finally {
      setRolesLoading(false);
    }
  };

  const fetchUserRoleMap = async () => {
    try {
      const data = await api.authGet("/admin/user-roles");
      if (Array.isArray(data)) {
        const map: Record<string, string | null> = {};
        for (const entry of data) { map[entry.userId] = entry.customRoleId || null; }
        setUserRoleMap(map);
      }
    } catch (e) {
      console.error("Fetch user-role map error:", e);
    }
  };

  useEffect(() => {
    if (editingUser) {
      unregister("password");
      reset({
        name: editingUser.user_metadata.name,
        email: editingUser.email,
        role: editingUser.user_metadata.role || "user",
        department: editingUser.user_metadata.department || "",
      });
      setEditingCustomRoleId(userRoleMap[editingUser.id] || "");
      setEditLunchLocation(editingUser.user_metadata.lunch_location || "");
      setEditDietaryRestrictions(editingUser.user_metadata.dietary_restrictions || "");
      setEditAge(editingUser.user_metadata.age || "");
      setEditPhone(editingUser.user_metadata.phone || "");
      setEditCanOrderMeal((editingUser.user_metadata as any).can_order_meal !== false);
    } else {
      reset({ name: "", email: "", password: "", role: "user", department: "" });
      setEditingCustomRoleId("");
      setEditLunchLocation("");
      setEditDietaryRestrictions("");
      setEditAge("");
      setEditPhone("");
      setEditCanOrderMeal(true);
    }
  }, [editingUser, reset, unregister, userRoleMap]);

  const handleResetPassword = async () => {
    if (!editingUser) return;
    setResettingPassword(true);
    try {
      const result = await api.authPost(`/admin/users/${editingUser.id}/reset-password`, {});
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
      const payload: any = { name: data.name, role: data.role, department: data.department || "" };
      if (editingUser) {
        payload.lunchLocation = editLunchLocation;
        payload.dietaryRestrictions = editDietaryRestrictions;
        payload.age = editAge;
        payload.phone = editPhone;
        payload.canOrderMeal = editCanOrderMeal;
        const updated = await api.authPut(`/admin/users/${editingUser.id}`, payload);
        // Save custom role assignment
        await api.authPut(`/admin/user-roles/${editingUser.id}`, { roleId: editingCustomRoleId || null });
        setUserRoleMap(prev => ({ ...prev, [editingUser.id]: editingCustomRoleId || null }));
        setUsers(users.map(u => u.id === editingUser.id
          ? { ...u, user_metadata: { ...u.user_metadata, ...updated.user_metadata } }
          : u
        ));
        toast.success("Usuário atualizado!");
      } else {
        const newUser = await api.authPost("/admin/users", { ...payload, email: data.email, password: data.password });
        if (editingCustomRoleId && newUser?.id) {
          await api.authPut(`/admin/user-roles/${newUser.id}`, { roleId: editingCustomRoleId });
          setUserRoleMap(prev => ({ ...prev, [newUser.id]: editingCustomRoleId }));
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

  const handleDeleteRole = async () => {
    if (!deleteRoleTarget) return;
    try {
      await api.authDel(`/admin/roles/${deleteRoleTarget.id}`);
      setRoles(roles.filter(r => r.id !== deleteRoleTarget.id));
      toast.success("Função removida.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir função.");
    } finally {
      setDeleteRoleTarget(null);
    }
  };

  const filteredUsers = users.filter(u =>
    u.user_metadata?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.user_metadata?.lunch_location?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Build userEntry for permissions modal
  const openUserPermissions = (u: AppUser) => {
    const entry: UserRoleAssignment = {
      userId: u.id,
      userName: u.user_metadata?.name || u.email,
      email: u.email,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(u.user_metadata?.name || "U")}&background=random`,
      systemRole: u.user_metadata?.role || "user",
      customRoleId: userRoleMap[u.id] || null,
      assignedAt: null,
    };
    setUserPermEntry(entry);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Usuários & Permissões</h1>
        <p className="text-muted-foreground text-xs">Gerencie usuários, funções e acessos do sistema.</p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="users" className="gap-2"><Users size={14} /> Usuários</TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2"><ShieldCheck size={14} /> Funções & Permissões</TabsTrigger>
        </TabsList>

        {/* ── TAB: USERS ────────────────────────────────────────────────────── */}
        <TabsContent value="users" className="mt-4 space-y-4">
          {/* Role rules info callout */}
          
          {/* Actions bar */}
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
              <input
                type="text" placeholder="Buscar por nome, email ou unidade..."
                className="w-full pl-9 pr-4 py-2 h-9 rounded-lg border border-input text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Button onClick={() => { setEditingUser(null); setIsUserModalOpen(true); }} className="gap-2 shrink-0">
              <Plus size={16} /> Novo Usuário
            </Button>
          </div>

          {/* Table */}
          <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            {usersLoading ? (
              <SkeletonTable />
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-accent text-muted-foreground uppercase font-medium text-xs">
                      <tr>
                        <th className="px-5 py-3">Usuário</th>
                        <th className="px-5 py-3">Unidade</th>
                        <th className="px-5 py-3">Função</th>
                        <th className="px-5 py-3">Depto.</th>
                        <th className="px-5 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredUsers.map(u => (
                        <UserRow
                          key={u.id}
                          user={u}
                          isNew={newUserIds.has(u.id)}
                          onSeen={handleMarkSeen}
                          onEdit={usr => { setEditingUser(usr); setIsUserModalOpen(true); }}
                          onDelete={id => setDeleteTarget(id)}
                          onPermissions={openUserPermissions}
                          roles={roles}
                          customRoleId={userRoleMap[u.id] || null}
                        />
                      ))}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-sm">Nenhum usuário encontrado.</div>
                  )}
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-border">
                  {filteredUsers.map(u => (
                    <MobileUserCard
                      key={u.id}
                      user={u}
                      isNew={newUserIds.has(u.id)}
                      onSeen={handleMarkSeen}
                      onEdit={usr => { setEditingUser(usr); setIsUserModalOpen(true); }}
                      onDelete={id => setDeleteTarget(id)}
                      onPermissions={openUserPermissions}
                    />
                  ))}
                  {filteredUsers.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-sm">Nenhum usuário encontrado.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ── TAB: PERMISSIONS ──────────────────────────────────────────────── */}
        <TabsContent value="permissions" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
              <input
                type="text" placeholder="Buscar função..."
                className="w-full pl-9 pr-4 py-2 h-9 rounded-lg border border-input text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background"
                value={roleSearchQuery} onChange={e => setRoleSearchQuery(e.target.value)}
              />
            </div>
            <Button onClick={() => { setEditingRole(null); setRoleFormOpen(true); }} className="gap-2 shrink-0">
              <Plus size={16} /> Nova Função
            </Button>
          </div>

          {rolesLoading ? (
            <SkeletonRoleCards />
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {roles
                .filter(r => !roleSearchQuery || r.name.toLowerCase().includes(roleSearchQuery.toLowerCase()))
                .map(role => {
                  const assignedCount = Object.values(userRoleMap).filter(id => id === role.id).length;
                  return (
                    <RoleCard
                      key={role.id}
                      role={role}
                      usersWithRole={assignedCount}
                      onEdit={r => { setEditingRole(r); setRoleFormOpen(true); }}
                      onDelete={r => setDeleteRoleTarget(r)}
                    />
                  );
                })}
              {roles.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                  <ShieldCheck className="mx-auto h-10 w-10 opacity-20 mb-3" />
                  <p className="text-sm">Nenhuma função criada ainda.</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create/Edit User Modal ──────────────────────────────────────────── */}
      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
            <DialogDescription>
              {editingUser ? "Edite todos os dados do cadastro do usuário." : "Preencha os dados do novo usuário."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onUserSubmit)} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Name & Email */}
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

            {/* Password (new user only) */}
            {!editingUser && (
              <div className="space-y-1.5">
                <Label>Senha Provisória *</Label>
                <Input {...register("password", { required: !editingUser, minLength: 6 })} type="password" placeholder="Mínimo 6 caracteres" />
                {errors.password && <span className="text-xs text-destructive">Mínimo 6 caracteres</span>}
              </div>
            )}

            {/* Reset password (edit mode only) */}
            {editingUser && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound size={14} className="text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-medium text-foreground">Redefinir Senha</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    disabled={resettingPassword}
                    onClick={handleResetPassword}
                  >
                    {resettingPassword ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                    Enviar Email de Reset
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Envia um email de redefinição para <strong>{editingUser.email}</strong>. O usuário poderá criar uma nova senha pelo link recebido.
                </p>
              </div>
            )}

            {/* Department */}
            <div className="space-y-1.5">
              <Label>Departamento</Label>
              <Input {...register("department")} placeholder="Ex: Financeiro" />
            </div>

            {/* Custom Role */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-primary" /> Função
              </Label>
              {rolesLoading ? (
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/40 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" /> Carregando funções...
                </div>
              ) : roles.length === 0 ? (
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-dashed border-input bg-muted/20 text-xs text-muted-foreground italic">
                  Nenhuma função cadastrada
                </div>
              ) : (
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={editingCustomRoleId}
                  onChange={e => setEditingCustomRoleId(e.target.value)}
                >
                  <option value="">-- Sem função personalizada --</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Lunch Location & Age */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-primary" /> Unidade (Almoço)
                </Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
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

            {/* Phone */}
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

            {/* Dietary Restrictions */}
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

            {/* Meal Order Permission */}
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

      {/* ── Role Form Modal ─────────────────────────────────────────────────── */}
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

      {/* ── User Permissions Modal ──────────────────────────────────────────── */}
      <UserPermissionsModal
        open={!!userPermEntry}
        onClose={() => setUserPermEntry(null)}
        userEntry={userPermEntry}
        roles={roles}
        onSaved={() => {}}
      />

      {/* ── Confirm Dialogs ─────────────────────────────────────────────────── */}
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
        open={!!deleteRoleTarget}
        onOpenChange={() => setDeleteRoleTarget(null)}
        title="Excluir Função?"
        description={`A função "${deleteRoleTarget?.name}" será removida. Usuários com esta função voltarão ao padrão.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDeleteRole}
      />
    </div>
  );
}

// ─── UserRow ──────────────────────────────────────────────────────────────────
function UserRow({ user, isNew, onSeen, onEdit, onDelete, onPermissions, roles, customRoleId }: {
  user: AppUser; isNew: boolean;
  onSeen: (id: string) => void;
  onEdit: (u: AppUser) => void;
  onDelete: (id: string) => void;
  onPermissions: (u: AppUser) => void;
  roles: PermRole[];
  customRoleId: string | null;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [showDot, setShowDot] = useState(isNew);

  useEffect(() => { setShowDot(isNew); }, [isNew]);
  useEffect(() => {
    if (!showDot || !rowRef.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { timer = setTimeout(() => { setShowDot(false); onSeen(user.id); }, 1500); }
      else { if (timer) { clearTimeout(timer); timer = null; } }
    }, { threshold: 0.5 });
    observer.observe(rowRef.current);
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [showDot, user.id, onSeen]);

  const roleColor = user.user_metadata?.role === "admin"
    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
    : user.user_metadata?.role === "kitchen"
    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
    : user.user_metadata?.role === "master"
    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400";

  return (
    <tr ref={rowRef} className="hover:bg-accent/40 transition-colors group">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {user.user_metadata?.name?.charAt(0).toUpperCase() || <User size={16} />}
            </div>
            {showDot && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-500 border-2 border-card" />
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">{user.user_metadata?.name || "Sem Nome"}</span>
              {showDot && <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full">Novo</span>}
              {user.user_metadata?.role === "master" && (
                <span title="Admin Master do Sistema" className="flex items-center gap-0.5 text-[10px] font-black text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded-full border border-yellow-300 dark:border-yellow-800">
                  <Crown size={9} className="fill-current" /> Master
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        <div className="flex flex-col gap-1">
          {user.user_metadata?.lunch_location ? (
            <span className="flex items-center gap-1 text-xs text-foreground">
              <MapPin size={11} className="text-primary shrink-0" />
              {user.user_metadata.lunch_location}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {user.user_metadata?.dietary_restrictions && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400" title={user.user_metadata.dietary_restrictions}>
              <AlertTriangle size={10} className="shrink-0" />
              <span className="truncate max-w-[120px]">{user.user_metadata.dietary_restrictions}</span>
            </span>
          )}
        </div>
      </td>
      <td className="px-5 py-3">
        {customRoleId ? (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full border w-fit inline-block"
            style={{
              backgroundColor: (roles.find(r => r.id === customRoleId)?.color || "#6366f1") + "22",
              color: roles.find(r => r.id === customRoleId)?.color || "#6366f1",
              borderColor: (roles.find(r => r.id === customRoleId)?.color || "#6366f1") + "44",
            }}
          >
            {roles.find(r => r.id === customRoleId)?.name || "Função"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-5 py-3 text-xs text-muted-foreground">
        {user.user_metadata?.department || "—"}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-600" onClick={() => onPermissions(user)} title="Permissões">
            <ShieldCheck size={13} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600" onClick={() => onEdit(user)} title="Editar">
            <Edit2 size={13} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600" onClick={() => onDelete(user.id)} title="Excluir">
            <Trash2 size={13} />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── MobileUserCard ───────────────────────────────────────────────────────────
function MobileUserCard({ user, isNew, onSeen, onEdit, onDelete, onPermissions }: {
  user: AppUser; isNew: boolean;
  onSeen: (id: string) => void;
  onEdit: (u: AppUser) => void;
  onDelete: (id: string) => void;
  onPermissions: (u: AppUser) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [showDot, setShowDot] = useState(isNew);
  useEffect(() => { setShowDot(isNew); }, [isNew]);
  useEffect(() => {
    if (!showDot || !cardRef.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { timer = setTimeout(() => { setShowDot(false); onSeen(user.id); }, 1500); }
      else { if (timer) { clearTimeout(timer); timer = null; } }
    }, { threshold: 0.5 });
    observer.observe(cardRef.current);
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [showDot, user.id, onSeen]);

  return (
    <div ref={cardRef} className="p-4 flex items-center gap-3">
      <div className="relative flex-shrink-0">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
          {user.user_metadata?.name?.charAt(0).toUpperCase() || <User size={18} />}
        </div>
        {showDot && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 border-2 border-card" />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground">{user.user_metadata?.name || "Sem Nome"}</span>
          {showDot && <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full">Novo</span>}
          {user.user_metadata?.role === "master" && (
            <span title="Admin Master do Sistema" className="flex items-center gap-0.5 text-[10px] font-black text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded-full border border-yellow-300 dark:border-yellow-800">
              <Crown size={9} className="fill-current" /> Master
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
        {user.user_metadata?.lunch_location && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <MapPin size={10} className="text-primary" /> {user.user_metadata.lunch_location}
          </div>
        )}
        {user.user_metadata?.dietary_restrictions && (
          <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
            <AlertTriangle size={10} className="shrink-0" />
            <span className="truncate">{user.user_metadata.dietary_restrictions}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-violet-600" onClick={() => onPermissions(user)}><ShieldCheck size={14} /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(user)}><Edit2 size={14} /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(user.id)}><Trash2 size={14} /></Button>
      </div>
    </div>
  );
}

// ─── RoleCard ───────────────────────────────────��─────────────────────────────
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
                  {enabled}/{ALL_PERM_KEYS.length} permissões
                </span>
              </div>
              {role.description && <p className="text-xs text-muted-foreground truncate">{role.description}</p>}
              {/* Assignment count */}
              <div className="flex items-center gap-1 mt-1">
                <Users size={11} className="text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">
                  {usersWithRole === 0
                    ? "Nenhum usuário atribuído"
                    : `${usersWithRole} usuário${usersWithRole !== 1 ? "s" : ""} atribuído${usersWithRole !== 1 ? "s" : ""}`
                  }
                </span>
                {usersWithRole > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1"
                    style={{ backgroundColor: role.color + "22", color: role.color }}
                  >
                    {usersWithRole}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(role)}><Pencil size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => onDelete(role)}><Trash2 size={13} /></Button>
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="text-xs text-primary hover:underline flex items-center gap-1 mt-3">
          {expanded ? "Ocultar" : "Ver permissões"}
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
  const [permissions, setPermissions] = useState<Record<string, boolean>>(role?.permissions || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(role?.name || ""); setDescription(role?.description || "");
      setColor(role?.color || "#6366f1"); setPermissions(role?.permissions || {});
    }
  }, [open, role]);

  const togglePerm = (key: string) => setPermissions(p => ({ ...p, [key]: !p[key] }));
  const selectAll = () => { const a: Record<string, boolean> = {}; ALL_PERM_KEYS.forEach(k => a[k] = true); setPermissions(a); };
  const selectNone = () => setPermissions({});

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nome da função é obrigatório."); return; }
    setSaving(true);
    try {
      let saved: PermRole;
      if (isEdit && role) {
        saved = await api.authPut(`/admin/roles/${role.id}`, { name, description, color, permissions });
        toast.success("Função atualizada!");
      } else {
        saved = await api.authPost("/admin/roles", { name, description, color, permissions });
        toast.success("Função criada!");
      }
      onSaved(saved); onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar função.");
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
            {isEdit ? "Editar Função" : "Nova Função"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "Edite os detalhes e permissões da função." : "Preencha os detalhes e permissões da nova função."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nome da Fun��ão *</Label>
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
                <button key={c} onClick={() => setColor(c)}
                  className={cn("h-6 w-6 rounded-full border-2 transition-all", color === c ? "border-foreground scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }} />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="h-6 w-6 rounded-full cursor-pointer border border-border bg-transparent" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Permissões ({countEnabled(permissions)}/{ALL_PERM_KEYS.length})</Label>
              <div className="flex gap-2 text-xs">
                <button onClick={selectAll} className="text-primary hover:underline">Todas</button>
                <span className="text-muted-foreground">/</span>
                <button onClick={selectNone} className="text-muted-foreground hover:underline">Nenhuma</button>
              </div>
            </div>
            {PERM_GROUPS.map(group => (
              <div key={group.group}>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.group}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.items.map(item => {
                    const on = permissions[item.key] === true;
                    return (
                      <button key={item.key} onClick={() => togglePerm(item.key)}
                        className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left",
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
            {isEdit ? "Salvar" : "Criar Função"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── UserPermissionsModal ─────────────────────────────────────────────────────
function UserPermissionsModal({ open, onClose, userEntry, roles, onSaved }: {
  open: boolean; onClose: () => void;
  userEntry: UserRoleAssignment | null; roles: PermRole[]; onSaved: () => void;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [overrides, setOverrides] = useState<Record<string, boolean | null>>({});
  const [showOverrides, setShowOverrides] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingOverrides, setLoadingOverrides] = useState(false);

  const selectedRole = roles.find(r => r.id === selectedRoleId) || null;

  useEffect(() => {
    if (open && userEntry) {
      setSelectedRoleId(userEntry.customRoleId || "");
      setShowOverrides(false);
      setLoadingOverrides(true);
      api.authGet(`/admin/user-permissions/${userEntry.userId}`)
        .then(data => setOverrides(data || {}))
        .catch(() => setOverrides({}))
        .finally(() => setLoadingOverrides(false));
    }
  }, [open, userEntry]);

  const getEffectivePerm = (key: string) => {
    if (overrides[key] !== undefined && overrides[key] !== null) return overrides[key] as boolean;
    if (selectedRole) return selectedRole.permissions[key] === true;
    return null;
  };

  const toggleOverride = (key: string) => {
    const current = overrides[key];
    const roleDefault = selectedRole?.permissions[key] === true;
    if (current === undefined || current === null) setOverrides(p => ({ ...p, [key]: !roleDefault }));
    else if (current === true) setOverrides(p => ({ ...p, [key]: false }));
    else setOverrides(p => ({ ...p, [key]: null }));
  };

  const handleSave = async () => {
    if (!userEntry) return;
    setSaving(true);
    try {
      await api.authPut(`/admin/user-roles/${userEntry.userId}`, { roleId: selectedRoleId || null });
      const cleanOverrides: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(overrides)) {
        if (v !== null && v !== undefined) cleanOverrides[k] = v as boolean;
      }
      await api.authPut(`/admin/user-permissions/${userEntry.userId}`, cleanOverrides);
      toast.success(`Permissões de ${userEntry.userName} atualizadas!`);
      onSaved(); onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  if (!userEntry) return null;
  const activeOverrides = Object.entries(overrides).filter(([, v]) => v !== null && v !== undefined).length;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-3">
            <img src={userEntry.avatar} alt={userEntry.userName} className="h-9 w-9 rounded-full object-cover border" />
            <div>
              <p className="font-semibold text-sm">{userEntry.userName}</p>
              <p className="text-xs text-muted-foreground">{userEntry.email}</p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Gerencie a função e as permissões individuais deste usuário.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Papel:</span>
            <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border",
              SYSTEM_ROLE_LABELS[userEntry.systemRole]?.color || SYSTEM_ROLE_LABELS.user.color)}>
              {SYSTEM_ROLE_LABELS[userEntry.systemRole]?.label || userEntry.systemRole}
            </span>
          </div>
          {userEntry.systemRole === "master" ? (
            <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 text-sm text-yellow-700 dark:text-yellow-400 flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              Usuários Master têm acesso total irrestrito.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="font-semibold">Função Atribuída</Label>
                <div className="space-y-1">
                  <button onClick={() => setSelectedRoleId("")}
                    className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all",
                      !selectedRoleId ? "border-primary/30 bg-primary/8" : "border-border hover:bg-accent")}>
                    <div className={cn("h-4 w-4 rounded-full border-2 flex items-center justify-center",
                      !selectedRoleId ? "border-primary" : "border-muted-foreground")}>
                      {!selectedRoleId && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <span className="italic text-muted-foreground">Sem função personalizada</span>
                  </button>
                  {roles.map(role => (
                    <button key={role.id} onClick={() => setSelectedRoleId(role.id)}
                      className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all",
                        selectedRoleId === role.id ? "border-primary/30 bg-primary/8" : "border-border hover:bg-accent")}>
                      <div className={cn("h-4 w-4 rounded-full border-2 flex items-center justify-center",
                        selectedRoleId === role.id ? "border-primary" : "border-muted-foreground")}>
                        {selectedRoleId === role.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: role.color }} />
                      <span className="flex-1 font-medium">{role.name}</span>
                      <span className="text-xs text-muted-foreground">{countEnabled(role.permissions)}/{ALL_PERM_KEYS.length}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-border rounded-xl overflow-hidden">
                <button onClick={() => setShowOverrides(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 text-sm transition-colors">
                  <div className="flex items-center gap-2 font-medium">
                    <UserCog size={14} /> Overrides Individuais
                    {activeOverrides > 0 && (
                      <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeOverrides}</span>
                    )}
                  </div>
                  {showOverrides ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {showOverrides && (
                  <div className="px-4 py-3 space-y-3">
                    {loadingOverrides ? <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin" /></div> : (
                      <>
                        <p className="text-xs text-muted-foreground flex gap-1.5 items-start">
                          <Info size={12} className="shrink-0 mt-0.5" />
                          Clique para alternar: ✅ permitido / ❌ bloqueado / — padrão da função.
                        </p>
                        {activeOverrides > 0 && (
                          <button onClick={() => setOverrides({})} className="text-xs text-destructive hover:underline">Limpar overrides</button>
                        )}
                        {PERM_GROUPS.map(group => (
                          <div key={group.group}>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{group.group}</p>
                            <div className="grid grid-cols-2 gap-1">
                              {group.items.map(item => {
                                const override = overrides[item.key];
                                const hasOverride = override !== null && override !== undefined;
                                return (
                                  <button key={item.key} onClick={() => toggleOverride(item.key)}
                                    className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all text-left",
                                      hasOverride ? (override ? "border-green-500/30 bg-green-500/8" : "border-red-500/30 bg-red-500/8") : "border-border bg-card hover:bg-accent")}>
                                    <div className={cn("h-5 w-5 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold",
                                      hasOverride ? (override ? "bg-green-500 text-white" : "bg-red-500 text-white") : "bg-muted text-muted-foreground")}>
                                      {hasOverride ? (override ? "✓" : "✗") : "—"}
                                    </div>
                                    {item.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2">
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          {userEntry.systemRole !== "master" && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[120px]">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Salvar Permissões
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}