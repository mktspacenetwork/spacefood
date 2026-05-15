import { cn, formatPhone } from "../lib/utils";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/auth-context";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PullToRefresh } from "../components/ui/PullToRefresh";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Order } from "../types";
import { api } from "../lib/api";
import { Loader2, ShoppingBag, Clock, Camera, Star, Send, Search, Filter, ChevronDown, Utensils, Flame, Beef, Wheat, Droplets, Activity, TrendingUp, Calendar, MapPin, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

const MODE_LABELS: Record<string, string> = {
  'dine_in_damasceno': 'Sede Damasceno',
  'dine_in_taipas': 'Sede Taipas',
  'takeout_external': 'Marmita / Externo',
};

const ORDERS_PER_PAGE = 10;

type TabType = 'history' | 'health';

export function Profile() {
  const { user, submitRating } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('history');

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [visibleCount, setVisibleCount] = useState(ORDERS_PER_PAGE);

  // Rating State
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingOrder, setRatingOrder] = useState<Order | null>(null);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  const fetchOrders = async () => {
    if (!user) { setLoading(false); return; }
    try {
      const data = await api.authGet("/orders");
      if (Array.isArray(data)) {
        setOrders(data.sort((a: Order, b: Order) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
    } catch (e) {
      console.warn("Error fetching orders:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [user]);

  const handleRatingSubmit = async () => {
    if (!ratingOrder || ratingStars === 0) return;
    setIsSubmittingRating(true);
    try {
      await submitRating(ratingOrder.id, ratingStars, ratingComment);
      setRatingOpen(false);
      setOrders(prev => prev.map(o => o.id === ratingOrder.id ? { ...o, rating: ratingStars, ratingComment } : o));
    } catch (e) {
      // Handled in context
    } finally {
      setIsSubmittingRating(false);
    }
  };

  // Filter logic
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = searchQuery.trim() === "" ||
        (order.items || []).some((item: any) => item.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        format(parseISO(order.date), "dd/MM/yyyy").includes(searchQuery);
      const matchesStatus = statusFilter === "Todos" || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  const visibleOrders = filteredOrders.slice(0, visibleCount);
  const hasMore = visibleCount < filteredOrders.length;

  const statuses = useMemo(() => {
    const unique = new Set(orders.map(o => o.status));
    return ["Todos", ...Array.from(unique)];
  }, [orders]);

  // Health data calculations
  const healthStats = useMemo(() => {
    if (orders.length === 0) return null;
    
    const totalCalories = orders.reduce((acc, o) => acc + o.totalCalories, 0);
    const avgCalories = Math.round(totalCalories / orders.length);
    
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalFiber = 0;
    let ordersWithNutrition = 0;
    
    orders.forEach(order => {
      let hasNutrition = false;
      (order.items || []).forEach((item: any) => {
        const qty = item.quantity || 1;
        if (item.protein) { totalProtein += item.protein * qty; hasNutrition = true; }
        if (item.carbs) { totalCarbs += item.carbs * qty; hasNutrition = true; }
        if (item.fat) { totalFat += item.fat * qty; hasNutrition = true; }
        if (item.fiber) { totalFiber += item.fiber * qty; hasNutrition = true; }
      });
      if (hasNutrition) ordersWithNutrition++;
    });
    
    const avgProtein = ordersWithNutrition > 0 ? Math.round(totalProtein / ordersWithNutrition) : 0;
    const avgCarbs = ordersWithNutrition > 0 ? Math.round(totalCarbs / ordersWithNutrition) : 0;
    const avgFat = ordersWithNutrition > 0 ? Math.round(totalFat / ordersWithNutrition) : 0;
    const avgFiber = ordersWithNutrition > 0 ? Math.round(totalFiber / ordersWithNutrition) : 0;
    
    return { totalCalories, avgCalories, avgProtein, avgCarbs, avgFat, avgFiber, ordersWithNutrition };
  }, [orders]);

  const chartData = orders.slice(0, 7).map((order) => ({
    name: format(parseISO(order.date), "dd/MM"),
    calorias: order.totalCalories,
  })).reverse();

  const macroChartData = useMemo(() => {
    if (!healthStats || healthStats.ordersWithNutrition === 0) return [];
    return [
      { name: "Proteínas", value: healthStats.avgProtein, color: "#ef4444" },
      { name: "Carboidratos", value: healthStats.avgCarbs, color: "#f59e0b" },
      { name: "Gorduras", value: healthStats.avgFat, color: "#3b82f6" },
    ].filter(d => d.value > 0);
  }, [healthStats]);

  if (!user) return null;

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'history', label: 'Histórico', icon: <ShoppingBag size={16} /> },
    { key: 'health', label: 'Saúde', icon: <Activity size={16} /> },
  ];

  return (
    <PullToRefresh onRefresh={fetchOrders}>
      <div className="space-y-6 pb-32 md:pb-12 pt-4">
        {/* User Header */}
        <div className="flex items-center gap-4">
          <div
            className="relative group cursor-pointer"
            onClick={() => navigate("/settings")}
          >
            <img
              src={user.avatar}
              alt={user.name}
              className="w-16 h-16 rounded-full border-2 border-primary object-cover group-hover:opacity-80 transition-opacity"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={20} className="text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h1
              onClick={() => navigate("/settings")}
              className="text-2xl font-bold text-foreground cursor-pointer hover:underline decoration-dashed underline-offset-4 decoration-primary/50 truncate"
            >
              {user.name}
            </h1>
            <p className="text-muted-foreground text-sm truncate">{user.email}</p>
            {(user.department || user.phone || user.lunchLocation) && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {user.lunchLocation && (
                  <span className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <MapPin size={10} className="shrink-0" />
                    {user.lunchLocation}
                  </span>
                )}
                {user.department && (
                  <span className="text-xs font-medium text-muted-foreground bg-accent px-2 py-0.5 rounded-md">
                    {user.department}
                  </span>
                )}
                {user.phone && (
                  <span className="text-xs text-muted-foreground">
                    {formatPhone(user.phone)}
                  </span>
                )}
                {user.dietaryRestrictions && (
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <AlertTriangle size={10} className="shrink-0" />
                    {user.dietaryRestrictions}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          {/* Card 1: Meals */}
          <div className="relative group overflow-hidden rounded-2xl border border-border/50 bg-background/50 p-4 transition-all hover:bg-muted/50">
            <div className="absolute top-0 right-0 p-3 opacity-[0.08] group-hover:opacity-15 group-hover:scale-110 transition-all">
              <Utensils size={40} className="text-foreground" />
            </div>
            <div className="flex flex-col relative z-10">
              <span className="text-2xl font-bold text-foreground tabular-nums tracking-tight leading-none mb-1.5">
                {orders.length}
              </span>
              <div className="flex items-center gap-1.5">
                <Utensils size={12} className="text-muted-foreground" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Refeições</p>
              </div>
            </div>
          </div>

          {/* Card 2: Avg Calories */}
          <div className="relative group overflow-hidden rounded-2xl border border-border/50 bg-background/50 p-4 transition-all hover:bg-muted/50">
            <div className="absolute top-0 right-0 p-3 opacity-[0.08] group-hover:opacity-15 group-hover:scale-110 transition-all">
              <Flame size={40} className="text-foreground" />
            </div>
            <div className="flex flex-col relative z-10">
              <span className="text-2xl font-bold text-foreground tabular-nums tracking-tight leading-none mb-1.5">
                {healthStats?.avgCalories || 0}
              </span>
              <div className="flex items-center gap-1.5">
                <Flame size={12} className="text-muted-foreground" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Média kcal</p>
              </div>
            </div>
          </div>

          {/* Card 3: Last Order */}
          <div className="relative group overflow-hidden rounded-2xl border border-border/50 bg-background/50 p-4 transition-all hover:bg-muted/50">
            <div className="absolute top-0 right-0 p-3 opacity-[0.08] group-hover:opacity-15 group-hover:scale-110 transition-all">
              <Calendar size={40} className="text-foreground" />
            </div>
            <div className="flex flex-col relative z-10">
              <span className="text-2xl font-bold text-foreground tabular-nums tracking-tight leading-none mb-1.5">
                {orders.length > 0 ? format(parseISO(orders[0].date), "dd/MM") : "-"}
              </span>
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-muted-foreground" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Último</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="relative bg-accent/50 rounded-2xl p-1.5 flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "relative flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-300",
                activeTab === tab.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              {activeTab === tab.key && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-card rounded-xl shadow-sm border border-border/50"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {tab.icon}
                {tab.label}
              </span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Filters Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Calendar className="text-primary" size={20} />
                  Pedidos
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs rounded-xl"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter size={14} />
                  Filtros
                  <ChevronDown size={12} className={cn("transition-transform", showFilters && "rotate-180")} />
                </Button>
              </div>

              {/* Filters */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-2xl border border-border bg-card">
                      <div className="flex-1 relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Buscar por item ou data..."
                          value={searchQuery}
                          onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(ORDERS_PER_PAGE); }}
                          className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                        />
                      </div>
                      <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setVisibleCount(ORDERS_PER_PAGE); }}
                        className="px-3 py-2 rounded-xl border border-border bg-background text-sm"
                      >
                        {statuses.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Order Cards */}
              <div className="space-y-3">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : visibleOrders.length > 0 ? (
                  <>
                    {visibleOrders.map((order, index) => {
                      // Compute nutritional totals per order
                      const orderProtein = (order.items || []).reduce((acc: number, item: any) => acc + (item.protein || 0) * (item.quantity || 1), 0);
                      const orderCarbs = (order.items || []).reduce((acc: number, item: any) => acc + (item.carbs || 0) * (item.quantity || 1), 0);
                      const orderFat = (order.items || []).reduce((acc: number, item: any) => acc + (item.fat || 0) * (item.quantity || 1), 0);
                      const orderFiber = (order.items || []).reduce((acc: number, item: any) => acc + (item.fiber || 0) * (item.quantity || 1), 0);
                      const hasNutrition = orderProtein > 0 || orderCarbs > 0 || orderFat > 0;

                      return (
                        <motion.div
                          key={order.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04, duration: 0.25 }}
                          className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-all hover:shadow-md"
                        >
                          {/* Order Header */}
                          <div className="flex items-center justify-between p-4 pb-3">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-foreground">
                                  {format(parseISO(order.date), "dd MMM yyyy", { locale: ptBR })}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {format(parseISO(order.date), "HH:mm")}
                                </span>
                              </div>
                              <span className="text-[10px] font-medium text-muted-foreground bg-accent px-2 py-0.5 rounded-md w-fit">
                                {MODE_LABELS[order.consumptionMode || 'dine_in_damasceno'] || 'Sede Damasceno'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {!order.rating && (
                                <button
                                  className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                                  onClick={() => {
                                    setRatingOrder(order);
                                    setRatingStars(0);
                                    setRatingComment("");
                                    setRatingOpen(true);
                                  }}
                                >
                                  <Star size={10} /> Avaliar
                                </button>
                              )}
                              {order.rating && (
                                <div className="flex items-center gap-0.5 text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
                                  <span className="text-[10px] font-bold">{order.rating}</span>
                                  <Star size={9} fill="currentColor" />
                                </div>
                              )}
                              <Badge
                                className={cn(
                                  "border-0 px-2.5 py-1 font-bold text-[10px] uppercase tracking-wider shadow-sm",
                                  order.status === "Confirmado" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                  order.status === "Em Preparo" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                                  order.status === "Pronto" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                                  order.status === "Retirado" ? "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" :
                                  order.status === "Cancelado" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                )}
                              >
                                {order.status}
                              </Badge>
                            </div>
                          </div>

                          {/* Items */}
                          <div className="px-4 pb-3">
                            <div className="flex flex-col gap-1.5">
                              {(order.items || []).map((item: any, idx: number) => (
                                <div key={`${order.id}-item-${idx}`} className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    <span className="font-bold text-foreground">{item.quantity}x</span> {item.name}
                                  </span>
                                  <span className="text-muted-foreground tabular-nums">
                                    {item.calories * item.quantity} kcal
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Nutritional Footer */}
                          <div className="border-t border-border bg-accent/20 px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <Flame size={12} className="text-orange-500" />
                                  <span className="text-xs font-bold text-foreground tabular-nums">{order.totalCalories}</span>
                                  <span className="text-[10px] text-muted-foreground">kcal</span>
                                </div>
                                {hasNutrition && (
                                  <>
                                    <div className="flex items-center gap-1">
                                      <Beef size={11} className="text-red-400" />
                                      <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{orderProtein.toFixed(0)}g</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Wheat size={11} className="text-amber-400" />
                                      <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{orderCarbs.toFixed(0)}g</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Droplets size={11} className="text-blue-400" />
                                      <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{orderFat.toFixed(0)}g</span>
                                    </div>
                                    {orderFiber > 0 && (
                                      <span className="text-[10px] text-muted-foreground tabular-nums">🌿 {orderFiber.toFixed(0)}g</span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}

                    {hasMore && (
                      <div className="flex justify-center pt-4">
                        <Button
                          variant="outline"
                          onClick={() => setVisibleCount(prev => prev + ORDERS_PER_PAGE)}
                          className="gap-2 rounded-xl"
                        >
                          Carregar mais ({filteredOrders.length - visibleCount} restantes)
                        </Button>
                      </div>
                    )}

                    {!hasMore && filteredOrders.length > ORDERS_PER_PAGE && (
                      <p className="text-center text-xs text-muted-foreground py-2">
                        Todos os {filteredOrders.length} pedidos exibidos
                      </p>
                    )}
                  </>
                ) : (
                  <div className="text-center py-16 text-muted-foreground bg-accent/20 rounded-2xl border border-border border-dashed">
                    {searchQuery || statusFilter !== "Todos" ? (
                      <>
                        <Search className="mx-auto h-12 w-12 opacity-20 mb-4" />
                        <p className="font-medium">Nenhum pedido encontrado com esses filtros.</p>
                        <Button
                          variant="link"
                          onClick={() => { setSearchQuery(""); setStatusFilter("Todos"); }}
                          className="mt-2 text-primary"
                        >
                          Limpar filtros
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="mx-auto w-20 h-20 rounded-full bg-accent flex items-center justify-center mb-4">
                          <Utensils className="h-10 w-10 text-muted-foreground/30" />
                        </div>
                        <p className="font-bold text-lg text-foreground mb-1">Nenhum pedido realizado ainda</p>
                        <p className="text-sm max-w-xs mx-auto mb-4">
                          Seu histórico de refeições aparecerá aqui. Que tal fazer seu primeiro pedido?
                        </p>
                        <Button variant="link" onClick={() => navigate("/")} className="text-primary">
                          Fazer meu primeiro pedido
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'health' && (
            <motion.div
              key="health"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Calorie Chart */}
              <Card className="rounded-2xl border-border bg-card shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <TrendingUp size={18} className="text-primary" />
                    Consumo Semanal
                  </CardTitle>
                  <CardDescription className="text-xs">Calorias dos últimos 7 pedidos</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px] w-full">
                    {loading ? (
                      <div className="h-full w-full flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : orders.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <XAxis
                            dataKey="name"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            stroke="var(--muted-foreground)"
                          />
                          <Tooltip
                            cursor={{ fill: 'transparent' }}
                            contentStyle={{
                              borderRadius: '12px',
                              border: 'none',
                              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                              backgroundColor: 'var(--card)',
                              color: 'var(--card-foreground)',
                              fontSize: '12px'
                            }}
                          />
                          <Bar
                            dataKey="calorias"
                            fill="var(--primary)"
                            radius={[8, 8, 8, 8]}
                            barSize={28}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                        Sem dados suficientes
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Macro Distribution */}
              {macroChartData.length > 0 && (
                <Card className="rounded-2xl border-border bg-card shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Activity size={18} className="text-primary" />
                      Distribuição de Macros
                    </CardTitle>
                    <CardDescription className="text-xs">Média por refeição</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6">
                      <div className="w-32 h-32 flex-shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={macroChartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={55}
                              paddingAngle={4}
                              dataKey="value"
                              strokeWidth={0}
                            >
                              {macroChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-3">
                        {macroChartData.map((macro) => (
                          <div key={macro.name} className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: macro.color }} />
                            <div className="flex-1 flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">{macro.name}</span>
                              <span className="text-sm font-bold text-foreground tabular-nums">{macro.value}g</span>
                            </div>
                          </div>
                        ))}
                        {healthStats && healthStats.avgFiber > 0 && (
                          <div className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full bg-green-500 flex-shrink-0" />
                            <div className="flex-1 flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Fibras</span>
                              <span className="text-sm font-bold text-foreground tabular-nums">{healthStats.avgFiber}g</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Nutritional Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-card p-4 flex flex-col items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                    <Flame size={20} className="text-orange-500" />
                  </div>
                  <span className="text-2xl font-bold text-foreground tabular-nums">{healthStats?.avgCalories || 0}</span>
                  <span className="text-[10px] font-medium text-muted-foreground">Média Calórica</span>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 flex flex-col items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                    <Beef size={20} className="text-red-400" />
                  </div>
                  <span className="text-2xl font-bold text-foreground tabular-nums">{healthStats?.avgProtein || 0}g</span>
                  <span className="text-[10px] font-medium text-muted-foreground">Proteína / Refeição</span>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 flex flex-col items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                    <Wheat size={20} className="text-amber-400" />
                  </div>
                  <span className="text-2xl font-bold text-foreground tabular-nums">{healthStats?.avgCarbs || 0}g</span>
                  <span className="text-[10px] font-medium text-muted-foreground">Carboidratos / Refeição</span>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 flex flex-col items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <Droplets size={20} className="text-blue-400" />
                  </div>
                  <span className="text-2xl font-bold text-foreground tabular-nums">{healthStats?.avgFat || 0}g</span>
                  <span className="text-[10px] font-medium text-muted-foreground">Gorduras / Refeição</span>
                </div>
              </div>

              {/* Total Stats */}
              <Card className="rounded-2xl border-border bg-card shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">Resumo Geral</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center p-3 rounded-xl bg-accent/30 border border-border/50">
                    <span className="text-sm text-muted-foreground">Total de Refeições</span>
                    <span className="text-lg font-bold text-foreground tabular-nums">{orders.length}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-xl bg-accent/30 border border-border/50">
                    <span className="text-sm text-muted-foreground">Calorias Totais</span>
                    <span className="text-lg font-bold text-foreground tabular-nums">
                      {healthStats?.totalCalories?.toLocaleString() || 0} <span className="text-xs font-normal text-muted-foreground">kcal</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-xl bg-accent/30 border border-border/50">
                    <span className="text-sm text-muted-foreground">Último Pedido</span>
                    <span className="text-sm font-bold text-primary">
                      {orders.length > 0 ? format(parseISO(orders[0].date), "dd 'de' MMM", { locale: ptBR }) : "-"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rating Dialog */}
        <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Avaliar Pedido</DialogTitle>
              <DialogDescription>Selecione uma nota e deixe um comentário sobre o pedido.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRatingStars(star)}
                    className={cn(
                      "p-2 rounded-full transition-all hover:scale-110",
                      ratingStars >= star ? "text-yellow-500" : "text-muted-foreground/30"
                    )}
                  >
                    <Star size={32} fill={ratingStars >= star ? "currentColor" : "none"} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
              {ratingStars > 0 && ratingStars < 4 && (
                <div className="w-full space-y-2 animate-in fade-in slide-in-from-top-2">
                  <label className="text-sm font-medium text-foreground">O que podemos melhorar?</label>
                  <textarea
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    placeholder="Conte-nos o que houve..."
                    className="w-full p-3 rounded-xl border bg-background min-h-[80px]"
                  />
                </div>
              )}
              <Button
                onClick={handleRatingSubmit}
                disabled={ratingStars === 0 || isSubmittingRating}
                className="w-full rounded-xl gap-2 mt-2"
              >
                {isSubmittingRating ? <Loader2 className="animate-spin" /> : <Send size={16} />}
                Enviar Avaliação
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}