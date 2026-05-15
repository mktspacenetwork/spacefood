import { useState, useEffect, useMemo } from "react";
import {
  Send,
  Trash2,
  Users,
  User,
  Info,
  AlertTriangle,
  ShoppingBag,
  Tag,
  Loader2,
  Megaphone,
  Clock,
  Inbox,
  Calendar,
  Check,
  Search,
  X
} from "lucide-react";
import { useNotifications } from "../../context/notification-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface UserInfo {
  id: string;
  email: string;
  user_metadata?: { name?: string; department?: string; role?: string };
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  sentAt: string;
  scheduledFor?: string;
  sentByName: string;
  recipients?: {
    type: 'all' | 'role' | 'users';
    value?: string[] | string;
  };
  // Legacy
  targetUserId?: string;
}

const QUICK_TEMPLATES = [
  {
    label: "🍽️ Cardápio Disponível",
    title: "Cardápio de hoje disponível!",
    message: "O cardápio de hoje já está disponível. Faça seu pedido antes do encerramento!",
    type: "info",
  },
  {
    label: "⏰ Último Aviso",
    title: "Último aviso de pedidos!",
    message: "Os pedidos encerram em breve. Não esqueça de fazer o seu pedido para hoje!",
    type: "alert",
  },
  {
    label: "🎉 Novidade no Menu",
    title: "Novidade no cardápio!",
    message: "Temos um item especial no cardápio hoje. Confira e peça o seu!",
    type: "promo",
  },
  {
    label: "✅ Pedidos Confirmados",
    title: "Pedidos confirmados!",
    message: "Seus pedidos foram confirmados e estão sendo preparados. Aguarde o horário de retirada.",
    type: "order",
  },
  {
    label: "⚠️ Comunicado Importante",
    title: "Comunicado importante",
    message: "Por favor, fique atento às informações do refeitório para hoje.",
    type: "alert",
  },
];

