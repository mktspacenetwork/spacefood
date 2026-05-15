import { useState, useEffect, useCallback } from "react";
import {
  ScrollText,
  Search,
  Filter,
  Calendar,
  User,
  Clock,
  MapPin,
  Loader2,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Shield,
  Settings,
  UtensilsCrossed,
  ClipboardList,
  Users,
  Image as ImageIcon,
  Bell,
  FileText,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useAuth } from "../../context/auth-context";

interface AuditLog {
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

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  users: { label: "Usuarios", icon: Users, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  items: { label: "Itens", icon: UtensilsCrossed, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  orders: { label: "Pedidos", icon: ClipboardList, color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" },
  menu: { label: "Cardapio", icon: FileText, color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20" },
  settings: { label: "Configuracoes", icon: Settings, color: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20" },
  banners: { label: "Banners", icon: ImageIcon, color: "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/20" },
  notifications: { label: "Notificacoes", icon: Bell, color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20" },
  system: { label: "Sistema", icon: Shield, color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20" },
};

const ROLE_LABELS: Record<string, string> = {
  master: "Admin Master",
  admin: "Administrador",
  kitchen: "Cozinha",
  user: "Usuario",
};

function formatBrazilDateTime(isoStr: string): { date: string; time: string } {
  try {
    // The timestamp is already in Brazil time from the server (brasiliaDateNow)
    const d = new Date(isoStr);
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const year = d.getUTCFullYear();
    const hours = String(d.getUTCHours()).padStart(2, "0");
    const minutes = String(d.getUTCMinutes()).padStart(2, "0");
    const seconds = String(d.getUTCSeconds()).padStart(2, "0");
    return {
      date: `${day}/${month}/${year}`,
      time: `${hours}:${minutes}:${seconds}`,
    };
  } catch {
    return { date: "--/--/----", time: "--:--:--" };
  }
}

export function AdminLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (selectedCategory) params.set("category", selectedCategory);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      params.set("limit", "500");

      const result = await api.authGet(`/admin/audit-logs?${params.toString()}`);
      setLogs(result.logs || []);
      setTotal(result.total || 0);
    } catch (err: any) {
      console.error("[AdminLogs] Fetch error:", err);
      toast.error(err.message || "Erro ao carregar logs.");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleClearLogs = async () => {
    setClearing(true);
    try {
      const result = await api.authDel("/admin/audit-logs");
      toast.success(`${result.deleted} registros de log removidos.`);
      setLogs([]);
      setTotal(0);
    } catch (err: any) {
      toast.error(err.message || "Erro ao limpar logs.");
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  const getCategoryConfig = (cat: string) => {
    return CATEGORY_CONFIG[cat] || { label: cat, icon: ScrollText, color: "bg-muted text-muted-foreground border-border" };
  };

  const allCategories = Object.keys(CATEGORY_CONFIG);

  // Group logs by date
  const groupedLogs: Record<string, AuditLog[]> = {};
  for (const log of logs) {
    const { date } = formatBrazilDateTime(log.timestamp);
    if (!groupedLogs[date]) groupedLogs[date] = [];
    groupedLogs[date].push(log);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <ScrollText size={24} className="text-primary" />
            Log de Auditoria
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Registro de todas as acoes realizadas no sistema.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLogs}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
          {user?.role === "master" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClear(true)}
              className="gap-2 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 size={14} />
              Limpar Logs
            </Button>
          )}
        </div>
      </div>

      {/* Search + Filter Bar */}
      <div className="bg-card rounded-xl shadow-sm border border-border p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"
              placeholder="Buscar por acao, usuario ou descricao..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-input text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background text-foreground"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2 h-[38px]"
          >
            <Filter size={14} />
            Filtros
            {(selectedCategory || dateFrom || dateTo) && (
              <span className="h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>
        </div>

        {/* Expandable Filters */}
        {showFilters && (
          <div className="pt-3 border-t border-border space-y-3 animate-in slide-in-from-top-2 duration-200">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory("")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  !selectedCategory
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card text-muted-foreground border-border hover:bg-accent"
                )}
              >
                Todas
              </button>
              {allCategories.map((cat) => {
                const config = getCategoryConfig(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? "" : cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                      selectedCategory === cat
                        ? config.color + " font-bold"
                        : "bg-card text-muted-foreground border-border hover:bg-accent"
                    )}
                  >
                    {config.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2 flex-1">
                <Calendar size={14} className="text-muted-foreground flex-shrink-0" />
                <label className="text-xs text-muted-foreground whitespace-nowrap">De:</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex items-center gap-2 flex-1">
                <Calendar size={14} className="text-muted-foreground flex-shrink-0" />
                <label className="text-xs text-muted-foreground whitespace-nowrap">Ate:</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              {(dateFrom || dateTo || selectedCategory) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setSelectedCategory("");
                  }}
                  className="h-8 text-xs text-muted-foreground"
                >
                  <X size={12} className="mr-1" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Carregando...
            </span>
          ) : (
            `${logs.length} registros${total > logs.length ? ` de ${total} total` : ""}`
          )}
        </span>
        {!loading && logs.length > 0 && (
          <span className="text-xs">
            {Object.keys(groupedLogs).length} dia(s)
          </span>
        )}
      </div>

      {/* Logs Timeline */}
      {!loading && logs.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <ScrollText size={48} className="mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Nenhum log encontrado</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery || selectedCategory || dateFrom || dateTo
              ? "Tente ajustar os filtros de busca."
              : "As acoes do sistema serao registradas aqui automaticamente."}
          </p>
        </div>
      )}

      {!loading && Object.entries(groupedLogs).map(([dateLabel, dateLogs]) => (
        <div key={dateLabel} className="space-y-2">
          {/* Date Header */}
          <div className="flex items-center gap-3 px-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={12} />
              {dateLabel}
            </span>
            <Badge variant="secondary" className="text-[10px] h-5">
              {dateLogs.length}
            </Badge>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Log Entries */}
          <div className="space-y-1.5">
            {dateLogs.map((log) => {
              const config = getCategoryConfig(log.category);
              const IconComp = config.icon;
              const { time } = formatBrazilDateTime(log.timestamp);
              const isExpanded = expandedId === log.id;

              return (
                <div
                  key={log.id}
                  className={cn(
                    "bg-card rounded-lg border transition-all cursor-pointer group",
                    isExpanded
                      ? "border-primary/30 shadow-sm"
                      : "border-border hover:border-border/80 hover:shadow-sm"
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  {/* Main Row */}
                  <div className="flex items-center gap-3 p-3">
                    {/* Category Icon */}
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 border", config.color)}>
                      <IconComp size={16} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate max-w-[300px]">
                          {log.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <User size={10} />
                          {log.userName}
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock size={10} />
                          {time}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn("text-[9px] h-4 px-1.5 font-normal border", config.color)}
                        >
                          {config.label}
                        </Badge>
                      </div>
                    </div>

                    {/* Expand/Collapse */}
                    <div className="text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-0 border-t border-border/50 mx-3 mb-1 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                        <DetailRow label="Acao" value={log.action} />
                        <DetailRow label="Categoria" value={config.label} />
                        <DetailRow label="Usuario" value={`${log.userName} (${ROLE_LABELS[log.userRole] || log.userRole})`} />
                        <DetailRow label="ID do Usuario" value={log.userId} mono />
                        <DetailRow label="IP" value={log.ip} icon={<MapPin size={10} />} />
                        <DetailRow label="Timestamp" value={`${formatBrazilDateTime(log.timestamp).date} ${time}`} icon={<Clock size={10} />} />
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-2">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Detalhes</span>
                          <pre className="mt-1 p-2 bg-muted/50 rounded-md text-[11px] text-muted-foreground overflow-x-auto font-mono border border-border/50">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {loading && (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-primary" size={24} />
        </div>
      )}

      {/* Confirm Clear Dialog */}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Limpar todos os logs?"
        description="Esta acao remove permanentemente todos os registros de auditoria. Isso nao pode ser desfeito."
        confirmLabel={clearing ? "Limpando..." : "Sim, Limpar Tudo"}
        variant="destructive"
        onConfirm={handleClearLogs}
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span
        className={cn(
          "text-xs text-foreground flex items-center gap-1",
          mono && "font-mono text-[11px] break-all"
        )}
      >
        {icon}
        {value}
      </span>
    </div>
  );
}