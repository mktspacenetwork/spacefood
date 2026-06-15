import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import {
  Loader2, Download, Utensils, CheckCircle2, Percent, UserX,
  Trophy, TrendingDown, CalendarX, Ban, CalendarOff, Egg, CalendarRange, AlertTriangle, ClipboardCheck,
  UserPlus,
} from "lucide-react";
import { api } from "../../lib/api";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

type FilterPeriod = "today" | "week" | "month" | "custom";

interface UserRow {
  userId: string;
  userName: string;
  email: string;
  department: string;
  lunchLocation: string;
  orders: number;
  registros: number;
  ate: number;
  noShow: number;
  cancellations: number;
  abstentions: number;
  substitutions: number;
  daysActive: number;
}

interface NeverRow {
  userId: string;
  name: string;
  email: string;
  department: string;
  lunchLocation: string;
  createdAt: string;
}

interface AteWithoutOrderRow {
  userId: string;
  userName: string;
  email: string;
  department: string;
  lunchLocation: string;
  count: number;
  dates: string[];
}

interface ReportData {
  from: string;
  to: string;
  days: number;
  perUser: UserRow[];
  neverOrdered: NeverRow[];
  ateWithoutOrder: AteWithoutOrderRow[];
  totals: {
    orders: number; registros: number; ate: number; noShow: number;
    cancellations: number; abstentions: number; substitutions: number;
    totalUsers: number; neverOrdered: number; ateWithoutOrder: number;
  };
}

type RankKey = "orders" | "leastOrders" | "noShow" | "cancellations" | "abstentions" | "daysActive" | "substitutions";

const RANKINGS: { key: RankKey; label: string; icon: any; field: keyof UserRow; color: string; desc: string }[] = [
  { key: "orders", label: "Mais pedem", icon: Trophy, field: "orders", color: "text-amber-500", desc: "Quem mais fez pedidos" },
  { key: "leastOrders", label: "Menos pedem", icon: TrendingDown, field: "orders", color: "text-sky-500", desc: "Entre quem pediu ao menos 1x" },
  { key: "noShow", label: "Pediu e não comeu", icon: CalendarX, field: "noShow", color: "text-red-500", desc: "Pediu mas não fez check-in" },
  { key: "cancellations", label: "Cancelamentos", icon: Ban, field: "cancellations", color: "text-orange-500", desc: "Quem mais cancela" },
  { key: "abstentions", label: "Abstenções", icon: CalendarOff, field: "abstentions", color: "text-violet-500", desc: "Quem mais avisa que não vai almoçar" },
  { key: "daysActive", label: "Assiduidade", icon: CalendarRange, field: "daysActive", color: "text-emerald-500", desc: "Dias distintos com pedido/registro" },
  { key: "substitutions", label: "Substituições", icon: Egg, field: "substitutions", color: "text-yellow-600", desc: "Pedidos com ovo / omelete" },
];

