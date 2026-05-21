import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, UserCheck, UserX,
  Search, Clock, CheckCheck, MapPin, Plus, Users, X, UserPlus
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";

interface CompanyUnit {
  name: string;
  allowOrders: boolean;
}

interface OrderForCheckin {
  id: string;
  userId: string;
  userName: string;
  date: string;
  status: string;
  items: any[];
  consumptionMode?: string;
}

interface CheckInEntry {
  orderId: string;
  userId: string;
  userName: string;
  confirmed: boolean;
  unit?: string;
  isManual?: boolean;
}

interface UserInfo {
  id: string;
  email: string;
  user_metadata?: { name?: string; department?: string; lunch_location?: string };
}

const MODE_TO_UNIT: Record<string, string> = {
  dine_in_damasceno: "Sede Damasceno",
  dine_in_taipas: "Sede Taipas",
  takeout_external: "Externo (Marmita)",
};

export function AdminCheckin() {
  const [orders, setOrders] = useState<OrderForCheckin[]>([]);
  const [checkins, setCheckins] = useState<CheckInEntry[]>([]);
  const [abstentions, setAbstentions] = useState<{ userId: string; userName: string; unit?: string }[]>([]);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [units, setUnits] = useState<CompanyUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [batchLoading, setBatchLoading] = useState(false);
  const [manualName, setManualName] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const todayLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersData, checkinsData, usersData, settingsData, abstentionData] = await Promise.all([
        api.authGet(`/admin/orders?date=${today}`),
        api.authGet(`/admin/checkins?date=${today}`),
        api.authGet("/admin/users"),
        api.get("/admin/settings"),
        api.authGet(`/admin/abstentions?date=${today}`).catch(() => []),
      ]);

      const todayOrders = (Array.isArray(ordersData) ? ordersData : [])
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setOrders(todayOrders);
      setCheckins(Array.isArray(checkinsData) ? checkinsData : []);
      setAllUsers(Array.isArray(usersData) ? usersData : []);
      setAbstentions(Array.isArray(abstentionData) ? abstentionData : []);

      // Parse units
      const rawUnits = settingsData?.units;
      let parsedUnits: CompanyUnit[] = [];
      if (Array.isArray(rawUnits) && rawUnits.length > 0) {
        if (typeof rawUnits[0] === "string") {
          parsedUnits = (rawUnits as string[]).map((u) => ({ name: u, allowOrders: true }));
        } else {
          parsedUnits = rawUnits as CompanyUnit[];
        }
      } else {
        parsedUnits = [
          { name: "Sede Damasceno", allowOrders: true },
          { name: "Sede Taipas", allowOrders: true },
          { name: "Externo (Marmita)", allowOrders: true },
        ];
      }
      setUnits(parsedUnits);
      if (!selectedUnit && parsedUnits.length > 0) {
        setSelectedUnit(parsedUnits[0].name);
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const currentUnit = units.find((u) => u.name === selectedUnit);
  const allowOrders = currentUnit ? currentUnit.allowOrders !== false : true;

  // Users belonging to this unit
  const unitUsers = useMemo(() => {
    return allUsers.filter((u) => {
      const loc = u.user_metadata?.lunch_location || "";
      return loc === selectedUnit;
    });
  }, [allUsers, selectedUnit]);

  // Orders belonging to this unit
  const unitOrders = useMemo(() => {
    return orders.filter((o) => {
      const mode = o.consumptionMode || "dine_in_damasceno";
      const unitName = MODE_TO_UNIT[mode] || "Sede Damasceno";
      return unitName === selectedUnit;
    });
  }, [orders, selectedUnit]);

  // Check-ins for this unit
  const unitCheckins = useMemo(() => {
    if (allowOrders) {
      const orderIds = new Set(unitOrders.map((o) => o.id));
      return checkins.filter((c) => orderIds.has(c.orderId) || c.unit === selectedUnit);
    }
    return checkins.filter((c) => c.unit === selectedUnit);
  }, [checkins, unitOrders, allowOrders, selectedUnit]);

  const handleCheckin = async (entry: { orderId?: string; userId: string; userName: string }, confirmed: boolean) => {
    try {
      await api.authPost("/admin/checkins", {
        orderId: entry.orderId || null,
        userId: entry.userId,
        userName: entry.userName,
        confirmed,
        unit: selectedUnit,
        isManual: !entry.orderId || !allowOrders,
      });
      setCheckins((prev) => {
        const isManual = !entry.orderId || !allowOrders;
        const existing = isManual
          ? prev.findIndex((c) => c.userId === entry.userId && c.unit === selectedUnit && c.isManual)
          : prev.findIndex((c) => c.orderId === entry.orderId);
        if (existing >= 0) {
          const copy = [...prev];
          copy[existing] = { ...copy[existing], confirmed };
          return copy;
        }
        return [...prev, {
          orderId: entry.orderId || `manual:${entry.userId}:${Date.now()}`,
          userId: entry.userId,
          userName: entry.userName,
          confirmed,
          unit: selectedUnit,
          isManual,
        }];
      });
      toast.success(confirmed ? "Presenca confirmada!" : "Ausencia registrada.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao registrar");
    }
  };

  const handleAddManual = async () => {
    const name = manualName.trim();
    if (!name) return;
    const tempId = `manual-${Date.now()}`;
    await handleCheckin({ userId: tempId, userName: name }, true);
    setManualName("");
    setShowManualInput(false);
  };

  const handleBatchConfirm = async () => {
    if (!allowOrders) {
      // Batch confirm all unit users who haven't been checked
      const unchecked = unitUsers.filter((u) => {
        return !unitCheckins.find((c) => c.userId === u.id && c.isManual);
      });
      if (unchecked.length === 0) { toast.info("Todos ja foram registrados."); return; }
      setBatchLoading(true);
      try {
        for (const u of unchecked) {
          await api.authPost("/admin/checkins", {
            userId: u.id,
            userName: u.user_metadata?.name || u.email?.split("@")[0] || "Usuario",
            confirmed: true,
            unit: selectedUnit,
            isManual: true,
          });
        }
        setCheckins((prev) => [
          ...prev,
          ...unchecked.map((u) => ({
            orderId: `manual:${u.id}:${Date.now()}`,
            userId: u.id,
            userName: u.user_metadata?.name || u.email?.split("@")[0] || "Usuario",
            confirmed: true,
            unit: selectedUnit,
            isManual: true,
          })),
        ]);
        toast.success(`${unchecked.length} presencas confirmadas em lote!`);
      } catch (e: any) {
        toast.error(e.message || "Erro no check-in em lote");
      } finally {
        setBatchLoading(false);
      }
    } else {
      const unchecked = unitOrders.filter((o) => !checkins.find((c) => c.orderId === o.id));
      if (unchecked.length === 0) { toast.info("Todos ja foram registrados."); return; }
      setBatchLoading(true);
      try {
        const entries = unchecked.map((o) => ({
          orderId: o.id,
          userId: o.userId,
          userName: o.userName || "Usuario",
          confirmed: true,
        }));
        await api.authPost("/admin/checkins/batch", { entries });
        setCheckins((prev) => [...prev, ...entries]);
        toast.success(`${entries.length} presencas confirmadas em lote!`);
      } catch (e: any) {
        toast.error(e.message || "Erro no check-in em lote");
      } finally {
        setBatchLoading(false);
      }
    }
  };

  const getCheckinStatus = (id: string, isManualEntry?: boolean, userId?: string): boolean | null => {
    if (isManualEntry && userId) {
      const ci = unitCheckins.find((c) => c.userId === userId && c.isManual);
      return ci ? ci.confirmed : null;
    }
    const ci = checkins.find((c) => c.orderId === id);
    return ci ? ci.confirmed : null;
  };

  const confirmedCount = unitCheckins.filter((c) => c.confirmed).length;
  const absentCount = unitCheckins.filter((c) => !c.confirmed).length;
  const totalInUnit = allowOrders ? unitOrders.length : unitUsers.length;
  const uncheckedCount = totalInUnit - unitCheckins.length;

  // Filtered list
  const filteredList = useMemo(() => {
    const q = searchTerm.toLowerCase();
    if (allowOrders) {
      return unitOrders.filter((o) => (o.userName || "").toLowerCase().includes(q));
    }
    return unitUsers.filter((u) => {
      const name = u.user_metadata?.name || u.email || "";
      return name.toLowerCase().includes(q);
    });
  }, [allowOrders, unitOrders, unitUsers, searchTerm]);

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Check-in de Almoco</h1>
          <p className="text-muted-foreground text-sm flex items-center gap-2">
            <Clock size={14} /> {todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBatchConfirm} disabled={batchLoading || uncheckedCount <= 0} className="gap-2">
            {batchLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
            Confirmar Todos ({Math.max(0, uncheckedCount)})
          </Button>
          <Button variant="outline" onClick={fetchData} className="gap-2"><RefreshCw size={16} /> Atualizar</Button>
        </div>
      </div>

      {/* Unit Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 px-1">
        {units.map((unit) => (
          <button
            key={unit.name}
            onClick={() => { setSelectedUnit(unit.name); setSearchTerm(""); }}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold border transition-all whitespace-nowrap flex items-center gap-2",
              selectedUnit === unit.name
                ? "bg-primary text-primary-foreground border-primary shadow-md"
                : "bg-card border-border text-muted-foreground hover:bg-accent"
            )}
          >
            <MapPin size={14} />
            {unit.name}
            {!unit.allowOrders && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 uppercase font-bold">
                Manual
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase font-medium">
              {allowOrders ? "Pedidos" : "Colaboradores"}
            </p>
            <p className="text-2xl font-bold text-foreground">{totalInUnit}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase font-medium">Confirmaram</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{confirmedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase font-medium">Nao Almocaram</p>
            <p className="text-2xl font-bold text-red-500">{absentCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase font-medium">Pendentes</p>
            <p className="text-2xl font-bold text-orange-500">{Math.max(0, uncheckedCount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Unit info banner for manual mode */}
      {!allowOrders && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
          <Users size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Unidade sem pedidos online</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              A contagem e feita manualmente. Marque a presenca de cada colaborador individualmente.
            </p>
          </div>
        </div>
      )}

      {/* Search + Manual Add */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/20 outline-none text-foreground"
          />
        </div>
        <Button variant="outline" onClick={() => setShowManualInput(!showManualInput)} className="gap-2">
          <UserPlus size={16} />
          <span className="hidden sm:inline">Adicionar Manual</span>
        </Button>
      </div>

      {/* Manual Name Input */}
      <AnimatePresence>
        {showManualInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 p-4 rounded-xl border border-border bg-card">
              <input
                type="text"
                placeholder="Nome do colaborador..."
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
                className="flex-1 px-4 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/20 outline-none text-foreground text-sm"
                autoFocus
              />
              <Button onClick={handleAddManual} disabled={!manualName.trim()} className="gap-2">
                <Plus size={16} /> Adicionar e Confirmar
              </Button>
              <Button variant="ghost" size="icon" onClick={() => { setShowManualInput(false); setManualName(""); }}>
                <X size={16} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="space-y-3">
        <AnimatePresence>
          {allowOrders ? (
            /* === Orders-based list === */
            (filteredList as OrderForCheckin[]).map((order) => {
              const status = getCheckinStatus(order.id);
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "bg-card rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm transition-colors",
                    status === true && "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10",
                    status === false && "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10"
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm",
                      status === true ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                      status === false ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
                      "bg-accent text-muted-foreground"
                    )}>
                      {(order.userName || "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground truncate">{order.userName || "Usuario"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {(order.items || []).map((i: any) => `${i.quantity}x ${i.name}`).join(", ")}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {order.date ? format(new Date(order.date), "HH:mm") : "--"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:flex-shrink-0">
                    {status !== null && (
                      <Badge className={cn("px-3 py-1 text-sm border",
                        status ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                        : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                      )}>
                        {status ? <><CheckCircle2 size={14} className="mr-1" /> Almocou</> : <><XCircle size={14} className="mr-1" /> Nao Almocou</>}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant={status === true ? "default" : "outline"}
                      onClick={() => handleCheckin({ orderId: order.id, userId: order.userId, userName: order.userName || "Usuario" }, true)}
                      className={cn("gap-1", status === true && "bg-green-600 hover:bg-green-700")}
                    >
                      <CheckCircle2 size={14} /> Sim
                    </Button>
                    <Button
                      size="sm"
                      variant={status === false ? "destructive" : "outline"}
                      onClick={() => handleCheckin({ orderId: order.id, userId: order.userId, userName: order.userName || "Usuario" }, false)}
                      className="gap-1"
                    >
                      <XCircle size={14} /> Nao
                    </Button>
                  </div>
                </motion.div>
              );
            })
          ) : (
            /* === Manual user list (no orders) === */
            (filteredList as UserInfo[]).map((user) => {
              const userName = user.user_metadata?.name || user.email?.split("@")[0] || "Usuario";
              const status = getCheckinStatus("", true, user.id);
              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "bg-card rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm transition-colors",
                    status === true && "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10",
                    status === false && "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10"
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm",
                      status === true ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                      status === false ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
                      "bg-accent text-muted-foreground"
                    )}>
                      {userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground truncate">{userName}</p>
                      {user.user_metadata?.department && (
                        <p className="text-xs text-muted-foreground">{user.user_metadata.department}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:flex-shrink-0">
                    {status !== null && (
                      <Badge className={cn("px-3 py-1 text-sm border",
                        status ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                        : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                      )}>
                        {status ? <><CheckCircle2 size={14} className="mr-1" /> Almocou</> : <><XCircle size={14} className="mr-1" /> Nao Almocou</>}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant={status === true ? "default" : "outline"}
                      onClick={() => handleCheckin({ userId: user.id, userName }, true)}
                      className={cn("gap-1", status === true && "bg-green-600 hover:bg-green-700")}
                    >
                      <CheckCircle2 size={14} /> Sim
                    </Button>
                    <Button
                      size="sm"
                      variant={status === false ? "destructive" : "outline"}
                      onClick={() => handleCheckin({ userId: user.id, userName }, false)}
                      className="gap-1"
                    >
                      <XCircle size={14} /> Nao
                    </Button>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>

        {/* Manual additions that were added for this unit */}
        {unitCheckins
          .filter((c) => c.isManual && !unitUsers.find((u) => u.id === c.userId))
          .map((c) => (
            <motion.div
              key={c.orderId}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "bg-card rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm",
                c.confirmed
                  ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10"
                  : "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10"
              )}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                  {(c.userName || "M").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground truncate">{c.userName}</p>
                  <p className="text-[10px] text-muted-foreground">Adicionado manualmente</p>
                </div>
              </div>
              <Badge className={cn("px-3 py-1 text-sm border",
                c.confirmed
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                  : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
              )}>
                {c.confirmed ? <><CheckCircle2 size={14} className="mr-1" /> Almocou</> : <><XCircle size={14} className="mr-1" /> Nao Almocou</>}
              </Badge>
            </motion.div>
          ))}

        {/* Abstentions — "Não vou almoçar" entries */}
        {abstentions
          .filter(abs => {
            // Show abstentions that belong to this unit (matched by user's lunch_location)
            const user = allUsers.find(u => u.id === abs.userId);
            const userUnit = user?.user_metadata?.lunch_location || abs.unit || "";
            return userUnit === selectedUnit || (!userUnit && selectedUnit === units[0]?.name);
          })
          .map(abs => (
            <motion.div
              key={`abs-${abs.userId}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50/30 dark:bg-orange-900/10 p-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                  {(abs.userName || "U").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground truncate">{abs.userName}</p>
                  <p className="text-[10px] text-muted-foreground">Registrou ausência voluntária</p>
                </div>
              </div>
              <Badge className="px-3 py-1 text-sm border bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800 flex items-center gap-1.5">
                <XCircle size={14} />
                Não vai almoçar
              </Badge>
            </motion.div>
          ))
        }

        {filteredList.length === 0 && abstentions.filter(abs => {
          const user = allUsers.find(u => u.id === abs.userId);
          const userUnit = user?.user_metadata?.lunch_location || abs.unit || "";
          return userUnit === selectedUnit || (!userUnit && selectedUnit === units[0]?.name);
        }).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <UserCheck size={40} className="mx-auto mb-3 opacity-30" />
            <p>
              {allowOrders
                ? "Nenhum pedido encontrado para esta unidade hoje."
                : "Nenhum colaborador cadastrado nesta unidade."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
