import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { Users, Utensils, CheckCircle, Loader2, AlertCircle, Clock, UserX, Crown, RefreshCw, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { api } from "../../lib/api";
import { getBrazilTimeString } from "../../lib/date-utils";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/Button";

interface DashboardData {
  todayOrdersCount: number;
  todayManualLogsCount?: number;
  uniqueUsersOrdered: number;
  topItems: { name: string; count: number; category: string }[];
  weekData: { name: string; date: string; orders: number; items: number }[];
  lastOrders: any[];
  abstentions: { userId: string; userName: string; date: string }[];
  allOrdersCount: number;
}

interface UserInfo {
  id: string;
  email: string;
  user_metadata?: { name?: string; department?: string };
}

export function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rankingCategory, setRankingCategory] = useState<string>("Todos");

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const [dashboard, users] = await Promise.all([
        api.authGet("/admin/dashboard"),
        api.authGet("/admin/users"),
      ]);
      setData(dashboard);
      setAllUsers(Array.isArray(users) ? users : []);
    } catch (e: any) {
      console.error("Dashboard error:", e);
      setError(e.message || "Erro desconhecido ao carregar dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 60000); // Auto-refresh every 60s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 max-w-5xl">
        <div className="animate-pulse space-y-1">
          <div className="h-6 bg-muted rounded w-48" />
          <div className="h-3.5 bg-muted rounded w-64" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse space-y-3">
              <div className="h-4 bg-muted rounded w-24" />
              <div className="h-8 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse space-y-3">
              <div className="h-4 bg-muted rounded w-32" />
              <div className="h-[180px] bg-muted rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium">{error || "Erro ao carregar dashboard"}</p>
        <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchData(); }} className="gap-2">
          <RefreshCw size={14} />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const topItem = data.topItems[0];

  // Users who haven't ordered today — use full set from backend (not limited to 20)
  const orderedUserIds = new Set(data.orderedUserIds || data.lastOrders.filter((o: any) => !o.isManualLog).map((o: any) => o.userId));
  const abstainedUserIds = new Set(data.abstentions.map(a => a.userId));
  const usersNotOrdered = allUsers.filter(u =>
    !orderedUserIds.has(u.id) && !abstainedUserIds.has(u.id)
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Dashboard Geral</h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">
            Pedidos do dia - {today.charAt(0).toUpperCase() + today.slice(1)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing} className="gap-2">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Atualizar
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pedidos Hoje</CardTitle>
            <Utensils className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{data.todayOrdersCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              pedidos realizados
              {(data.todayManualLogsCount ?? 0) > 0 && (
                <span className="ml-2 text-blue-500 font-semibold">
                  + {data.todayManualLogsCount} reg.
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pessoas que Pediram</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{data.uniqueUsersOrdered}</div>
            <p className="text-xs text-muted-foreground mt-1">de {allUsers.length} cadastrados</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Item Mais Pedido</CardTitle>
            <Crown className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-foreground truncate">{topItem?.name || "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {topItem ? `${topItem.count} pedidos` : "Sem dados"}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Ainda Não Pediram</CardTitle>
            <UserX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{usersNotOrdered.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              + {data.abstentions.length} abstiveram
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts + Lists */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Weekly Bar Chart */}
        <Card className="lg:col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>Pratos Enviados na Semana</CardTitle>
            <CardDescription>Total de pratos servidos por dia (últimos 7 dias)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weekData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'var(--card)', color: 'var(--card-foreground)' }}
                    formatter={(value: any) => [`${value} pratos`, 'Quantidade']}
                  />
                  <Bar dataKey="items" fill="var(--primary)" radius={[6, 6, 0, 0]} barSize={36} name="Pratos" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Items */}
        <Card className="lg:col-span-3 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Ranking do Dia</CardTitle>
                <CardDescription>Itens mais pedidos hoje</CardDescription>
              </div>
            </div>
            {/* Category filter chips */}
            {data.topItems.length > 0 && (() => {
              const cats = Array.from(new Set(data.topItems.map(i => i.category).filter(Boolean)));
              if (cats.length <= 1) return null;
              return (
                <div className="flex gap-1.5 overflow-x-auto pt-2 pb-1">
                  <button
                    onClick={() => setRankingCategory("Todos")}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all whitespace-nowrap",
                      rankingCategory === "Todos"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-accent text-muted-foreground"
                    )}
                  >
                    Todos
                  </button>
                  {cats.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setRankingCategory(cat)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all whitespace-nowrap",
                        rankingCategory === cat
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-accent text-muted-foreground"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              );
            })()}
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.topItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum pedido hoje</p>
              )}
              {data.topItems
                .filter(item => rankingCategory === "Todos" || item.category === rankingCategory)
                .slice(0, 8).map((item, i) => (
                <div key={`${item.name}-${i}`} className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs",
                    i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                    i === 1 ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" :
                    i === 2 ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" :
                    "bg-accent text-muted-foreground"
                  )}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{item.category}</p>
                  </div>
                  <span className="font-bold text-foreground tabular-nums">{item.count}x</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last Orders + Not Ordered */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock size={18} className="text-primary" />
              Últimos Pedidos
            </CardTitle>
            <CardDescription>Pedidos mais recentes de hoje</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {realLastOrders.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum pedido ainda</p>
              )}
              {realLastOrders.map((order: any, idx: number) => (
                <div key={order.id || `order-${idx}`} className="flex items-center gap-3 p-3 rounded-xl bg-accent/30 border border-border/50">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {(order.userName || "U").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{order.userName || "Usuário"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(order.items || []).map((i: any) => i.name).join(", ") || "Sem itens"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {order.date ? getBrazilTimeString(new Date(order.date)) : "—"}
                    </span>
                    <Badge className={cn("text-[9px] px-1.5 py-0",
                      order.status === "Confirmado" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      order.status === "Em Preparo" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      order.status === "Pronto" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                    )}>{order.status || "Pendente"}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserX size={18} className="text-red-500" />
              Não Realizaram Pedido Hoje
            </CardTitle>
            <CardDescription>
              {usersNotOrdered.length} colaboradores sem pedido
              {data.abstentions.length > 0 && ` | ${data.abstentions.length} abstiveram`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {data.abstentions.map((a) => (
                <div key={a.userId} className="flex items-center gap-3 p-2 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800">
                  <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 font-bold text-xs">
                    {a.userName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-foreground flex-1 truncate">{a.userName}</span>
                  <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800 text-[10px]">Absteve-se</Badge>
                </div>
              ))}
              {usersNotOrdered.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                  <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500 font-bold text-xs">
                    {(u.user_metadata?.name || u.email || "U").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate block">
                      {u.user_metadata?.name || u.email?.split('@')[0]}
                    </span>
                    {u.user_metadata?.department && (
                      <span className="text-[10px] text-muted-foreground">{u.user_metadata.department}</span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-red-500 border-red-200 dark:border-red-800 text-[10px]">Sem pedido</Badge>
                </div>
              ))}
              {usersNotOrdered.length === 0 && data.abstentions.length === 0 && (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <CheckCircle size={32} className="mb-2 text-green-500" />
                  <p className="text-sm font-medium">Todos fizeram pedido!</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}