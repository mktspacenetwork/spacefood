import { useState, useEffect, useRef } from "react";
import { format, addDays, isSameDay, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, RefreshCw, ChefHat, Clock, Scale, Volume2, VolumeX, Utensils, Building, Package, Maximize2, Minimize2, Egg, ArrowRightLeft, AlertTriangle, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import { getBrazilTimeString } from "../../lib/date-utils";

interface KitchenItemSummary {
  itemId: string;
  name: string;
  category: string;
  totalQuantity: number;
  totalWeight: number;
  unit: string;
  portionWeight: number;
  kitchenUnit: "kg" | "l" | "un";
}

const STATUS_COLORS: Record<string, string> = {
  Confirmado: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
  "Em Preparo": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  Pronto: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  Retirado: "bg-muted text-muted-foreground border-border",
};

const CATEGORY_COLORS: Record<string, string> = {
  "Prato Principal": "bg-blue-500/20 text-blue-300",
  "Opção Vegetariana": "bg-green-500/20 text-green-300",
  Guarnição: "bg-orange-500/20 text-orange-300",
  Salada: "bg-emerald-500/20 text-emerald-300",
  Sobremesa: "bg-pink-500/20 text-pink-300",
  Bebida: "bg-purple-500/20 text-purple-300",
  Suco: "bg-yellow-500/20 text-yellow-300",
};

const MODE_CONFIG: Record<string, { label: string; icon: any }> = {
  dine_in_damasceno: { label: "Damasceno", icon: Utensils },
  dine_in_taipas: { label: "Taipas", icon: Building },
  takeout_external: { label: "Marmita", icon: Package },
};

export function KitchenDashboard() {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [items, setItems] = useState<KitchenItemSummary[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const prevOrderCount = useRef(0);

  const isToday = isSameDay(selectedDate, new Date());
  const isFuture = startOfDay(selectedDate) > startOfDay(new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const dateLabel = format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR });

  const goToPrevDay = () => setSelectedDate((d) => addDays(d, -1));
  const goToNextDay = () => setSelectedDate((d) => addDays(d, 1));
  const goToToday = () => setSelectedDate(new Date());

  const playNotification = () => {
    if (!soundEnabled) return;
    try {
      const audio = new Audio("/novopedido.mp3");
      audio.volume = 1;
      audio.play().catch(() => {});
    } catch (_) {}
  };

  const fetchData = async (viewDateStr?: string) => {
    const targetDate = viewDateStr ?? dateStr;
    const viewingToday = targetDate === format(new Date(), "yyyy-MM-dd");
    try {
      const orders = await api.authGet(`/admin/orders?date=${targetDate}`);
      // Filter out manual logs (Taipas food diary entries) — cozinha não precisa ver
      const filteredOrders = (Array.isArray(orders) ? orders : []).filter((o: any) => !o.isManualLog);

      // Only fire sound notification when watching today's orders live
      if (viewingToday && prevOrderCount.current > 0 && filteredOrders.length > prevOrderCount.current) {
        playNotification();
        toast.info("Novo pedido recebido!", { duration: 3000 });
      }
      if (viewingToday) {
        prevOrderCount.current = filteredOrders.length;
      }

      const sorted = filteredOrders
        .filter((o: any) => o.status !== "Cancelado" && o.status !== "Retirado")
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setRecentOrders(sorted);

      // Aggregate items from ALL orders for the date (including delivered, excluding manual logs)
      const allItems = filteredOrders.flatMap((o: any) => o.items || []);
      const aggregated = allItems.reduce((acc: KitchenItemSummary[], item: any) => {
        const existing = acc.find(i => i.itemId === item.id);
        const qty = item.quantity || 1;
        const weight = (item.portionWeight || 0) * qty;
        if (existing) {
          existing.totalQuantity += qty;
          existing.totalWeight += weight;
        } else {
          acc.push({
            itemId: item.id,
            name: item.name,
            category: item.category || "",
            totalQuantity: qty,
            totalWeight: weight,
            unit: item.unit || "un",
            portionWeight: item.portionWeight || 0,
            kitchenUnit: item.kitchenUnit || (item.unit === "ml" ? "l" : item.unit === "un" ? "un" : "kg"),
          });
        }
        return acc;
      }, [] as KitchenItemSummary[]);

      setItems(aggregated.sort((a, b) => b.totalQuantity - a.totalQuantity));
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Erro ao atualizar KDS:", error);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch immediately and restart polling interval when date changes
  useEffect(() => {
    prevOrderCount.current = 0; // Reset counter when switching dates
    setLoading(true);
    fetchData(dateStr);
    const interval = setInterval(() => fetchData(dateStr), 5000);
    return () => clearInterval(interval);
  }, [dateStr]); // eslint-disable-line react-hooks/exhaustive-deps

  // True OS-level fullscreen
  useEffect(() => {
    const handleChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const handleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Silently ignore — fullscreen may be blocked by permissions policy in iframes
    }
  };

  const formatWeight = (grams: number, unit: "kg" | "l" | "un") => {
    if (unit === "un") return `${grams} un`;
    if (unit === "l") return `${(grams / 1000).toFixed(1)} L`;
    return `${(grams / 1000).toFixed(2)} kg`;
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col bg-background text-foreground",
        isFullScreen ? "fixed inset-0 z-[9999]" : "h-[calc(100vh-100px)]"
      )}
    >
      {/* Header */}
      <div className={cn("flex-shrink-0 border-b border-border", isFullScreen ? "px-4 py-3" : "pb-3 mb-2")}>
        <div className="flex items-center justify-between gap-2">
          {/* Left: title + status */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 flex-shrink-0">
              <ChefHat size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight">KDS — Cozinha</h1>
                {!isToday && (
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                    isFuture
                      ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800"
                      : "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
                  )}>
                    {isFuture ? "Pré-visualização" : "Histórico"}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground text-[11px] flex items-center gap-1.5">
                <Clock size={11} />
                Atualizado às {format(lastUpdated, "HH:mm:ss", { locale: ptBR })}
                <span className="text-foreground font-semibold ml-2">
                  {recentOrders.length} pedido{recentOrders.length !== 1 ? "s" : ""}{isToday ? " ativos" : ""}
                </span>
              </p>
            </div>
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-lg border hover:bg-accent transition-colors"
              title={soundEnabled ? "Desativar som" : "Ativar som"}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button
              onClick={() => fetchData(dateStr)}
              className="p-2 bg-card hover:bg-accent rounded-lg border transition-colors"
              title="Atualizar"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={handleFullscreen}
              className={cn("p-2 rounded-lg border transition-colors", isFullScreen ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
              title={isFullScreen ? "Sair da tela cheia" : "Tela cheia (monitor)"}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        {/* Date navigator */}
        <div className="flex items-center gap-2 mt-2.5">
          <button
            onClick={goToPrevDay}
            className="p-1.5 rounded-lg border hover:bg-accent transition-colors"
            title="Dia anterior"
          >
            <ChevronLeft size={15} />
          </button>

          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <CalendarDays size={13} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold capitalize truncate">{dateLabel}</span>
          </div>

          {!isToday && (
            <button
              onClick={goToToday}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Hoje
            </button>
          )}

          <button
            onClick={goToNextDay}
            className="p-1.5 rounded-lg border hover:bg-accent transition-colors"
            title="Próximo dia"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Orders grid — auto-fill */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && recentOrders.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
            <Loader2 size={18} className="animate-spin" /> Carregando...
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 border-2 border-dashed rounded-2xl">
            <ChefHat size={36} className="opacity-20" />
            <p className="text-sm">
              {isFuture
                ? "Nenhum pedido realizado para este dia ainda."
                : isToday
                ? "Sem pedidos ativos no momento."
                : "Nenhum pedido registrado nesta data."}
            </p>
          </div>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}
          >
            <AnimatePresence>
              {recentOrders.map(order => {
                const mode = MODE_CONFIG[order.consumptionMode] || MODE_CONFIG.dine_in_damasceno;
                const ModeIcon = mode.icon;
                const timeStr = order.date ? getBrazilTimeString(new Date(order.date)) : "";
                const isMarmita = order.consumptionMode === "takeout_external";

                return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={cn(
                      "bg-card rounded-xl border-2 shadow-sm flex flex-col overflow-hidden",
                      isMarmita
                        ? "border-orange-400 dark:border-orange-500 shadow-orange-200 dark:shadow-orange-900/30"
                        : order.status === "Em Preparo"
                        ? "border-amber-400/60 dark:border-amber-600/40"
                        : order.status === "Pronto"
                        ? "border-violet-400/60 dark:border-violet-600/40"
                        : "border-border"
                    )}
                  >
                    {/* Marmita banner */}
                    {isMarmita && (
                      <div className="flex items-center gap-1.5 bg-orange-500 dark:bg-orange-600 px-2.5 py-1">
                        <Package size={11} className="text-white" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white">Marmita</span>
                      </div>
                    )}

                    {/* Card header */}
                    <div className={cn(
                      "px-2.5 py-1.5 flex items-center justify-between gap-1 border-b",
                      isMarmita
                        ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
                        : order.status === "Em Preparo"
                        ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                        : order.status === "Pronto"
                        ? "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800"
                        : "bg-muted/30"
                    )}>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-bold text-xs text-foreground truncate max-w-[100px]" title={order.userName}>
                          {order.userName || "—"}
                        </span>
                        {order.userDietaryRestrictions && (
                          <span title={order.userDietaryRestrictions} className="shrink-0">
                            <AlertTriangle size={12} className="text-amber-500" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isMarmita && <ModeIcon size={11} className="text-muted-foreground" />}
                        <span className="text-[10px] text-muted-foreground font-mono">{timeStr}</span>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="flex-1 px-2.5 py-2 space-y-1">
                      {(order.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-1.5 text-xs leading-tight">
                          <span className="font-black text-primary shrink-0 text-[11px]">{item.quantity}×</span>
                          <span className="text-foreground font-medium">{item.name}</span>
                        </div>
                      ))}
                    </div>

                    {/* Dietary restriction banner */}
                    {order.userDietaryRestrictions && (
                      <div className="mx-2.5 mb-1.5 flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border border-amber-200 dark:border-amber-800">
                        <AlertTriangle size={10} className="text-amber-500 shrink-0" />
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 truncate">{order.userDietaryRestrictions}</span>
                      </div>
                    )}

                    {/* Status pill */}
                    <div className="px-2.5 pb-2">
                      <span className={cn("inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border", STATUS_COLORS[order.status] || STATUS_COLORS.Confirmado)}>
                        {order.status}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Substitutions bar — Ovo / Omelete */}
      {(() => {
        const SUBSTITUTION_KEYWORDS = ["ovo", "omelete"];
        const substitutions = recentOrders
          .filter((order) =>
            (order.items || []).some((item: any) =>
              SUBSTITUTION_KEYWORDS.some((kw) =>
                (item.name || "").toLowerCase().includes(kw)
              )
            )
          )
          .map((order) => ({
            id: order.id,
            name: order.userName || "—",
            items: (order.items || [])
              .filter((item: any) =>
                SUBSTITUTION_KEYWORDS.some((kw) =>
                  (item.name || "").toLowerCase().includes(kw)
                )
              )
              .map((item: any) => `${item.quantity || 1}x ${item.name}`),
          }));

        if (substitutions.length === 0) return null;

        return (
          <div
            className={cn(
              "bg-amber-500 text-white flex-shrink-0 z-50",
              isFullScreen
                ? "border-t border-amber-300/30 px-3 py-2"
                : "mx-0 px-3 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-white/20 rounded-lg shadow-inner">
                  <Egg size={14} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xs font-extrabold uppercase tracking-wide leading-none">
                    Substituicoes
                  </h2>
                  <span className="text-[10px] font-medium opacity-80">
                    Pedidos com Ovo / Omelete
                  </span>
                </div>
              </div>
              <div className="bg-white/15 px-2 py-0.5 rounded-full text-[10px] font-bold border border-white/20 flex items-center gap-1.5">
                <ArrowRightLeft size={10} />
                {substitutions.length} pedido{substitutions.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* List */}
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
              {substitutions.map((sub) => (
                <div
                  key={sub.id}
                  className="bg-white/15 rounded-xl px-3 py-2 border border-white/10 backdrop-blur-md min-w-[160px] max-w-[220px] shrink-0"
                >
                  <p className="font-black text-sm text-white leading-tight truncate">
                    {sub.name}
                  </p>
                  <div className="mt-0.5 space-y-0.5">
                    {sub.items.map((item: string, idx: number) => (
                      <p
                        key={idx}
                        className="text-[11px] font-semibold text-white/85 truncate flex items-center gap-1"
                      >
                        <Egg size={10} className="opacity-70 shrink-0" />
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Footer — Production balance: 2-row grid */}
      <div className={cn(
        "bg-primary text-primary-foreground flex-shrink-0 z-50",
        isFullScreen ? "border-t border-primary-foreground/20 p-3" : "rounded-t-2xl mx-0 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
      )}>
        {/* Footer header */}
        <div className="flex items-center justify-between mb-2 px-0.5">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-white/20 rounded-lg animate-pulse shadow-inner">
              <Scale size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-xs font-extrabold uppercase tracking-wide leading-none">Balanço de Produção</h2>
              <span className="text-[10px] font-medium opacity-75">
                {isToday ? "Total Consolidado (Tempo Real)" : `Projeção para ${format(selectedDate, "dd/MM", { locale: ptBR })}`}
              </span>
            </div>
          </div>
          <div className="bg-white/10 px-2 py-0.5 rounded-full text-[10px] font-bold border border-white/20 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {items.length} itens
          </div>
        </div>

        {/* Items grid — 2 rows, auto columns */}
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-white/50 italic text-xs bg-white/5 rounded-xl border border-white/10 border-dashed gap-2">
            <Clock size={16} className="opacity-50" />
            <span>Aguardando início da produção...</span>
          </div>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
          >
            {items.map(item => (
              <div
                key={item.itemId}
                className="bg-gradient-to-br from-white/15 to-white/5 rounded-xl p-2.5 border border-white/10 backdrop-blur-md shadow relative overflow-hidden group hover:bg-white/20 transition-colors"
              >
                {/* Decor */}
                <div className="absolute -right-3 -bottom-3 opacity-[0.07] rotate-12">
                  <ChefHat size={50} />
                </div>

                <div className="relative z-10">
                  {/* Item name — LARGE for visibility */}
                  <p className="font-black text-base text-white leading-tight mb-1 line-clamp-2" title={item.name}>
                    {item.name}
                  </p>

                  {/* Category tag — below name */}
                  <span className={cn(
                    "inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mb-2",
                    CATEGORY_COLORS[item.category] || "bg-black/20 text-white/80"
                  )}>
                    {item.category || "Geral"}
                  </span>

                  {/* Quantity */}
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black tracking-tighter leading-none drop-shadow-sm">
                      {item.totalQuantity}
                    </span>
                    <span className="text-[10px] font-medium opacity-60">porções</span>
                  </div>

                  {/* Weight */}
                  {item.portionWeight > 0 && (
                    <div className="flex items-center gap-1 mt-1 pt-1 border-t border-white/10">
                      <Scale size={9} className="opacity-70" />
                      <span className="text-[10px] font-mono opacity-90">
                        {formatWeight(item.totalWeight, item.kitchenUnit)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}