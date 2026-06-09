import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { ShoppingBag, Utensils, Users, Filter, Loader2, Download, CalendarCheck, Building2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { getBrazilDateString } from "../../lib/date-utils";

const COLORS = ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#ec4899"];

type FilterPeriod = "today" | "week" | "month" | "custom";

export function AdminReports() {
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<FilterPeriod>("week");
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [units, setUnits] = useState<string[]>([]);
  const [balanceDate, setBalanceDate] = useState(getBrazilDateString());

  useEffect(() => {
    Promise.all([
      api.authGet("/admin/orders").catch(e => { console.error(e); toast.error("Erro ao carregar pedidos."); return []; }),
      api.get("/admin/settings").catch(() => ({})),
    ]).then(([ordersData, settingsData]) => {
      setAllOrders(Array.isArray(ordersData) ? ordersData : []);
      if (settingsData?.units) {
        const unitNames = Array.isArray(settingsData.units)
          ? settingsData.units.map((u: any) => (typeof u === "string" ? u : u.name))
          : [];
        setUnits(unitNames);
      }
    }).finally(() => setLoading(false));
  }, []);

  const filteredOrders = useMemo(() => {
    const now = new Date();
    let startDate: Date, endDate: Date;

    switch (period) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case "week":
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case "month":
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case "custom":
        startDate = new Date(customStart);
        endDate = new Date(customEnd + "T23:59:59");
        break;
      default:
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
    }

    return allOrders.filter(o => {
      if (!o.date || o.isManualLog) return false;
      const orderDate = new Date(o.date);
      return isWithinInterval(orderDate, { start: startDate, end: endDate });
    });
  }, [allOrders, period, customStart, customEnd]);

  const stats = useMemo(() => {
    const allItems = filteredOrders.flatMap((o: any) => o.items || []);
    let filteredItems = allItems;
    if (categoryFilter !== "Todas") {
      filteredItems = allItems.filter((i: any) => i.category === categoryFilter);
    }

    const itemMap: Record<string, { name: string; count: number; category: string; calories: number }> = {};
    filteredItems.forEach((item: any) => {
      const qty = item.quantity || 1;
      if (itemMap[item.id]) {
        itemMap[item.id].count += qty;
      } else {
        itemMap[item.id] = { name: item.name, count: qty, category: item.category || '', calories: item.calories || 0 };
      }
    });
    const topItems = Object.values(itemMap).sort((a, b) => b.count - a.count);

    const catMap: Record<string, number> = {};
    filteredItems.forEach((item: any) => {
      const cat = item.category || 'Outros';
      catMap[cat] = (catMap[cat] || 0) + (item.quantity || 1);
    });
    const catData = Object.entries(catMap).map(([name, value]) => ({ name, value }));

    const dayMap: Record<string, number> = {};
    filteredOrders.forEach((o: any) => {
      if (!o.date) return;
      const dateStr = o.date.split('T')[0];
      const items = (o.items || []).filter((i: any) => categoryFilter === "Todas" || i.category === categoryFilter);
      dayMap[dateStr] = (dayMap[dateStr] || 0) + items.reduce((s: number, i: any) => s + (i.quantity || 1), 0);
    });
    const dailyData = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({
        name: format(new Date(date), "dd/MM"),
        count,
      }));

    const uniqueUsers = new Set(filteredOrders.map((o: any) => o.userId));
    const totalCal = filteredItems.reduce((acc: number, i: any) => acc + (i.calories || 0) * (i.quantity || 1), 0);

    return { topItems, catData, dailyData, totalOrders: filteredOrders.length, uniqueUsers: uniqueUsers.size, totalCalories: totalCal, totalItems: filteredItems.reduce((acc: number, i: any) => acc + (i.quantity || 1), 0) };
  }, [filteredOrders, categoryFilter]);

  const handleExportCSV = () => {
    if (stats.topItems.length === 0) { toast.info("Sem dados para exportar."); return; }
    const header = "Posição,Item,Categoria,Quantidade\n";
    const rows = stats.topItems.map((item, i) => `${i + 1},"${item.name}","${item.category}",${item.count}`).join("\n");
    const csv = header + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${period}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  const handleExportFullCSV = () => {
    if (filteredOrders.length === 0) { toast.info("Sem pedidos para exportar."); return; }
    const header = "Data,Usuário,Status,Local,Item,Quantidade,Calorias\n";
    const rows = filteredOrders.flatMap((o: any) =>
      (o.items || []).map((item: any) =>
        `"${o.date?.split('T')[0] || ''}","${o.userName || ''}","${o.status || ''}","${o.consumptionMode || ''}","${item.name}",${item.quantity || 1},${(item.calories || 0) * (item.quantity || 1)}`
      )
    ).join("\n");
    const csv = header + rows;
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos-completo-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório completo exportado!");
  };

  // ---- Daily Balance ----
  const dailyBalance = useMemo(() => {
    const targetDate = balanceDate;
    const todayOrders = allOrders.filter(o => {
      if (!o.date) return false;
      const orderDate = o.date.split("T")[0];
      return orderDate === targetDate;
    });

    const balanceMap: Record<string, Record<string, number>> = {};
    const activeUnits = new Set<string>();

    todayOrders.forEach((order: any) => {
      const unit = order.lunchUnit || "Sem unidade";
      activeUnits.add(unit);
      (order.items || []).forEach((item: any) => {
        const cat = item.category || "Outros";
        const qty = item.quantity || 1;
        if (!balanceMap[cat]) balanceMap[cat] = {};
        balanceMap[cat][unit] = (balanceMap[cat][unit] || 0) + qty;
      });
    });

    const allUnits = [...new Set([...units, ...activeUnits])].filter(Boolean);

    const rows = Object.entries(balanceMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, unitCounts]) => {
        const total = Object.values(unitCounts).reduce((s, v) => s + v, 0);
        return { category, unitCounts, total };
      });

    const unitTotals: Record<string, number> = {};
    allUnits.forEach(u => { unitTotals[u] = 0; });
    rows.forEach(r => {
      Object.entries(r.unitCounts).forEach(([u, c]) => {
        unitTotals[u] = (unitTotals[u] || 0) + c;
      });
    });
    const grandTotal = Object.values(unitTotals).reduce((s, v) => s + v, 0);

    return { rows, allUnits, unitTotals, grandTotal, totalOrders: todayOrders.length };
  }, [allOrders, units, balanceDate]);

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const allCategories = ["Todas", ...new Set(allOrders.flatMap(o => (o.items || []).map((i: any) => i.category)).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Relatórios</h1>
          <p className="text-muted-foreground text-sm">Análise detalhada com filtros avançados.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} className="gap-2">
            <Download size={16} /> Ranking CSV
          </Button>
          <Button variant="outline" onClick={handleExportFullCSV} className="gap-2">
            <Download size={16} /> Pedidos Completo
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Período</label>
              <div className="flex gap-1">
                {(["today", "week", "month", "custom"] as FilterPeriod[]).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      period === p ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent text-foreground"
                    }`}>
                    {p === "today" ? "Hoje" : p === "week" ? "Semana" : p === "month" ? "Mês" : "Personalizado"}
                  </button>
                ))}
              </div>
            </div>
            {period === "custom" && (
              <div className="flex gap-2 items-end">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">De</label>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                    className="px-3 py-1.5 border rounded-lg text-sm bg-background text-foreground" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Até</label>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-3 py-1.5 border rounded-lg text-sm bg-background text-foreground" />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm bg-background text-foreground">
                {allCategories.map((c, i) => <option key={`cat-${i}-${c}`} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Pedidos</CardTitle>
            <ShoppingBag className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.totalOrders}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pratos Servidos</CardTitle>
            <Utensils className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.totalItems}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Usuários Únicos</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.uniqueUsers}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Calorias Totais</CardTitle>
            <Filter className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{(stats.totalCalories / 1000).toFixed(1)}k</div>
            <p className="text-xs text-muted-foreground">kcal consumidas</p>
          </CardContent>
        </Card>
      </div>

      {/* ---- Daily Balance Section ---- */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md shrink-0">
                <CalendarCheck size={20} />
              </div>
              <div>
                <CardTitle>Balanco do Dia</CardTitle>
                <CardDescription>
                  Refeicoes pedidas por categoria e unidade
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Data:</label>
              <input
                type="date"
                value={balanceDate}
                onChange={(e) => setBalanceDate(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm bg-background text-foreground"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {dailyBalance.rows.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Utensils className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="font-medium">Nenhuma refeicao registrada</p>
              <p className="text-xs mt-1">Nao ha pedidos para {format(new Date(balanceDate + "T12:00:00"), "dd 'de' MMMM", { locale: ptBR })}.</p>
            </div>
          ) : (
            <>
              {/* Summary badges */}
              <div className="flex flex-wrap gap-3 mb-5">
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5">
                  <Utensils className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400">Total Refeicoes</p>
                    <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">{dailyBalance.grandTotal}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2.5">
                  <ShoppingBag className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-blue-600 dark:text-blue-400">Pedidos</p>
                    <p className="text-xl font-extrabold text-blue-700 dark:text-blue-300 tabular-nums">{dailyBalance.totalOrders}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl px-4 py-2.5">
                  <Building2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-violet-600 dark:text-violet-400">Unidades</p>
                    <p className="text-xl font-extrabold text-violet-700 dark:text-violet-300 tabular-nums">{dailyBalance.allUnits.length}</p>
                  </div>
                </div>
              </div>

              {/* Balance Table */}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-accent">
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Categoria
                      </th>
                      {dailyBalance.allUnits.map(unit => (
                        <th key={unit} className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                          {unit}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dailyBalance.rows.map((row) => (
                      <tr key={row.category} className="hover:bg-accent/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                          {row.category}
                        </td>
                        {dailyBalance.allUnits.map(unit => (
                          <td key={unit} className="px-4 py-3 text-center tabular-nums text-foreground">
                            {row.unitCounts[unit] || 0}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center font-bold tabular-nums text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10">
                          {row.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-accent/80 border-t-2 border-border">
                      <td className="px-4 py-3 font-extrabold text-foreground uppercase text-xs tracking-wider">
                        Total Geral
                      </td>
                      {dailyBalance.allUnits.map(unit => (
                        <td key={unit} className="px-4 py-3 text-center font-bold tabular-nums text-foreground">
                          {dailyBalance.unitTotals[unit] || 0}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center font-extrabold tabular-nums text-lg text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10">
                        {dailyBalance.grandTotal}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>Volume Diário</CardTitle>
            <CardDescription>Quantidade de pratos servidos por dia</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'var(--card)', color: 'var(--card-foreground)' }} />
                  <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Pratos" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm">
          <CardHeader>
            <CardTitle>Por Categoria</CardTitle>
            <CardDescription>Distribuição de pratos servidos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.catData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                    {stats.catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: 'var(--card)', color: 'var(--card-foreground)' }} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Items Table */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Ranking de Itens</CardTitle>
          <CardDescription>Itens mais pedidos no período selecionado</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-accent text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-right">Quantidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.topItems.slice(0, 15).map((item, i) => (
                  <tr key={`${item.name}-${i}`} className="hover:bg-accent/50">
                    <td className="px-4 py-3 font-bold text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 font-bold text-foreground">{item.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-foreground">{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.topItems.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">Nenhum dado para o período selecionado.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}