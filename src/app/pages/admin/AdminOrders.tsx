import { useState, useEffect, useMemo } from "react";
import { ClipboardList, Search, Clock, Trash2, RefreshCw, Loader2, AlertTriangle, Calendar, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "../../lib/utils";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { SkeletonTable } from "../../components/ui/SkeletonCard";
import { getBrazilDateString } from "../../lib/date-utils";

interface Order {
  id: string;
  userId: string;
  userName: string;
  status: string;
  items: { name: string; quantity: number; category?: string }[];
  total?: number;
  date: string;
  consumptionMode: string;
  userDietaryRestrictions?: string;
  lunchUnit?: string;
  isManualLog?: boolean;
}

const MODE_LABEL: Record<string, string> = {
  dine_in_damasceno: "Damasceno",
  dine_in_taipas: "Taipas",
  takeout_external: "Marmita",
};

const STATUS_COLOR: Record<string, string> = {
  Confirmado: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800",
  "Em Preparo": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  Pronto: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800",
  Retirado: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  Cancelado: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
};

type PeriodType = "today" | "tomorrow" | "week" | "month" | "custom";

function getDateRange(period: PeriodType, customFrom: string, customTo: string) {
  const today = new Date();
  const todayStr = getBrazilDateString(today);

  switch (period) {
    case "today":
      return { from: todayStr, to: todayStr };
    case "tomorrow": {
      const tomorrowStr = getBrazilDateString(addDays(today, 1));
      return { from: tomorrowStr, to: tomorrowStr };
    }
    case "week": {
      const ws = startOfWeek(today, { weekStartsOn: 1 });
      const we = endOfWeek(today, { weekStartsOn: 1 });
      return { from: format(ws, "yyyy-MM-dd"), to: format(we, "yyyy-MM-dd") };
    }
    case "month": {
      const ms = startOfMonth(today);
      const me = endOfMonth(today);
      return { from: format(ms, "yyyy-MM-dd"), to: format(me, "yyyy-MM-dd") };
    }
    case "custom":
      return { from: customFrom || todayStr, to: customTo || todayStr };
  }
}

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Period filter
  const [period, setPeriod] = useState<PeriodType>("today");
  const [customFrom, setCustomFrom] = useState(() => getBrazilDateString());
  const [customTo, setCustomTo] = useState(() => getBrazilDateString());

  // Tab: real orders vs manual logs
  const [activeTab, setActiveTab] = useState<"orders" | "registrations">("orders");

  // Dropdown filters
  const [unitFilter, setUnitFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");

  // Settings (for unit list)
  const [units, setUnits] = useState<string[]>([]);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [period, customFrom, customTo]);

  const loadSettings = async () => {
    try {
      const settings = await api.get("/admin/settings");
      if (settings?.units) {
        const unitNames = Array.isArray(settings.units)
          ? settings.units.map((u: any) => (typeof u === "string" ? u : u.name))
          : [];
        setUnits(unitNames);
      }
    } catch {
      // ignore
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const range = getDateRange(period, customFrom, customTo);
      let data: any;
      if (period === "today" || period === "tomorrow") {
        data = await api.authGet(`/admin/orders?date=${range.from}`);
      } else {
        data = await api.authGet(`/admin/orders?from=${range.from}&to=${range.to}`);
      }
      setOrders(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar pedidos");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveOrder = async () => {
    if (!confirmRemoveId) return;
    setRemovingId(confirmRemoveId);
    try {
      await api.authDel(`/admin/orders/${confirmRemoveId}`);
      setOrders(prev => prev.filter(o => o.id !== confirmRemoveId));
      toast.success("Pedido excluido.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir pedido");
    } finally {
      setRemovingId(null);
      setConfirmRemoveId(null);
    }
  };

  // Derive unique categories from loaded orders
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    orders.forEach(o => o.items?.forEach(item => {
      if (item.category) cats.add(item.category);
    }));
    return Array.from(cats).sort();
  }, [orders]);

  // Derive unique consumption modes from loaded orders
  const availableModes = useMemo(() => {
    const modes = new Set<string>();
    orders.forEach(o => {
      if (o.consumptionMode) modes.add(o.consumptionMode);
    });
    return Array.from(modes);
  }, [orders]);

  // Derive unique lunch units from orders
  const availableUnits = useMemo(() => {
    const u = new Set<string>();
    // From settings
    units.forEach(name => u.add(name));
    // From orders lunchUnit field or consumptionMode mapped to label
    orders.forEach(o => {
      if (o.lunchUnit) u.add(o.lunchUnit);
    });
    return Array.from(u).sort();
  }, [orders, units]);

  const filteredOrders = useMemo(() => {
    return orders
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter(o => {
        // Tab filter: real orders vs manual logs (food diary)
        const matchTab = activeTab === "registrations" ? !!o.isManualLog : !o.isManualLog;

        const q = searchQuery.toLowerCase();
        const matchSearch = !q || o.userName?.toLowerCase().includes(q) || o.id.toLowerCase().includes(q);

        const matchUnit = unitFilter === "all" || o.lunchUnit === unitFilter ||
          (MODE_LABEL[o.consumptionMode] === unitFilter);

        const matchCategory = categoryFilter === "all" ||
          o.items?.some(item => item.category === categoryFilter);

        const matchMode = modeFilter === "all" || o.consumptionMode === modeFilter;

        return matchTab && matchSearch && matchUnit && matchCategory && matchMode;
      });
  }, [orders, searchQuery, unitFilter, categoryFilter, modeFilter, activeTab]);

  const activeFilterCount = [unitFilter, categoryFilter, modeFilter].filter(f => f !== "all").length;

  const periodLabel: Record<PeriodType, string> = {
    today: "Hoje",
    tomorrow: "Amanhã",
    week: "Esta Semana",
    month: "Este Mês",
    custom: "Personalizado",
  };

  const manualLogsCount = orders.filter(o => o.isManualLog).length;
  const realOrdersCount = orders.filter(o => !o.isManualLog).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Gerenciamento de Pedidos</h1>
          <p className="text-muted-foreground text-xs">Visualize e exclua pedidos por periodo.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOrders} className="gap-2 self-start sm:self-auto">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar
        </Button>
      </div>

      {/* Type Tabs: Pedidos / Registros */}
      <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl w-fit border border-border">
        <button
          onClick={() => setActiveTab("orders")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
            activeTab === "orders"
              ? "bg-background text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ClipboardList size={14} />
          Pedidos
          {realOrdersCount > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">
              {realOrdersCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("registrations")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
            activeTab === "registrations"
              ? "bg-background text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ClipboardList size={14} className="text-blue-500" />
          Registros (Taipas)
          {manualLogsCount > 0 && (
            <span className="text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-bold">
              {manualLogsCount}
            </span>
          )}
        </button>
      </div>

      {/* Period Tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(["today", "tomorrow", "week", "month", "custom"] as PeriodType[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
              period === p
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground"
            )}
          >
            {(p === "today" || p === "tomorrow") && <Calendar size={11} className="inline mr-1" />}
            {periodLabel[p]}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {period === "custom" && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
          <label className="text-xs font-medium text-muted-foreground">De:</label>
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
          <label className="text-xs font-medium text-muted-foreground">Ate:</label>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <input
            type="text"
            placeholder="Buscar por nome ou codigo..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>

        {/* Unit filter */}
        {availableUnits.length > 0 && (
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-xs min-w-[130px]"
            value={unitFilter}
            onChange={e => setUnitFilter(e.target.value)}
          >
            <option value="all">Todas Unidades</option>
            {availableUnits.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        )}

        {/* Consumption mode filter */}
        {availableModes.length > 1 && (
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-xs min-w-[110px]"
            value={modeFilter}
            onChange={e => setModeFilter(e.target.value)}
          >
            <option value="all">Todos Modos</option>
            {availableModes.map(m => (
              <option key={m} value={m}>{MODE_LABEL[m] || m}</option>
            ))}
          </select>
        )}

        {/* Category filter */}
        {availableCategories.length > 0 && (
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-xs min-w-[140px]"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="all">Todas Categorias</option>
            {availableCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Active filters / count */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {filteredOrders.length} {activeTab === "registrations" ? `registro${filteredOrders.length !== 1 ? "s" : ""}` : `pedido${filteredOrders.length !== 1 ? "s" : ""}`}
          {activeFilterCount > 0 && (
            <span className="ml-1 text-primary font-semibold">
              ({activeFilterCount} filtro{activeFilterCount > 1 ? "s" : ""} ativo{activeFilterCount > 1 ? "s" : ""})
            </span>
          )}
        </p>
        {activeFilterCount > 0 && (
          <button
            onClick={() => { setUnitFilter("all"); setCategoryFilter("all"); setModeFilter("all"); }}
            className="text-[11px] text-destructive hover:text-destructive/80 font-medium flex items-center gap-0.5"
          >
            <X size={11} /> Limpar filtros
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground border-2 border-dashed rounded-xl bg-card">
          <ClipboardList className={`mx-auto h-10 w-10 opacity-20 mb-3 ${activeTab === "registrations" ? "text-blue-500" : ""}`} />
          <p className="text-sm">
            {activeTab === "registrations" ? "Nenhum registro de refeição encontrado." : "Nenhum pedido encontrado."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              removing={removingId === order.id}
              onDelete={() => setConfirmRemoveId(order.id)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmRemoveId}
        onOpenChange={() => setConfirmRemoveId(null)}
        title="Excluir Pedido?"
        description="Esta acao removera o pedido permanentemente do sistema. Nao podera ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleRemoveOrder}
      />
    </div>
  );
}

interface OrderCardProps {
  order: Order;
  removing: boolean;
  onDelete: () => void;
}

function OrderCard({ order, removing, onDelete }: OrderCardProps) {
  const isManualLog = !!order.isManualLog;
  return (
    <div className={cn(
      "bg-card rounded-xl border shadow-sm overflow-hidden transition-all",
      order.status === "Cancelado" && "opacity-60",
      "border-l-4",
      isManualLog ? "border-l-blue-400" :
      order.status === "Confirmado" ? "border-l-sky-500" :
      order.status === "Em Preparo" ? "border-l-amber-500" :
      order.status === "Pronto" ? "border-l-violet-500" :
      order.status === "Retirado" ? "border-l-emerald-500" :
      "border-l-red-400"
    )}>
      <div className="flex items-start gap-0">
        {/* Main content */}
        <div className="flex-1 p-3 sm:p-4 min-w-0">
          {/* Top row: Name + Status */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <h3 className="font-extrabold text-base sm:text-lg text-foreground leading-tight truncate">
                {order.userName || "Sem nome"}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                <span className="text-[11px] font-mono text-muted-foreground">#{order.id.slice(0, 8)}</span>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock size={10} />
                  {format(new Date(order.date), "dd/MM HH:mm", { locale: ptBR })}
                </span>
                {order.consumptionMode && (
                  <span className="text-[11px] font-semibold text-primary/80">
                    {MODE_LABEL[order.consumptionMode] || order.consumptionMode}
                  </span>
                )}
                {order.lunchUnit && (
                  <span className="text-[11px] text-muted-foreground font-medium">
                    {order.lunchUnit}
                  </span>
                )}
                {order.userDietaryRestrictions && (
                  <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800" title={order.userDietaryRestrictions}>
                    <AlertTriangle size={10} className="shrink-0" />
                    {order.userDietaryRestrictions}
                  </span>
                )}
              </div>
            </div>
            {isManualLog ? (
              <Badge className="text-[10px] font-bold shrink-0 border bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                Registro de Refeição
              </Badge>
            ) : (
              <Badge className={cn("text-[10px] font-bold shrink-0 border", STATUS_COLOR[order.status] || STATUS_COLOR.Confirmado)}>
                {order.status}
              </Badge>
            )}
          </div>

          {/* Items */}
          {order.items?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 mt-2">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs text-foreground">
                  <span className="font-bold text-primary shrink-0">{item.quantity}x</span>
                  <span className="truncate text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete button */}
        <div className="flex flex-col justify-center items-center gap-1.5 p-2 sm:p-3 border-l border-border/50 bg-muted/20 self-stretch min-w-[52px]">
          <button
            onClick={onDelete}
            disabled={removing}
            className="w-9 h-9 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive flex items-center justify-center transition-colors disabled:opacity-50"
            title="Excluir pedido"
          >
            {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}