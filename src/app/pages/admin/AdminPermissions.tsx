import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, Plus, Pencil, Trash2, Users, ChevronDown, ChevronUp,
  LayoutDashboard, ClipboardList, ChefHat, ClipboardCheck,
  CalendarDays, UtensilsCrossed, MessageSquare, BarChart3, Image as ImageIcon,
  Bell, Settings, Shield, Check, X, Loader2, Search, UserCog, AlertTriangle,
  Info
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription
} from "../../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from "../../components/ui/tooltip";
import { Label } from "../../components/ui/label";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PermRole {
  id: string;
  name: string;
  description: string;
  color: string;
  permissions: Record<string, boolean>;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
}

interface UserRoleAssignment {
  userId: string;
  userName: string;
  email: string;
  avatar: string;
  systemRole: string;
  customRoleId: string | null;
  assignedAt: string | null;
  assignedBy: string | null;
}

// ── Permission definitions ────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function countEnabled(permissions: Record<string, boolean>) {
  return ALL_PERM_KEYS.filter(k => permissions[k] === true).length;
}

// ── Role Form Modal ───────────────────────────────────────────────────────────
function RoleFormModal({
  open,
  onClose,
  role,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  role: PermRole | null;
  onSaved: (role: PermRole) => void;
}) {
  const isEdit = !!role;
  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  const [color, setColor] = useState(role?.color || "#6366f1");
  const [permissions, setPermissions] = useState<Record<string, boolean>>(
    role?.permissions || {}
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(role?.name || "");
      setDescription(role?.description || "");
      setColor(role?.color || "#6366f1");
      setPermissions(role?.permissions || {});
    }
  }, [open, role]);

  const togglePerm = (key: string) =>
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));

  const selectAll = () => {
    const all: Record<string, boolean> = {};
    ALL_PERM_KEYS.forEach(k => (all[k] = true));
    setPermissions(all);
  };

  const selectNone = () => setPermissions({});

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nome da função é obrigatório.");
      return;
    }
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
      onSaved(saved);
      onClose();
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

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Name & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Nome da Função *</Label>
              <Input
                id="role-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Gerente de Cozinha"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-desc">Descrição (opcional)</Label>
              <Input
                id="role-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ex: Acesso ao painel operacional"
                className="h-10"
              />
            </div>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Cor da Etiqueta</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-all",
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="h-7 w-7 rounded-full cursor-pointer border border-border bg-transparent"
                title="Cor personalizada"
              />
              <span className="text-xs text-muted-foreground ml-1 font-mono">{color}</span>
            </div>
          </div>

          {/* Permissions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Permissões por Página
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({countEnabled(permissions)}/{ALL_PERM_KEYS.length} habilitadas)
                </span>
              </Label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-primary hover:underline">Todas</button>
                <span className="text-muted-foreground text-xs">/</span>
                <button onClick={selectNone} className="text-xs text-muted-foreground hover:text-foreground hover:underline">Nenhuma</button>
              </div>
            </div>

            <div className="space-y-4">
              {PERM_GROUPS.map(group => (
                <div key={group.group}>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {group.group}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {group.items.map(item => {
                      const enabled = permissions[item.key] === true;
                      return (
                        <button
                          key={item.key}
                          onClick={() => togglePerm(item.key)}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left",
                            enabled
                              ? "border-primary/30 bg-primary/8 text-foreground"
                              : "border-border bg-card text-muted-foreground hover:bg-accent"
                          )}
                        >
                          <div className={cn(
                            "h-5 w-5 rounded flex items-center justify-center flex-shrink-0 transition-colors",
                            enabled ? "bg-primary text-primary-foreground" : "bg-muted"
                          )}>
                            {enabled ? <Check size={11} /> : <item.icon size={11} />}
                          </div>
                          <span className="flex-1">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-2">
          <DialogClose asChild>
            <Button variant="outline" type="button">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[120px]">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {isEdit ? "Salvar Alterações" : "Criar Função"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── User Config Modal ─────────────────────────────────────────────────────────
function UserConfigModal({
  open,
  onClose,
  userEntry,
  roles,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  userEntry: UserRoleAssignment | null;
  roles: PermRole[];
  onSaved: () => void;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
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

  const getEffectivePerm = (key: string): boolean | null => {
    if (overrides[key] !== undefined && overrides[key] !== null) return overrides[key] as boolean;
    if (selectedRole) return selectedRole.permissions[key] === true;
    return null;
  };

  const toggleOverride = (key: string) => {
    const current = overrides[key];
    const roleDefault = selectedRole?.permissions[key] === true;
    if (current === undefined || current === null) {
      // Set explicit override (opposite of role default, or true if no role)
      setOverrides(prev => ({ ...prev, [key]: !roleDefault }));
    } else {
      // Toggle between true/false/null (clear override)
      if (current === true) setOverrides(prev => ({ ...prev, [key]: false }));
      else if (current === false) setOverrides(prev => ({ ...prev, [key]: null }));
      else setOverrides(prev => ({ ...prev, [key]: true }));
    }
  };

  const clearAllOverrides = () => setOverrides({});

  const handleSave = async () => {
    if (!userEntry) return;
    setSaving(true);
    try {
      await api.authPut(`/admin/user-roles/${userEntry.userId}`, {
        roleId: selectedRoleId || null,
      });
      // Save overrides (only non-null ones)
      const cleanOverrides: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(overrides)) {
        if (v !== null && v !== undefined) cleanOverrides[k] = v as boolean;
      }
      await api.authPut(`/admin/user-permissions/${userEntry.userId}`, cleanOverrides);
      toast.success(`Permissões de ${userEntry.userName} atualizadas!`);
      onSaved();
      onClose();
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
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-3">
            <img src={userEntry.avatar} alt={userEntry.userName}
              className="h-9 w-9 rounded-full object-cover border border-border" />
            <div>
              <p className="font-semibold text-sm leading-tight">{userEntry.userName}</p>
              <p className="text-xs text-muted-foreground font-normal leading-tight">{userEntry.email}</p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Gerencie a função e as permissões individuais deste usuário.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* System role badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Papel do sistema:</span>
            <span className={cn(
              "text-xs font-semibold px-2 py-0.5 rounded-full border",
              SYSTEM_ROLE_LABELS[userEntry.systemRole]?.color || SYSTEM_ROLE_LABELS.user.color
            )}>
              {SYSTEM_ROLE_LABELS[userEntry.systemRole]?.label || userEntry.systemRole}
            </span>
            {userEntry.systemRole === 'master' && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Info size={12} /> Acesso total irrestrito
              </span>
            )}
          </div>

          {userEntry.systemRole === 'master' ? (
            <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 text-sm text-yellow-700 dark:text-yellow-400 flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              Usuários Master têm acesso total e não são afetados por funções ou restrições de permissão.
            </div>
          ) : (
            <>
              {/* Role selection */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Função Atribuída</Label>
                <div className="grid grid-cols-1 gap-1.5">
                  {/* None option */}
                  <button
                    onClick={() => setSelectedRoleId("")}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all text-left",
                      !selectedRoleId
                        ? "border-primary/30 bg-primary/8 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <div className={cn(
                      "h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                      !selectedRoleId ? "border-primary" : "border-muted-foreground"
                    )}>
                      {!selectedRoleId && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <span className="italic">Sem função personalizada (usa padrão do papel)</span>
                  </button>

                  {roles.map(role => (
                    <button
                      key={role.id}
                      onClick={() => setSelectedRoleId(role.id)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all text-left",
                        selectedRoleId === role.id
                          ? "border-primary/30 bg-primary/8 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-accent"
                      )}
                    >
                      <div className={cn(
                        "h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                        selectedRoleId === role.id ? "border-primary" : "border-muted-foreground"
                      )}>
                        {selectedRoleId === role.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: role.color }} />
                      <span className="flex-1 font-medium text-foreground">{role.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {countEnabled(role.permissions)}/{ALL_PERM_KEYS.length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Per-user overrides */}
              <div className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowOverrides(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <UserCog size={15} />
                    Permissões Individuais (Overrides)
                    {activeOverrides > 0 && (
                      <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {activeOverrides}
                      </span>
                    )}
                  </div>
                  {showOverrides ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showOverrides && (
                  <div className="px-4 py-3 space-y-3">
                    {loadingOverrides ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 size={20} className="animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <Info size={12} className="flex-shrink-0 mt-0.5" />
                          Overrides sobrepõem as permissões da função. Clique para alternar: ✅ permitido / ❌ bloqueado / — usar padrão da função.
                        </p>

                        {activeOverrides > 0 && (
                          <button onClick={clearAllOverrides} className="text-xs text-destructive hover:underline">
                            Limpar todos os overrides
                          </button>
                        )}

                        {PERM_GROUPS.map(group => (
                          <div key={group.group}>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                              {group.group}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                              {group.items.map(item => {
                                const override = overrides[item.key];
                                const hasOverride = override !== null && override !== undefined;
                                const effective = getEffectivePerm(item.key);

                                return (
                                  <button
                                    key={item.key}
                                    onClick={() => toggleOverride(item.key)}
                                    className={cn(
                                      "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all text-left",
                                      hasOverride
                                        ? override
                                          ? "border-green-500/30 bg-green-500/8 text-foreground"
                                          : "border-red-500/30 bg-red-500/8 text-foreground"
                                        : "border-border bg-card text-muted-foreground hover:bg-accent"
                                    )}
                                  >
                                    <div className={cn(
                                      "h-5 w-5 rounded flex items-center justify-center flex-shrink-0 font-bold text-[10px]",
                                      hasOverride
                                        ? override ? "bg-green-500 text-white" : "bg-red-500 text-white"
                                        : effective ? "bg-muted-foreground/30 text-muted-foreground" : "bg-muted text-muted-foreground"
                                    )}>
                                      {hasOverride ? (override ? "✓" : "✗") : "—"}
                                    </div>
                                    <span className="flex-1">{item.label}</span>
                                    {hasOverride && (
                                      <span className="text-[9px] font-bold uppercase tracking-wider">
                                        {override ? "Forçado" : "Bloqueado"}
                                      </span>
                                    )}
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
          <DialogClose asChild>
            <Button variant="outline" type="button">Cancelar</Button>
          </DialogClose>
          {userEntry.systemRole !== 'master' && (
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

// ── Role Card ─────────────────────────────────────────────────────────────────
function RoleCard({
  role,
  onEdit,
  onDelete,
  usersWithRole,
}: {
  role: PermRole;
  onEdit: (r: PermRole) => void;
  onDelete: (r: PermRole) => void;
  usersWithRole: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const enabled = countEnabled(role.permissions);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
              style={{ backgroundColor: role.color + "22", color: role.color }}
            >
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{role.name}</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: role.color + "22", color: role.color }}
                >
                  {enabled}/{ALL_PERM_KEYS.length} páginas
                </span>
              </div>
              {role.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{role.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(role)}>
              <Pencil size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(role)}
              disabled={usersWithRole > 0}
              title={usersWithRole > 0 ? `${usersWithRole} usuário(s) com esta função` : "Excluir"}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users size={12} />
            <span>{usersWithRole} usuário{usersWithRole !== 1 ? "s" : ""}</span>
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            {expanded ? "Ocultar" : "Ver permissões"}
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-3">
          {PERM_GROUPS.map(group => (
            <div key={group.group}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                {group.group}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map(item => {
                  const on = role.permissions[item.key] === true;
                  return (
                    <span
                      key={item.key}
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium",
                        on
                          ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
                          : "border-border bg-muted/50 text-muted-foreground"
                      )}
                    >
                      {on ? <Check size={9} /> : <X size={9} />}
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export function AdminPermissions() {
  const [roles, setRoles] = useState<PermRole[]>([]);
  const [userAssignments, setUserAssignments] = useState<UserRoleAssignment[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<PermRole | null>(null);
  const [userConfigOpen, setUserConfigOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRoleAssignment | null>(null);
  const [deleteConfirmRole, setDeleteConfirmRole] = useState<PermRole | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");

  const loadRoles = useCallback(async () => {
    setLoadingRoles(true);
    try {
      const data = await api.authGet("/admin/roles");
      setRoles(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error("Erro ao carregar funções.");
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  const loadUserAssignments = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await api.authGet("/admin/user-roles");
      setUserAssignments(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error("Erro ao carregar usuários.");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const handleTabChange = (tab: string) => {
    if (tab === "users" && userAssignments.length === 0) {
      loadUserAssignments();
    }
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleFormOpen(true);
  };

  const openEditRole = (role: PermRole) => {
    setEditingRole(role);
    setRoleFormOpen(true);
  };

  const onRoleSaved = (saved: PermRole) => {
    setRoles(prev => {
      const idx = prev.findIndex(r => r.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmRole) return;
    setDeleting(true);
    try {
      await api.authDel(`/admin/roles/${deleteConfirmRole.id}`);
      setRoles(prev => prev.filter(r => r.id !== deleteConfirmRole.id));
      toast.success("Função excluída.");
      setDeleteConfirmRole(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir.");
    } finally {
      setDeleting(false);
    }
  };

  const getUsersWithRole = (roleId: string) =>
    userAssignments.filter(u => u.customRoleId === roleId).length;

  // Filtered users
  const filteredUsers = userAssignments.filter(u => {
    const matchesSearch =
      u.userName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole =
      filterRole === "all" ||
      (filterRole === "none" && !u.customRoleId) ||
      u.customRoleId === filterRole ||
      u.systemRole === filterRole;
    return matchesSearch && matchesRole;
  });

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="text-primary" size={24} />
              Funções & Permissões
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gerencie funções com permissões por página e configure acesso individual por usuário.
            </p>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 flex items-start gap-3">
          <Info size={16} className="text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm text-foreground/80 space-y-0.5">
            <p className="font-medium text-foreground">Como funciona</p>
            <p>Crie <strong>funções</strong> com um conjunto de permissões e atribua a usuários. Cada usuário pode também ter <strong>permissões individuais</strong> que sobrepõem a função. Usuários <strong>Master</strong> têm acesso total irrestrito.</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="roles" onValueChange={handleTabChange}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="roles" className="flex-1 sm:flex-none gap-1.5">
              <ShieldCheck size={15} />
              Funções
              {roles.length > 0 && (
                <span className="ml-1 bg-primary/15 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {roles.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="users" className="flex-1 sm:flex-none gap-1.5">
              <Users size={15} />
              Usuários
            </TabsTrigger>
          </TabsList>

          {/* ── ROLES TAB ───────────────────────────────────────────── */}
          <TabsContent value="roles" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {loadingRoles ? "Carregando..." : `${roles.length} função${roles.length !== 1 ? "ões" : ""} cadastrada${roles.length !== 1 ? "s" : ""}`}
              </h2>
              <Button onClick={openCreateRole} size="sm" className="gap-1.5">
                <Plus size={16} /> Nova Função
              </Button>
            </div>

            {loadingRoles ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-28" />
                ))}
              </div>
            ) : roles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                  <ShieldCheck size={24} className="text-muted-foreground" />
                </div>
                <p className="font-semibold text-foreground">Nenhuma função criada</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Crie funções para agrupar permissões e atribuir a múltiplos usuários.
                </p>
                <Button onClick={openCreateRole} className="mt-4 gap-2">
                  <Plus size={16} /> Criar Primeira Função
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roles.map(role => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    onEdit={openEditRole}
                    onDelete={setDeleteConfirmRole}
                    usersWithRole={getUsersWithRole(role.id)}
                  />
                ))}
              </div>
            )}

            {/* System Roles Info */}
            <div className="mt-6 border border-border rounded-xl overflow-hidden">
              <div className="bg-muted/40 px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Shield size={15} />
                  Papéis do Sistema (somente leitura)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Papéis embutidos com comportamento fixo. Não podem ser editados.
                </p>
              </div>
              <div className="divide-y divide-border">
                {[
                  { role: "master", label: "Master", desc: "Acesso total irrestrito a todas as páginas e funcionalidades.", perms: "Todas" },
                  { role: "admin", label: "Admin", desc: "Acesso completo por padrão. Pode ser refinado com funções personalizadas.", perms: "Todas (padrão)" },
                  { role: "kitchen", label: "Cozinha", desc: "Acesso restrito a operações de cozinha por padrão.", perms: "Dashboard, Pedidos, KDS, Check-in, Desperdício" },
                  { role: "user", label: "Usuário", desc: "Sem acesso ao painel admin.", perms: "Nenhuma" },
                ].map(item => (
                  <div key={item.role} className="px-4 py-3 flex items-start gap-3">
                    <span className={cn(
                      "text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 mt-0.5",
                      SYSTEM_ROLE_LABELS[item.role]?.color
                    )}>
                      {item.label}
                    </span>
                    <div>
                      <p className="text-sm text-foreground">{item.desc}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <strong>Páginas padrão:</strong> {item.perms}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── USERS TAB ───────────────────────────────────────────── */}
          <TabsContent value="users" className="mt-4 space-y-4">
            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou e-mail..."
                  className="pl-8 h-9"
                />
              </div>
              <select
                value={filterRole}
                onChange={e => setFilterRole(e.target.value)}
                className="h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="all">Todos os papéis</option>
                <option value="master">Master</option>
                <option value="admin">Admin</option>
                <option value="kitchen">Cozinha</option>
                <option value="user">Usuário</option>
                <option value="none">Sem função</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {loadingUsers ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-16" />
                ))}
              </div>
            ) : userAssignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 size={24} className="animate-spin text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Carregando usuários...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground text-sm">Nenhum usuário encontrado.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(u => {
                  const role = roles.find(r => r.id === u.customRoleId);
                  return (
                    <div
                      key={u.userId}
                      className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-accent/30 transition-colors"
                    >
                      <img
                        src={u.avatar}
                        alt={u.userName}
                        className="h-9 w-9 rounded-full object-cover border border-border flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{u.userName}</p>
                          <span className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
                            SYSTEM_ROLE_LABELS[u.systemRole]?.color || SYSTEM_ROLE_LABELS.user.color
                          )}>
                            {SYSTEM_ROLE_LABELS[u.systemRole]?.label || u.systemRole}
                          </span>
                          {role && (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
                              style={{ backgroundColor: role.color + "22", color: role.color, borderColor: role.color + "44" }}
                            >
                              {role.name}
                            </span>
                          )}
                          {!role && u.systemRole !== 'master' && u.systemRole !== 'user' && (
                            <span className="text-[10px] text-muted-foreground italic">padrão do papel</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 flex-shrink-0 h-8"
                        onClick={() => {
                          setSelectedUser(u);
                          setUserConfigOpen(true);
                        }}
                      >
                        <UserCog size={13} />
                        <span className="hidden sm:inline">Configurar</span>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Role Form Modal */}
      <RoleFormModal
        open={roleFormOpen}
        onClose={() => setRoleFormOpen(false)}
        role={editingRole}
        onSaved={onRoleSaved}
      />

      {/* User Config Modal */}
      <UserConfigModal
        open={userConfigOpen}
        onClose={() => setUserConfigOpen(false)}
        userEntry={selectedUser}
        roles={roles}
        onSaved={loadUserAssignments}
      />

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirmRole} onOpenChange={v => !v && setDeleteConfirmRole(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} />
              Excluir Função
            </DialogTitle>
            <DialogDescription className="sr-only">Confirme a exclusão desta função.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir a função{" "}
            <strong className="text-foreground">"{deleteConfirmRole?.name}"</strong>?
            Os usuários que possuem esta função voltarão ao comportamento padrão do papel do sistema.
          </p>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}