const TYPE_OPTIONS = [
  { value: "info",  label: "Informação", icon: Info,          color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/20"   },
  { value: "alert", label: "Alerta",     icon: AlertTriangle, color: "text-amber-500",  bg: "bg-amber-50 dark:bg-amber-900/20" },
  { value: "order", label: "Pedido",     icon: ShoppingBag,   color: "text-green-500",  bg: "bg-green-50 dark:bg-green-900/20" },
  { value: "promo", label: "Promoção",   icon: Tag,           color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-900/20" },
];

const RECIPIENT_MODES = [
  { id: "all", label: "Todos", icon: Users },
  { id: "role", label: "Por Função", icon: Tag },
  { id: "users", label: "Selecionar Usuários", icon: User },
] as const;

const AVAILABLE_ROLES = [
  { id: "master", label: "Master" },
  { id: "admin", label: "Administrador" },
  { id: "kitchen", label: "Cozinha" },
  { id: "user", label: "Usuário" },
];

export function AdminNotifications() {
  // Form State
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  
  // Recipients State
  const [recipientMode, setRecipientMode] = useState<"all" | "role" | "users">("all");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");

  // Scheduling State
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");

  // Data State
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [history, setHistory] = useState<Notification[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    // Load users from edge function; history from API
    Promise.all([
        api.authGet("/admin/users").catch(() => []),
        api.authGet("/admin/inbox").catch(() => []) // Use new endpoint if available, or fallback
    ]).then(([u, n]) => {
      setUsers(Array.isArray(u) ? u : []);
      // Sort history by date desc
      const sortedHistory = (Array.isArray(n) ? n : []).sort((a: any, b: any) => {
        const dateA = new Date(a.scheduledFor || a.sentAt).getTime();
        const dateB = new Date(b.scheduledFor || b.sentAt).getTime();
        return dateB - dateA;
      });
      setHistory(sortedHistory);
      setLoadingHistory(false);
    });
  }, []);

  const applyTemplate = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setTitle(tpl.title);
    setMessage(tpl.message);
    setType(tpl.type);
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoles(prev => 
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    );
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const filteredUsers = useMemo(() => {
    if (!userSearch) return users;
    const lower = userSearch.toLowerCase();
    return users.filter(u => 
      (u.user_metadata?.name?.toLowerCase() || "").includes(lower) ||
      (u.email?.toLowerCase() || "").includes(lower)
    );
  }, [users, userSearch]);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Título e mensagem são obrigatórios.");
      return;
    }

    // Validation
    if (recipientMode === "role" && selectedRoles.length === 0) {
      toast.error("Selecione pelo menos uma função.");
      return;
    }
    if (recipientMode === "users" && selectedUsers.length === 0) {
      toast.error("Selecione pelo menos um usuário.");
      return;
    }
    if (isScheduled && !scheduledDate) {
      toast.error("Selecione a data e hora do agendamento.");
      return;
    }

    setSending(true);
    try {
      const payload: any = {
        title: title.trim(),
        message: message.trim(),
        type,
        recipients: {
          type: recipientMode,
          value: recipientMode === "all" ? undefined : (recipientMode === "role" ? selectedRoles : selectedUsers)
        }
      };

      if (isScheduled && scheduledDate) {
        payload.scheduledFor = new Date(scheduledDate).toISOString();
      }

      // Legacy support for backend logic if needed, but new backend handles 'recipients'
      // We send 'recipients' object.
      
      const res = await api.authPost("/admin/inbox/send", payload);

      if (res.notification) {
        setHistory((prev) => [res.notification, ...prev]);
      }

      toast.success(isScheduled ? "Notificação agendada!" : "Notificação enviada!");
      
      // Reset form
      setTitle("");
      setMessage("");
      setType("info");
      setRecipientMode("all");
      setSelectedRoles([]);
      setSelectedUsers([]);
      setIsScheduled(false);
      setScheduledDate("");
      
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar notificação.");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.authDel(`/admin/inbox/${id}`);
      setHistory(history.filter((n) => n.id !== id));
      toast.success("Notificação removida.");
    } catch (e: any) {
        toast.error("Erro ao remover: " + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const getTypeConfig = (t: string) => TYPE_OPTIONS.find((o) => o.value === t) || TYPE_OPTIONS[0];

  const getRecipientSummary = () => {
    if (recipientMode === "all") return "Todos os usuários";
    if (recipientMode === "role") return `${selectedRoles.length} funções selecionadas`;
    if (recipientMode === "users") return `${selectedUsers.length} usuários selecionados`;
    return "";
  };

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Notificações</h1>
        <p className="text-muted-foreground text-sm">
          Envie avisos e comunicados com agendamento e segmentação.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Compose Panel */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="shadow-sm border-0 bg-background/50 backdrop-blur-sm ring-1 ring-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Send size={16} className="text-primary" />
                Nova Notificação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Type selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TYPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setType(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-xs font-semibold",
                        type === opt.value
                          ? `${opt.bg} border-current ${opt.color}`
                          : "border-border bg-card hover:bg-accent/50 text-muted-foreground"
                      )}
                    >
                      <Icon size={18} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Templates */}
              <div className="flex flex-wrap gap-2">
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    onClick={() => applyTemplate(tpl)}
                    className="text-[10px] px-2.5 py-1 rounded-full border border-border bg-accent/30 hover:bg-accent text-foreground transition-colors"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>

              {/* Recipients */}
              <div className="space-y-3 p-4 rounded-xl border border-border/50 bg-card/50">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Users size={12} /> Destinatários
                </label>
                
                <div className="flex rounded-lg bg-muted p-1">
                  {RECIPIENT_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setRecipientMode(mode.id)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 text-xs font-medium py-1.5 rounded-md transition-all",
                        recipientMode === mode.id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <mode.icon size={12} />
                      {mode.label}
                    </button>
                  ))}
                </div>

                {recipientMode === "role" && (
                  <div className="grid grid-cols-2 gap-2 mt-3 animate-in fade-in slide-in-from-top-2">
                    {AVAILABLE_ROLES.map((role) => (
                      <div
                        key={role.id}
                        onClick={() => toggleRole(role.id)}
                        className={cn(
                          "cursor-pointer flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-sm",
                          selectedRoles.includes(role.id)
                            ? "bg-primary/10 border-primary/50 text-primary"
                            : "bg-background border-border hover:bg-accent"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                          selectedRoles.includes(role.id) ? "bg-primary border-primary" : "border-muted-foreground"
                        )}>
                          {selectedRoles.includes(role.id) && <Check size={10} className="text-primary-foreground" />}
                        </div>
                        {role.label}
                      </div>
                    ))}
                  </div>
                )}

                {recipientMode === "users" && (
                  <div className="space-y-3 mt-3 animate-in fade-in slide-in-from-top-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Buscar usuário..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      {filteredUsers.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Nenhum usuário encontrado.</p>
                      ) : (
                        filteredUsers.map((u) => (
                          <div
                            key={u.id}
                            onClick={() => toggleUser(u.id)}
                            className={cn(
                              "cursor-pointer flex items-center justify-between px-3 py-2 rounded-lg border transition-colors text-sm",
                              selectedUsers.includes(u.id)
                                ? "bg-primary/5 border-primary/30"
                                : "bg-background border-border hover:bg-accent"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                                selectedUsers.includes(u.id) ? "bg-primary border-primary" : "border-muted-foreground"
                                )}>
                                {selectedUsers.includes(u.id) && <Check size={10} className="text-primary-foreground" />}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-medium truncate">{u.user_metadata?.name || "Sem nome"}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                                </div>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                                {u.user_metadata?.role || "user"}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    <p className="text-xs text-right text-muted-foreground">
                        {selectedUsers.length} selecionados
                    </p>
                  </div>
                )}
              </div>

              {/* Title & Message */}
              <div className="space-y-4">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título da notificação *"
                  maxLength={80}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm"
                />
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Mensagem da notificação *"
                  maxLength={300}
                  rows={4}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none shadow-sm"
                />
              </div>

              {/* Scheduling */}
              <div className="flex items-center gap-4 p-3 rounded-xl border border-border/50 bg-card/30">
                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="schedule"
                        checked={isScheduled}
                        onChange={(e) => setIsScheduled(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <label htmlFor="schedule" className="text-sm font-medium cursor-pointer">Agendar envio</label>
                </div>
                
                {isScheduled && (
                    <input
                        type="datetime-local"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        min={new Date().toISOString().slice(0, 16)}
                    />
                )}
              </div>

              {/* Send Button */}
              <Button
                onClick={handleSend}
                disabled={sending || !title.trim() || !message.trim()}
                className="w-full gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold h-12 rounded-xl shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                {sending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : isScheduled ? (
                  <Calendar size={18} />
                ) : (
                  <Send size={18} />
                )}
                {sending ? "Processando..." : isScheduled ? "Agendar Notificação" : "Enviar Agora"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* History Panel */}
        <div className="lg:col-span-2">
          <Card className="shadow-sm h-full border-0 bg-background/50 backdrop-blur-sm ring-1 ring-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock size={16} className="text-muted-foreground" />
                Histórico
              </CardTitle>
              <CardDescription>
                {history.length} envio(s) registrado(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="animate-spin text-primary h-6 w-6" />
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                  <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Nenhuma notificação encontrada</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1 custom-scrollbar">
                  <AnimatePresence mode="popLayout">
                    {history.map((n) => {
                      const cfg = getTypeConfig(n.type);
                      const Icon = cfg.icon;
                      
                      const isFuture = n.scheduledFor && new Date(n.scheduledFor) > new Date();
                      
                      const timeDisplay = (() => {
                        try {
                          if (isFuture) {
                            return `Agendado: ${format(new Date(n.scheduledFor!), "dd/MM HH:mm", { locale: ptBR })}`;
                          }
                          return formatDistanceToNow(new Date(n.sentAt), { addSuffix: true, locale: ptBR });
                        } catch {
                          return "Data inválida";
                        }
                      })();

                      // Determine recipient label
                      let recipientLabel = "Todos";
                      if (n.recipients) {
                         if (n.recipients.type === 'role') {
                             const roles = Array.isArray(n.recipients.value) ? n.recipients.value : [n.recipients.value];
                             recipientLabel = roles.map(r => AVAILABLE_ROLES.find(ar => ar.id === r)?.label || r).join(', ');
                         } else if (n.recipients.type === 'users') {
                             const count = Array.isArray(n.recipients.value) ? n.recipients.value.length : 1;
                             recipientLabel = `${count} usuário${count > 1 ? 's' : ''}`;
                         }
                      } else if (n.targetUserId && n.targetUserId !== 'all') {
                         recipientLabel = "Individual";
                      }

                      return (
                        <motion.div
                          key={n.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className={cn(
                            "rounded-xl border p-3 group relative transition-all hover:shadow-md",
                            cfg.bg,
                            "border-border/50",
                            isFuture ? "border-l-4 border-l-blue-500" : ""
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border/30 bg-background/50", cfg.color)}>
                              <Icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start">
                                  <p className="font-bold text-xs text-foreground leading-tight truncate pr-6">{n.title}</p>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{n.message}</p>
                              
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1",
                                    isFuture ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-background/50 text-muted-foreground"
                                )}>
                                  {isFuture ? <Calendar size={10} /> : <Clock size={10} />}
                                  {timeDisplay}
                                </span>
                                
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/50 text-muted-foreground flex items-center gap-1 border border-border/20">
                                   {n.recipients?.type === 'users' ? <User size={10} /> : (n.recipients?.type === 'role' ? <Tag size={10} /> : <Users size={10} />)}
                                   {recipientLabel}
                                </span>
                              </div>
                            </div>
                            
                            <button
                              onClick={() => handleDelete(n.id)}
                              disabled={deletingId === n.id}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg text-red-500"
                              title="Excluir notificação"
                            >
                              {deletingId === n.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}