import { useState, useEffect, useMemo } from "react";
import { format, subDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Trash2, 
  Save, 
  Calendar as CalendarIcon, 
  TrendingDown, 
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed,
  Scale,
  Building2,
  AlertCircle,
  TrendingUp,
  RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { useAuth } from "../../context/auth-context";
import { useNavigate } from "react-router";

// Types
interface UnitWaste {
  unitId: string;
  unitName: string;
  systemConsumption: number; // From confirmed check-ins
  foodSent: number; // User input (kg or units)
  foodDiscarded: number; // User input (kg or units)
}

interface WasteLog {
  date: string;
  units: UnitWaste[];
  notes?: string;
  updatedBy?: string;
  updatedAt?: string;
}

interface Checkin {
  unit: string;
  confirmed: boolean;
}

export function WasteControl() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Data State
  const [units, setUnits] = useState<string[]>(["Sede Damasceno", "Sede Taipas", "Externo (Marmita)"]);
  const [wasteData, setWasteData] = useState<UnitWaste[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (user && !['admin', 'master', 'kitchen'].includes(user.role)) {
      navigate('/');
      toast.error("Acesso restrito.");
    }
  }, [user, navigate]);

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    try {
      // 1. Fetch check-ins to get system consumption
      const checkins: Checkin[] = await api.authGet(`/admin/checkins?date=${dateStr}`).catch(() => []);
      
      // 2. Fetch existing waste log
      const logs = await api.authGet(`/admin/waste?date=${dateStr}`);
      const existingLog: WasteLog | null = logs && logs.length > 0 ? logs[0] : null;

      // 3. Get units from settings (optional)
      const settings = await api.get("/admin/settings").catch(() => ({}));
      const currentUnits = Array.isArray(settings?.units) 
        ? settings.units.map((u: any) => typeof u === "string" ? u : u.name)
        : ["Sede Damasceno", "Sede Taipas", "Externo (Marmita)"];
      
      setUnits(currentUnits);

      // 4. Calculate system consumption per unit
      const consumptionPerUnit: Record<string, number> = {};
      currentUnits.forEach(u => consumptionPerUnit[u] = 0);
      
      checkins.forEach(ci => {
        if (ci.confirmed) {
          const unit = ci.unit || "Sede Damasceno"; // Fallback
          consumptionPerUnit[unit] = (consumptionPerUnit[unit] || 0) + 1;
        }
      });

      // 5. Build waste data
      const newWasteData = currentUnits.map(unitName => {
        const existingUnit = existingLog?.units?.find(u => u.unitName === unitName);
        return {
          unitId: unitName,
          unitName,
          systemConsumption: consumptionPerUnit[unitName] || 0,
          foodSent: existingUnit?.foodSent || 0,
          foodDiscarded: existingUnit?.foodDiscarded || 0,
        };
      });

      setWasteData(newWasteData);
      setNotes(existingLog?.notes || "");
    } catch (e) {
      console.error("Error fetching waste data:", e);
      toast.error("Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const payload: WasteLog = {
        date: dateStr,
        units: wasteData,
        notes,
        updatedAt: new Date().toISOString()
      };

      await api.authPost("/admin/waste", payload);
      toast.success("Dados de desperdício salvos!");
    } catch (e) {
      console.error("Error saving waste:", e);
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const updateUnitField = (unitName: string, field: 'foodSent' | 'foodDiscarded', value: number) => {
    setWasteData(prev => prev.map(u => 
      u.unitName === unitName ? { ...u, [field]: value } : u
    ));
  };

  const globalStats = useMemo(() => {
    const totalSent = wasteData.reduce((acc, u) => acc + u.foodSent, 0);
    const totalDiscarded = wasteData.reduce((acc, u) => acc + u.foodDiscarded, 0);
    const totalConsumption = wasteData.reduce((acc, u) => acc + u.systemConsumption, 0);
    const percentage = totalSent > 0 ? (totalDiscarded / totalSent) * 100 : 0;
    
    return { totalSent, totalDiscarded, totalConsumption, percentage };
  }, [wasteData]);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Trash2 className="text-primary" size={24} />
            Controle de Desperdício
            <Badge variant="outline" className="text-[10px] uppercase font-bold px-1.5 h-5 border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-900/20 whitespace-nowrap">
              Em Construção
            </Badge>
          </h1>
          <p className="text-muted-foreground text-sm">Gestão de produção e sobras por unidade operacional.</p>
        </div>
        <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
             <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
             Atualizar
           </Button>
           <Button onClick={handleSave} disabled={saving || loading} className="gap-2 font-bold shadow-lg shadow-primary/20">
             {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
             Salvar Lançamentos
           </Button>
        </div>
      </div>

      {/* Date Selector */}
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-4 bg-muted/20">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedDate(prev => subDays(prev, 1))}
                className="h-9 w-9 rounded-lg border bg-card"
              >
                <ChevronLeft size={18} />
              </Button>
              <div className="flex flex-col items-center min-w-[160px]">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-0.5">Data de Lançamento</span>
                <span className="text-lg font-bold flex items-center gap-2 text-foreground">
                  <CalendarIcon size={18} className="text-primary" />
                  {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedDate(prev => new Date(prev.setDate(prev.getDate() + 1)))}
                className="h-9 w-9 rounded-lg border bg-card"
                disabled={isSameDay(selectedDate, new Date())}
              >
                <ChevronRight size={18} />
              </Button>
            </div>
            
            <div className="hidden md:flex items-center gap-6 pr-4">
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Consumo Total</p>
                <p className="text-xl font-black text-foreground">{globalStats.totalConsumption} <span className="text-xs font-medium text-muted-foreground">un</span></p>
              </div>
              <div className="w-px h-8 bg-border/60" />
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Desperdício Global</p>
                <p className={cn(
                  "text-xl font-black tabular-nums",
                  globalStats.percentage > 15 ? "text-red-500" : "text-green-600"
                )}>
                  {globalStats.percentage.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <StatCard 
            title="Total Enviado" 
            value={globalStats.totalSent.toFixed(1)} 
            unit="kg/un" 
            icon={<TrendingUp size={20} />} 
            color="text-blue-500" 
         />
         <StatCard 
            title="Total Descartado" 
            value={globalStats.totalDiscarded.toFixed(1)} 
            unit="kg/un" 
            icon={<TrendingDown size={20} />} 
            color="text-red-500" 
         />
         <StatCard 
            title="Consumo Real" 
            value={globalStats.totalConsumption} 
            unit="pessoas" 
            icon={<UtensilsCrossed size={20} />} 
            color="text-green-500" 
         />
      </div>

      {/* Units Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse border-border/50">
              <div className="h-48 bg-muted/20" />
            </Card>
          ))
        ) : (
          wasteData.map((unit) => {
            const wastePct = unit.foodSent > 0 ? (unit.foodDiscarded / unit.foodSent) * 100 : 0;
            const isCritical = wastePct > 15;

            return (
              <Card key={unit.unitId} className={cn(
                "border-border/50 shadow-md transition-all hover:shadow-lg overflow-hidden flex flex-col",
                isCritical && "border-red-500/20"
              )}>
                <CardHeader className="bg-muted/10 border-b border-border/50 py-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 size={18} className="text-primary" />
                      {unit.unitName}
                    </CardTitle>
                    <Badge variant={isCritical ? "destructive" : "secondary"} className="h-6">
                       {wastePct.toFixed(1)}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6 flex-1 space-y-6">
                  {/* System Consumption Info */}
                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">Consumo Sistema</span>
                      <span className="text-xs text-muted-foreground font-medium">Check-ins confirmados</span>
                    </div>
                    <div className="text-2xl font-black text-primary tabular-nums">
                      {unit.systemConsumption}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Food Sent Input */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                          <Scale size={14} className="text-blue-500" />
                          Total Enviado (kg)
                        </label>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className="w-full bg-background border border-input rounded-lg px-4 py-3 font-bold text-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/20"
                          placeholder="0.0"
                          value={unit.foodSent || ''}
                          onChange={(e) => updateUnitField(unit.unitName, 'foodSent', parseFloat(e.target.value) || 0)}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground/40">KG / UN</span>
                      </div>
                    </div>

                    {/* Food Discarded Input */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                          <Trash2 size={14} className="text-red-500" />
                          Total Descartado (kg)
                        </label>
                        {isCritical && <AlertCircle size={14} className="text-red-500 animate-pulse" />}
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className={cn(
                            "w-full bg-background border border-input rounded-lg px-4 py-3 font-bold text-lg focus:ring-2 outline-none transition-all placeholder:text-muted-foreground/20",
                            isCritical ? "text-red-600 focus:ring-red-500/20 focus:border-red-500" : "focus:ring-primary/20 focus:border-primary"
                          )}
                          placeholder="0.0"
                          value={unit.foodDiscarded || ''}
                          onChange={(e) => updateUnitField(unit.unitName, 'foodDiscarded', parseFloat(e.target.value) || 0)}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground/40">KG / UN</span>
                      </div>
                    </div>
                  </div>

                  {/* Visual Waste Gauge */}
                  <div className="pt-2">
                    <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase mb-1.5">
                       <span>Eficiência da Produção</span>
                       <span>{Math.max(0, 100 - wastePct).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                       <div 
                         className={cn(
                           "h-full transition-all duration-1000",
                           wastePct > 20 ? "bg-red-500" : wastePct > 10 ? "bg-yellow-500" : "bg-green-500"
                         )}
                         style={{ width: `${Math.min(100, wastePct)}%` }}
                       />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Notes */}
      <Card className="border-border/50 shadow-md">
        <CardHeader className="py-4 border-b border-border/50">
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Observações Adicionais</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
           <textarea
             className="w-full min-h-[100px] bg-background border border-input rounded-xl p-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
             placeholder="Relate aqui motivos para desperdício atípico, sobras de eventos ou problemas de produção..."
             value={notes}
             onChange={(e) => setNotes(e.target.value)}
           />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, unit, icon, color }: { title: string; value: string | number; unit: string; icon: React.ReactNode; color: string }) {
  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center bg-muted/50", color)}>
            {icon}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{title}</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-foreground tabular-nums">{value}</span>
              <span className="text-[10px] font-bold text-muted-foreground">{unit}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}