export function AdminCheckinReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<FilterPeriod>("month");
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activeRank, setActiveRank] = useState<RankKey>("orders");
  const [sortField, setSortField] = useState<keyof UserRow>("orders");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const range = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date;
    switch (period) {
      case "today": start = now; end = now; break;
      case "week": start = startOfWeek(now, { weekStartsOn: 1 }); end = endOfWeek(now, { weekStartsOn: 1 }); break;
      case "month": start = startOfMonth(now); end = endOfMonth(now); break;
      case "custom": start = new Date(customStart + "T12:00:00"); end = new Date(customEnd + "T12:00:00"); break;
      default: start = startOfMonth(now); end = endOfMonth(now);
    }
    return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
  }, [period, customStart, customEnd]);

  useEffect(() => {
    setLoading(true);
    api.authGet(`/admin/checkin-report?from=${range.from}&to=${range.to}`)
      .then((d) => setData(d))
      .catch((e) => { console.error(e); toast.error("Erro ao carregar relatório de check-in."); })
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  const attendanceRate = data && data.totals.orders > 0
    ? Math.round((data.totals.ate - data.totals.registros) / data.totals.orders * 100)
    : 0;

  const rankedUsers = useMemo(() => {
    if (!data) return [];
    const cfg = RANKINGS.find(r => r.key === activeRank)!;
    let list = [...data.perUser];
    if (activeRank === "leastOrders") {
      list = list.filter(u => u.orders > 0).sort((a, b) => a.orders - b.orders);
    } else {
      list = list.filter(u => (u[cfg.field] as number) > 0).sort((a, b) => (b[cfg.field] as number) - (a[cfg.field] as number));
    }
    return list.slice(0, 15);
  }, [data, activeRank]);

  const sortedTable = useMemo(() => {
    if (!data) return [];
    return [...data.perUser].sort((a, b) => {
      const av = a[sortField] as number, bv = b[sortField] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [data, sortField, sortDir]);

  const toggleSort = (field: keyof UserRow) => {
    if (sortField === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const handleExportCSV = () => {
    if (!data || data.perUser.length === 0) { toast.info("Sem dados para exportar."); return; }
    const header = "Usuário,Email,Departamento,Unidade,Pedidos,Registros,Comeu,Não compareceu,Cancelamentos,Abstenções,Substituições,Dias ativos\n";
    const rows = data.perUser.map(u =>
      `"${u.userName}","${u.email}","${u.department}","${u.lunchLocation}",${u.orders},${u.registros},${u.ate},${u.noShow},${u.cancellations},${u.abstentions},${u.substitutions},${u.daysActive}`
    ).join("\n");
    const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-checkin-${range.from}_a_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  const rankCfg = RANKINGS.find(r => r.key === activeRank)!;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Relatório de Check-in
          </h1>
          <p className="text-muted-foreground text-sm">Pedido × comparecimento e comportamento por período.</p>
        </div>
        <Button variant="outline" onClick={handleExportCSV} className="gap-2">
          <Download size={16} /> Exportar CSV
        </Button>
      </div>

      {/* Period filter */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Período</label>
              <div className="flex gap-1">
                {(["today", "week", "month", "custom"] as FilterPeriod[]).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={cn("px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                      period === p ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent text-foreground")}>
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
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !data ? (
        <p className="text-center py-16 text-muted-foreground">Sem dados para o período.</p>
      ) : (
        <>
          {/* Caveat */}
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <p>"Comeu" depende do check-in ter sido registrado pela equipe na tela de Check-in. Onde o check-in não foi feito, a pessoa aparece como "não compareceu" mesmo que tenha almoçado. Registros da Taipas já contam como comeu.</p>
          </div>

          {/* KPI cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-sm border-l-4 border-l-primary">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pedidos (Damasceno)</CardTitle>
                <Utensils className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{data.totals.orders}</div>
                <p className="text-xs text-muted-foreground mt-1">+ {data.totals.registros} registros Taipas</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-l-4 border-l-emerald-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Efetivamente Comeram</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{data.totals.ate}</div>
                <p className="text-xs text-muted-foreground mt-1">{data.totals.noShow} não compareceram</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-l-4 border-l-blue-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Taxa Comparecimento</CardTitle>
                <Percent className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{attendanceRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">dos pedidos Damasceno</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-l-4 border-l-red-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Nunca Pediram</CardTitle>
                <UserX className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{data.totals.neverOrdered}</div>
                <p className="text-xs text-muted-foreground mt-1">de {data.totals.totalUsers} cadastrados</p>
              </CardContent>
            </Card>
            {data.totals.ateWithoutOrder > 0 && (
              <Card className="shadow-sm border-l-4 border-l-orange-500">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Comeram sem Pedido</CardTitle>
                  <UserPlus className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{data.totals.ateWithoutOrder}</div>
                  <p className="text-xs text-muted-foreground mt-1">{data.ateWithoutOrder.length} {data.ateWithoutOrder.length === 1 ? "pessoa" : "pessoas"} adicionadas pelo admin</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Rankings */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <rankCfg.icon className={cn("h-5 w-5", rankCfg.color)} />
                {rankCfg.label}
              </CardTitle>
              <CardDescription>{rankCfg.desc}</CardDescription>
              <div className="flex gap-1.5 flex-wrap pt-2">
                {RANKINGS.map(r => (
                  <button key={r.key} onClick={() => setActiveRank(r.key)}
                    className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all",
                      activeRank === r.key ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-accent text-muted-foreground")}>
                    <r.icon size={12} />
                    {r.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {rankedUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sem dados neste ranking.</p>}
                {rankedUsers.map((u, i) => (
                  <div key={u.userId} className="flex items-center gap-3">
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0",
                      i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      i === 1 ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" :
                      i === 2 ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" :
                      "bg-accent text-muted-foreground")}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{u.userName}</p>
                      {u.department && <p className="text-[10px] text-muted-foreground truncate">{u.department}</p>}
                    </div>
                    <span className={cn("font-bold tabular-nums", rankCfg.color)}>
                      {activeRank === "leastOrders" ? u.orders : (u[rankCfg.field] as number)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Main table: Pediu × Comeu */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Pediu × Comeu (por pessoa)</CardTitle>
              <CardDescription>Clique nos títulos para ordenar. {data.perUser.length} pessoas com atividade no período.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-accent text-muted-foreground uppercase text-xs">
                    <tr>
                      <th className="px-3 py-3 text-left">Pessoa</th>
                      {([
                        ["orders", "Pedidos"], ["registros", "Reg."], ["ate", "Comeu"],
                        ["noShow", "Faltou"], ["cancellations", "Cancel."], ["abstentions", "Abst."],
                        ["substitutions", "Subst."], ["daysActive", "Dias"],
                      ] as [keyof UserRow, string][]).map(([field, label]) => (
                        <th key={field} className="px-3 py-3 text-right cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                          onClick={() => toggleSort(field)}>
                          {label}{sortField === field ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-right whitespace-nowrap">% Comp.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedTable.map((u) => {
                      const rate = u.orders > 0 ? Math.round(u.ate >= u.registros ? ((u.ate - u.registros) / u.orders) * 100 : 0) : null;
                      return (
                        <tr key={u.userId} className="hover:bg-accent/50">
                          <td className="px-3 py-2.5">
                            <p className="font-bold text-foreground truncate max-w-[180px]">{u.userName}</p>
                            {u.lunchLocation && <p className="text-[10px] text-muted-foreground">{u.lunchLocation}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{u.orders}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-blue-500">{u.registros || "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 font-semibold">{u.ate}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{u.noShow > 0 ? <span className="text-red-500 font-semibold">{u.noShow}</span> : "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{u.cancellations || "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{u.abstentions || "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{u.substitutions > 0 ? <span className="text-yellow-600 font-semibold">{u.substitutions}</span> : "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{u.daysActive}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {rate === null ? "—" : (
                              <Badge className={cn("text-[10px]",
                                rate >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                rate >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>
                                {rate}%
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {sortedTable.length === 0 && <p className="text-center py-8 text-muted-foreground">Nenhuma atividade no período.</p>}
              </div>
            </CardContent>
          </Card>

          {/* Ate without order */}
          {data.ateWithoutOrder.length > 0 && (
            <Card className="shadow-sm border-orange-200 dark:border-orange-900/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus size={18} className="text-orange-500" />
                  Comeram sem Pedido
                  <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs ml-1">
                    {data.totals.ateWithoutOrder} ocorrências
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Adicionados manualmente pelo admin no check-in — comeram mas não tinham pedido no sistema.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.ateWithoutOrder.map((u) => (
                    <div key={u.userId || u.userName} className="flex items-center gap-3 p-2.5 rounded-lg bg-orange-50/60 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30">
                      <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 font-bold text-xs shrink-0">
                        {(u.userName || u.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{u.userName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {u.department || u.email}
                          {u.lunchLocation && ` · ${u.lunchLocation.replace("Sede ", "")}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-orange-600">{u.count}×</p>
                        <p className="text-[10px] text-muted-foreground">
                          {u.dates.slice(-3).map(d => format(new Date(d + "T12:00:00"), "dd/MM", { locale: ptBR })).join(", ")}
                          {u.dates.length > 3 && ` +${u.dates.length - 3}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground flex items-start gap-1.5">
                  <AlertTriangle size={12} className="text-orange-500 mt-0.5 shrink-0" />
                  Estas pessoas consomem regularmente sem usar o sistema — considere orientá-las a cadastrar pedidos para melhorar o controle de insumos.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Never ordered */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserX size={18} className="text-red-500" />
                Nunca Pediram nem Registraram
              </CardTitle>
              <CardDescription>{data.neverOrdered.length} cadastrados sem nenhum pedido ou registro (histórico completo).</CardDescription>
            </CardHeader>
            <CardContent>
              {data.neverOrdered.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <CheckCircle2 size={32} className="mb-2 text-green-500" />
                  <p className="text-sm font-medium">Todos os cadastrados já usaram o sistema!</p>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 max-h-[400px] overflow-y-auto">
                  {data.neverOrdered.map((u) => (
                    <div key={u.userId} className="flex items-center gap-3 p-2.5 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                      <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500 font-bold text-xs shrink-0">
                        {(u.name || u.email || "U").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {u.department || u.email}
                          {u.createdAt && ` · desde ${format(new Date(u.createdAt), "dd/MM/yy", { locale: ptBR })}`}
                        </p>
                      </div>
                      {u.lunchLocation && <Badge variant="outline" className="text-[9px] shrink-0">{u.lunchLocation.replace("Sede ", "")}</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
