import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { format, addDays, startOfWeek, isSameDay, subWeeks, addWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Copy, Save, Search, Trash2, List, LayoutGrid, Printer, Loader2, UtensilsCrossed, CheckCircle, RefreshCw, RepeatIcon } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { MenuItem } from "../../types";
import { api } from "../../lib/api";
import { toast } from "sonner";

export function AdminMenu() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [menuData, setMenuData] = useState<Record<string, MenuItem[]>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", description: "", calories: 0, category: "Principal", unit: "porção", available: 100, limit: 1 });
  const [publishedDays, setPublishedDays] = useState<Set<string>>(new Set());
  // Ref mirrors publishedDays to avoid stale closure in async saveMenuDataToServer
  const publishedDaysRef = useRef<Set<string>>(new Set());
  const [categories, setCategories] = useState<string[]>(["Principal", "Guarnição", "Salada", "Sobremesa", "Bebida"]);
  // Recurring (daily) items
  const [recurringItemIds, setRecurringItemIds] = useState<Set<string>>(new Set());
  // Duplicate day: source day → picker dialog
  const [duplicateSrcDate, setDuplicateSrcDate] = useState<string | null>(null);
  const [duplicateTargetDate, setDuplicateTargetDate] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekKey = format(startDate, "yyyy-MM-dd");
  const weekDays = Array.from({ length: 6 }).map((_, i) => addDays(startDate, i));
  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const getDisplayItems = (items: MenuItem[]) => {
    if (!items) return [];
    return items.map(item => {
      const fresh = allItems.find(i => i.id === item.id);
      return fresh ? { ...item, ...fresh } : item;
    });
  };

  const dailyItems = useMemo(() => {
    const items = getDisplayItems(menuData[dateKey] || []);
    const recurringItems = allItems.filter(i => recurringItemIds.has(i.id));
    const merged = [...items];
    recurringItems.forEach(ri => {
      if (!merged.find(m => m.id === ri.id)) merged.push(ri);
    });
    return merged;
  }, [menuData, dateKey, allItems, recurringItemIds]);
  const isPublished = weekDays.every(day => publishedDays.has(format(day, "yyyy-MM-dd")));

  // Build a complete category list: server categories + any categories found in daily items
  // This ensures items with ANY category are always displayed
  const displayCategories = useMemo(() => {
    const itemCats = dailyItems.map(i => i.category).filter(Boolean);
    const allCats = [...categories, ...itemCats];
    return [...new Set(allCats)];
  }, [categories, dailyItems]);

  /** Keeps the ref in sync so async callbacks always read the latest value. */
  const setPublishedDaysSync = (next: Set<string>) => {
    publishedDaysRef.current = next;
    setPublishedDays(next);
  };

  /** Normalize a date string (ISO, SQL, or yyyy-MM-dd) to yyyy-MM-dd */
  const normalizeDate = (d: string): string => d.substring(0, 10);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadWeekMenu(); }, [currentDate]);

  const loadData = async () => {
    try {
      const [items, cats, recurring] = await Promise.all([
        api.get("/menu"),
        api.get("/categories").catch(() => null),
        api.authGet("/admin/recurring-items").catch(() => []),
      ]);
      if (Array.isArray(items)) setAllItems(items);
      if (Array.isArray(cats) && cats.length > 0) setCategories(cats);
      if (Array.isArray(recurring)) setRecurringItemIds(new Set(recurring));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadWeekMenu = async () => {
    try {
      const [data, pubDays] = await Promise.all([
          api.authGet(`/admin/weekly-menu?week=${weekKey}`),
          api.authGet(`/admin/menu/published?week=${weekKey}`).catch(() => [])
      ]);

      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setMenuData(prev => ({ ...prev, ...data }));
      }
      if (Array.isArray(pubDays)) {
        // Normalize to yyyy-MM-dd regardless of what the server returns
        // (server may return ISO strings like "2026-05-21T00:00:00.000Z")
        const normalized = new Set(pubDays.map((d: string) => normalizeDate(d)));
        setPublishedDaysSync(normalized);
      }
    } catch (_) {}
  };

  const handleAddItem = (item: MenuItem) => {
    const currentItems = menuData[dateKey] || [];
    if (currentItems.find(i => i.id === item.id)) {
      toast.info("Item já adicionado neste dia.");
      return;
    }
    const newMenuData = { ...menuData, [dateKey]: [...currentItems, item] };
    setMenuData(newMenuData);
    setIsAddModalOpen(false);
    
    // Salvar automaticamente no banco de dados
    saveMenuDataToServer(newMenuData, dateKey);
  };

  const handleRemoveItem = (itemId: string) => {
    const newMenuData = { ...menuData, [dateKey]: dailyItems.filter(i => i.id !== itemId) };
    setMenuData(newMenuData);
    
    // Salvar automaticamente após remover
    saveMenuDataToServer(newMenuData, dateKey);
  };
  
  const saveMenuDataToServer = async (data: Record<string, MenuItem[]>, affectedDateKey: string) => {
    try {
      // Salvar apenas a semana afetada
      const affectedDate = new Date(affectedDateKey + "T12:00:00"); // noon to avoid TZ offset
      const affectedStartDate = startOfWeek(affectedDate, { weekStartsOn: 1 });
      const affectedWeekKey = format(affectedStartDate, "yyyy-MM-dd");

      const weekData: Record<string, MenuItem[]> = {};
      const weekDaysToSave = Array.from({ length: 6 }).map((_, i) => addDays(affectedStartDate, i));

      weekDaysToSave.forEach(day => {
        const dk = format(day, "yyyy-MM-dd");
        if (data[dk]?.length) weekData[dk] = data[dk];
      });

      await api.authPost("/admin/weekly-menu", { weekKey: affectedWeekKey, data: weekData });

      // Use publishedDaysRef (not state) to avoid stale closure — ref is always current.
      // If the day is already published, also update the live daily menu so the Home
      // reflects the change immediately without needing to re-publish.
      const isPublished = publishedDaysRef.current.has(affectedDateKey);
      console.log(`[AdminMenu] saveMenuDataToServer: date=${affectedDateKey}, isPublished=${isPublished}, publishedDays=`, [...publishedDaysRef.current]);

      if (isPublished) {
        const dayItems = data[affectedDateKey] || [];
        const recurringItems = allItems.filter(i => recurringItemIds.has(i.id));
        const merged = [...dayItems];
        recurringItems.forEach(ri => {
          if (!merged.find(m => m.id === ri.id)) merged.push(ri);
        });
        const itemIds = merged.map(item => item.id);
        await api.authPost("/admin/daily-menu", { date: affectedDateKey, itemIds });
        console.log(`[AdminMenu] Published daily-menu updated with ${itemIds.length} items`);
      }

      // Toast mais discreto para salvamento automático
      toast.success("✓ Salvo", { duration: 1500 });
    } catch (e) {
      console.error("Erro ao salvar automaticamente:", e);
      toast.error("Erro ao salvar. Tente usar 'Salvar Rascunho'.", { duration: 3000 });
    }
  };

  const handlePublishDay = async (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const isCurrentlyPublished = publishedDays.has(dateStr);
    
    try {
      if (isCurrentlyPublished) {
        await api.authDel(`/admin/daily-menu/${dateStr}`);
        setPublishedDaysSync(new Set([...publishedDaysRef.current].filter(d => d !== dateStr)));
        toast.success("Cardápio desativado do app");
      } else {
        const items = menuData[dateStr] || [];
        // Include recurring items automatically
        const recurringItems = allItems.filter(i => recurringItemIds.has(i.id));
        const merged = [...items];
        recurringItems.forEach(ri => {
          if (!merged.find(m => m.id === ri.id)) merged.push(ri);
        });
        const itemIds = merged.map(item => item.id);
        
        if (itemIds.length === 0) {
          toast.error("Adicione itens antes de ativar o cardápio");
          return;
        }
        
        await api.authPost("/admin/daily-menu", { date: dateStr, itemIds });
        await api.authPost("/admin/menu/publish-day", { date: dateStr });

        setPublishedDaysSync(new Set([...publishedDaysRef.current, dateStr]));
        toast.success("Cardápio ativado no app!");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar status");
    }
  };

  // Duplicate a day's menu to another day
  const handleDuplicateDay = async () => {
    if (!duplicateSrcDate || !duplicateTargetDate) return;
    const srcItems = menuData[duplicateSrcDate] || [];
    if (srcItems.length === 0) {
      toast.error("Dia de origem sem itens para duplicar.");
      return;
    }
    const newMenuData = { ...menuData, [duplicateTargetDate]: [...srcItems] };
    setMenuData(newMenuData);
    await saveMenuDataToServer(newMenuData, duplicateTargetDate);
    toast.success(`Cardápio copiado para ${format(new Date(duplicateTargetDate + "T12:00"), "dd/MM", { locale: ptBR })}!`);
    setDuplicateSrcDate(null);
    setDuplicateTargetDate("");
  };

  // Toggle recurring item
  const toggleRecurring = async (itemId: string) => {
    const newSet = new Set(recurringItemIds);
    if (newSet.has(itemId)) {
      newSet.delete(itemId);
    } else {
      newSet.add(itemId);
    }
    setRecurringItemIds(newSet);
    try {
      await api.authPost("/admin/recurring-items", { itemIds: [...newSet] });
      toast.success(newSet.has(itemId) ? "Item marcado como Diário ♻️" : "Recorrência removida", { duration: 1500 });
    } catch (e) {
      toast.error("Erro ao salvar item diário");
    }
  };

  const handleDuplicatePreviousWeek = async () => {
    const prevStart = format(subWeeks(startDate, 1), "yyyy-MM-dd");
    try {
      const data = await api.authGet(`/admin/weekly-menu?week=${prevStart}`);
      if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0) {
        const newData = { ...menuData };
        Object.entries(data).forEach(([oldDateKey, items]) => {
          const oldDate = new Date(oldDateKey);
          const newDate = addWeeks(oldDate, 1);
          const newDateKey = format(newDate, "yyyy-MM-dd");
          newData[newDateKey] = items as MenuItem[];
        });
        setMenuData(newData);
        toast.success("Semana anterior duplicada!");
      } else {
        toast.info("Semana anterior sem cardápio.");
      }
    } catch (e) {
      toast.error("Erro ao duplicar semana.");
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Cardápio Semanal - ${format(startDate, "dd/MM/yyyy")}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { font-size: 20px; margin-bottom: 20px; }
        h2 { font-size: 16px; margin: 15px 0 8px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        .day { margin-bottom: 20px; }
        .item { padding: 4px 0; font-size: 13px; display: flex; justify-content: space-between; }
        .category { font-size: 12px; color: #888; font-weight: bold; text-transform: uppercase; margin-top: 8px; }
      </style></head><body>
      <h1>Cardapio Semanal - Semana de ${format(startDate, "dd/MM/yyyy")}</h1>
    `);
    weekDays.forEach(day => {
      const dk = format(day, "yyyy-MM-dd");
      const baseItems = getDisplayItems(menuData[dk] || []);
      const recurringItems = allItems.filter(i => recurringItemIds.has(i.id));
      const items = [...baseItems];
      recurringItems.forEach(ri => {
        if (!items.find(m => m.id === ri.id)) items.push(ri);
      });
      printWindow.document.write(`<div class="day"><h2>${format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}</h2>`);
      if (items.length === 0) {
        printWindow.document.write('<p style="color:#999; font-size:13px">Sem itens definidos</p>');
      } else {
        const cats = [...new Set(items.map(i => i.category))];
        cats.forEach(cat => {
          printWindow.document.write(`<div class="category">${cat}</div>`);
          items.filter(i => i.category === cat).forEach(item => {
            printWindow.document.write(`<div class="item"><span>${item.name}</span><span>${item.calories} kcal</span></div>`);
          });
        });
      }
      printWindow.document.write('</div>');
    });
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
  };

  const handleCreateNewItem = async () => {
    try {
      const created = await api.authPost("/menu", { ...newItem, image: "", id: crypto.randomUUID() });
      setAllItems([...allItems, created]);
      handleAddItem(created);
      setIsNewItemModalOpen(false);
      setNewItem({ name: "", description: "", calories: 0, category: "Principal", unit: "porção", available: 100, limit: 1 });
      toast.success("Item criado e adicionado ao cardápio!");
    } catch (e: any) {
      toast.error(e.message || "Erro");
    }
  };

  const filteredAllItems = allItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const todayHasItems = (dailyItems.length > 0 || (menuData[todayKey] || []).length > 0);
  const todayIsPublished = publishedDays.has(todayKey);
  const showUnpublishedWarning = isSameDay(selectedDate, new Date()) && todayHasItems && !todayIsPublished;

  return (
    <div className="space-y-6 flex flex-col" ref={printRef}>
      {/* Warning: today has items but isn't published → Home won't show them */}
      {showUnpublishedWarning && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
          <span className="text-xl">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Cardápio de hoje não está ativo</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Os itens adicionados <strong>não aparecem na Home</strong> enquanto o cardápio não for ativado.
              Clique em <strong>"Ativar Cardápio"</strong> para publicar.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Planejamento de Cardápio</h1>
          <p className="text-muted-foreground text-sm">Defina o cardápio semanal e consulte histórico.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === "calendar" ? "list" : "calendar")} className="gap-2">
            {viewMode === "calendar" ? <List size={14} /> : <LayoutGrid size={14} />}
            {viewMode === "calendar" ? "Lista" : "Calendário"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2"><Printer size={14} /> PDF</Button>
          
          <Button size="sm" onClick={async () => {
              setSaving(true);
              try {
                const weekData: Record<string, MenuItem[]> = {};
                weekDays.forEach(day => {
                  const dk = format(day, "yyyy-MM-dd");
                  if (menuData[dk]?.length) weekData[dk] = menuData[dk];
                });
                await api.authPost("/admin/weekly-menu", { weekKey, data: weekData });
                toast.success("Rascunho salvo!");
              } catch (e) {
                toast.error("Erro ao salvar rascunho");
              } finally {
                setSaving(false);
              }
          }} disabled={saving} className="gap-2 bg-primary hover:bg-primary/90">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar Rascunho
          </Button>
        </div>
      </div>

      {/* Recurring items strip */}
      {recurringItemIds.size > 0 && (
        <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <RepeatIcon size={14} className="text-emerald-600" />
            <span className="text-xs font-semibold text-foreground">Itens Diários:</span>
          </div>
          {allItems.filter(i => recurringItemIds.has(i.id)).map(item => (
            <span key={item.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
              ♻️ {item.name}
              <button onClick={() => toggleRecurring(item.id)} className="hover:text-red-500 transition-colors">×</button>
            </span>
          ))}
          <span className="text-[10px] text-muted-foreground">Exibidos automaticamente em todos os dias do calendário</span>
        </div>
      )}

      {/* Week Navigation */}
      <div className="flex items-center gap-3 bg-card p-3 rounded-xl border border-border shadow-sm">
        <button className="p-2 hover:bg-accent rounded-lg" onClick={() => setCurrentDate(addDays(currentDate, -7))}><ChevronLeft size={18} /></button>
        <div className="flex-1 text-center flex items-center justify-center gap-2">
          <span className="font-bold text-foreground">Semana de {format(startDate, "dd/MM")} a {format(addDays(startDate, 5), "dd/MM/yyyy")}</span>
          {isPublished && (
            <Badge className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 gap-1">
              <CheckCircle size={12} /> Publicado
            </Badge>
          )}
        </div>
        <button className="p-2 hover:bg-accent rounded-lg" onClick={() => setCurrentDate(addDays(currentDate, 7))}><ChevronRight size={18} /></button>
      </div>

      {viewMode === "list" ? (
        <div className="space-y-4">
          {weekDays.map(day => {
            const dk = format(day, "yyyy-MM-dd");
            const rawItems = menuData[dk] || [];
            const baseItems = getDisplayItems(rawItems);
            const recurringItems = allItems.filter(i => recurringItemIds.has(i.id));
            const items = [...baseItems];
            recurringItems.forEach(ri => {
              if (!items.find(m => m.id === ri.id)) items.push(ri);
            });
            const isToday = isSameDay(day, new Date());
            const dayCats = displayCategories.filter(cat => items.some(i => i.category === cat));

            return (
              <div
                key={dk}
                className={cn(
                  "bg-card rounded-lg border shadow-sm transition-all overflow-hidden",
                  isToday && "ring-1 ring-primary border-primary/50"
                )}
              >
                {/* Header Compacto */}
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20 gap-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("flex flex-col items-center justify-center w-10 h-10 rounded border bg-background shadow-sm", isToday ? "border-primary/50 text-primary" : "border-border text-muted-foreground")}>
                         <span className="text-[10px] font-bold uppercase">{format(day, "EEE", { locale: ptBR })}</span>
                         <span className="text-sm font-bold leading-none">{format(day, "dd")}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm capitalize flex items-center gap-2">
                        {format(day, "EEEE", { locale: ptBR })}
                        {isToday && <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">HOJE</span>}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(day, "d 'de' MMM", { locale: ptBR })}</span>
                        {items.length > 0 && <span>• {items.length} itens</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setDuplicateSrcDate(dk)}
                      disabled={items.length === 0}
                      title="Duplicar cardápio deste dia para outro dia"
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border bg-card text-muted-foreground hover:bg-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Copy size={12} /> Duplicar
                    </button>
                    <button
                      onClick={() => items.length > 0 && handlePublishDay(day)}
                      disabled={items.length === 0}
                      className={cn(
                        "flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium transition-all border",
                        items.length === 0 ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground border-border" : "cursor-pointer",
                        publishedDays.has(dk)
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-200"
                          : "bg-white dark:bg-muted/10 text-muted-foreground border-border hover:bg-muted/50"
                      )}
                    >
                      <span
                        className={cn(
                          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-300",
                          publishedDays.has(dk)
                            ? "bg-green-500 dark:bg-green-600"
                            : "bg-zinc-300 dark:bg-zinc-600"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-300",
                            publishedDays.has(dk) ? "translate-x-[14px]" : "translate-x-[2px]"
                          )}
                        />
                      </span>
                      {publishedDays.has(dk) ? "Desativar" : "Ativar Cardápio"}
                    </button>
                  </div>
                </div>

                {/* Body Compacto */}
                <div className="px-4 py-3">
                    {items.length === 0 ? (
                      <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground/50 text-sm">
                        <UtensilsCrossed size={16} /> <span>Sem itens</span>
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => { setSelectedDate(day); setViewMode("calendar"); }}>
                            Adicionar
                        </Button>
                      </div>
                    ) : (
                        <div className="space-y-0">
                             {dayCats.map(category => {
                                 const catItems = items.filter(i => i.category === category);
                                 return (
                                     <div key={category} className="grid grid-cols-[80px_1fr] sm:grid-cols-[100px_1fr] gap-2 items-start py-2 border-b border-border/40 last:border-0">
                                         <div className="text-[10px] font-bold text-muted-foreground uppercase py-1.5 tracking-wider">{category}</div>
                                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                             {catItems.map(item => (
                                                 <div key={item.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/40 border border-transparent hover:border-border/50 transition-colors bg-accent/5">
                                                     <div className="w-8 h-8 rounded bg-muted overflow-hidden flex-shrink-0 border border-border/30">
                                                         {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center w-full h-full"><UtensilsCrossed size={12} className="text-muted-foreground/50"/></div>}
                                                     </div>
                                                     <div className="min-w-0 flex-1">
                                                         <div className="text-xs font-medium truncate text-foreground">{item.name}</div>
                                                         <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 leading-none mt-0.5">
                                                            <span>{item.calories} kcal</span>
                                                            {item.limit && item.limit > 0 && (
                                                              <>
                                                                <span className="w-0.5 h-0.5 bg-muted-foreground rounded-full" />
                                                                <span className="text-orange-600 dark:text-orange-400">Max: {item.limit}</span>
                                                              </>
                                                            )}
                                                         </div>
                                                     </div>
                                                 </div>
                                             ))}
                                         </div>
                                     </div>
                                 );
                             })}
                        </div>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
          <div className="lg:col-span-4 xl:col-span-3 bg-card rounded-xl shadow-sm border p-4 flex flex-col">
            <div className="space-y-2 flex-1 overflow-y-auto">
              {weekDays.map(day => {
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                const dayKey = format(day, "yyyy-MM-dd");
                const daySpecificItems = menuData[dayKey] || [];
                const dayRecurringItems = allItems.filter(i => recurringItemIds.has(i.id) && !daySpecificItems.find(m => m.id === i.id));
                const totalItemsCount = daySpecificItems.length + dayRecurringItems.length;
                return (
                  <button key={day.toISOString()} onClick={() => setSelectedDate(day)}
                    className={cn("w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left",
                      isSelected ? "bg-primary/5 border-primary ring-1 ring-primary" : "bg-card border-border hover:bg-accent"
                    )}>
                    <div className="flex flex-col">
                      <span className={cn("text-xs font-semibold uppercase tracking-wider mb-0.5", isSelected ? "text-primary" : "text-muted-foreground")}>{format(day, "EEEE", { locale: ptBR })}</span>
                      <span className={cn("text-lg font-bold", isSelected ? "text-foreground" : "text-muted-foreground")}>{format(day, "d 'de' MMM", { locale: ptBR })}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isToday && <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">HOJE</span>}
                      {totalItemsCount > 0 ? (
                        <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 text-[10px] h-5">{totalItemsCount} itens</Badge>
                      ) : <span className="text-[10px] text-muted-foreground">Vazio</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-8 xl:col-span-9 bg-card rounded-xl shadow-sm border flex flex-col overflow-hidden">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-accent/30">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg text-primary"><CalendarIcon size={20} /></div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-foreground">{format(selectedDate, "EEEE", { locale: ptBR })}</h2>
                  <p className="text-xs text-muted-foreground">{format(selectedDate, "d 'de' MMMM, yyyy", { locale: ptBR })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => dailyItems.length > 0 && setDuplicateSrcDate(dateKey)}
                  disabled={dailyItems.length === 0}
                  title="Duplicar cardápio deste dia para outro dia"
                  className="flex items-center gap-1.5 h-9 sm:h-11 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-medium border bg-card text-muted-foreground hover:bg-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Copy size={14} /> Duplicar
                </button>
                <button
                  onClick={() => handlePublishDay(selectedDate)}
                  className={cn(
                    "flex items-center gap-2 h-9 sm:h-11 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer border",
                    publishedDays.has(dateKey)
                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-200"
                      : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-200"
                  )}
                >
                  <span
                    className={cn(
                      "relative inline-flex h-4 sm:h-5 w-7 sm:w-9 shrink-0 items-center rounded-full transition-colors duration-300",
                      publishedDays.has(dateKey)
                        ? "bg-green-500 dark:bg-green-600"
                        : "bg-red-400 dark:bg-red-500"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-3 sm:h-3.5 w-3 sm:w-3.5 rounded-full bg-white shadow-sm transition-transform duration-300",
                        publishedDays.has(dateKey) ? "translate-x-[14px] sm:translate-x-[18px]" : "translate-x-[2px] sm:translate-x-[3px]"
                      )}
                    />
                  </span>
                  <span className="hidden xs:inline">{publishedDays.has(dateKey) ? "Desativar Cardápio" : "Ativar Cardápio"}</span>
                </button>
                <Button size="sm" onClick={() => setIsAddModalOpen(true)} className="gap-2 shadow-md"><Plus size={14} /> <span className="hidden sm:inline">Adicionar</span> Prato</Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-accent/10">
              {dailyItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-60 min-h-[200px]">
                  <UtensilsCrossed size={32} className="text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold text-foreground">Nenhum item adicionado</h3>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">Adicione pratos ao cardápio deste dia.</p>
                  </div>
                  <Button variant="outline" onClick={() => setIsAddModalOpen(true)}>Começar</Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {displayCategories.map(category => {
                    const itemsByCat = dailyItems.filter(i => i.category === category);
                    if (itemsByCat.length === 0) return null;
                    return (
                      <div key={category} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm uppercase tracking-wider text-foreground">{category}</h3>
                          <div className="h-[1px] flex-1 bg-border"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {itemsByCat.map(item => (
                            <div key={item.id} className="bg-card p-3 rounded-xl border shadow-sm flex gap-3 group hover:border-primary/50 transition-colors relative">
                              <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden flex-shrink-0 border border-border/50">
                                {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><UtensilsCrossed size={16} /></div>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                  <h4 className="font-bold text-sm truncate text-foreground">{item.name}</h4>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {/* Recurring toggle */}
                                    <button
                                      onClick={() => toggleRecurring(item.id)}
                                      title={recurringItemIds.has(item.id) ? "Remover recorrência diária" : "Marcar como item diário (recorrente)"}
                                      className={cn(
                                        "p-1 rounded transition-colors text-[10px]",
                                        recurringItemIds.has(item.id)
                                          ? "text-emerald-600 hover:text-red-500"
                                          : "text-muted-foreground hover:text-emerald-600"
                                      )}
                                    >
                                      <RepeatIcon size={13} />
                                    </button>
                                    <button onClick={() => handleRemoveItem(item.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={14} /></button>
                                  </div>
                                </div>
                                {recurringItemIds.has(item.id) && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                                    <RepeatIcon size={9} /> Diário
                                  </span>
                                )}
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1">
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">{item.calories}</span> kcal
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    Limit: <span className="font-medium text-foreground">{item.limit || "∞"}</span>
                                  </div>
                                  <div className="col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground border-t border-dashed border-border/60 pt-1 mt-0.5">
                                    Porção: <span className="font-medium text-foreground">
                                      {item.portionWeight ? `${item.portionWeight}${item.kitchenUnit || 'g'}` : (item.unit || "un")}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Adicionar Item ao Cardápio</DialogTitle>
            <DialogDescription>Selecione um item do inventário ou crie um novo.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input type="text" placeholder="Buscar item do inventário..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-input text-sm bg-background text-foreground" />
              </div>
              <Button variant="outline" onClick={() => setIsNewItemModalOpen(true)} className="gap-2"><Plus size={14} /> Criar Novo</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto p-1">
              {filteredAllItems.map(item => (
                <div key={item.id} onClick={() => handleAddItem(item)}
                  className="border rounded-lg p-3 hover:border-primary cursor-pointer hover:bg-primary/5 transition-colors flex gap-3 items-center">
                  <div className="w-12 h-12 bg-muted rounded-md overflow-hidden flex-shrink-0">
                    {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><UtensilsCrossed size={14} /></div>}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm truncate text-foreground">{item.name}</h4>
                    <span className="text-xs text-muted-foreground">{item.category} - {item.calories}kcal</span>
                  </div>
                </div>
              ))}
              {filteredAllItems.length === 0 && (
                <div className="col-span-full text-center py-8 text-muted-foreground">Nenhum item encontrado.</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create New Item Quick Modal */}
      <Dialog open={isNewItemModalOpen} onOpenChange={setIsNewItemModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Criar Item Rápido</DialogTitle>
            <DialogDescription>Crie um novo item e adicione ao cardápio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <input type="text" placeholder="Nome do prato" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground" />
            <input type="text" placeholder="Descrição" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Calorias</label>
                <input type="number" value={newItem.calories} onChange={(e) => setNewItem({ ...newItem, calories: +e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Categoria</label>
                <select value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <Button onClick={handleCreateNewItem} className="w-full">Criar e Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate Day Dialog */}
      <Dialog open={!!duplicateSrcDate} onOpenChange={v => !v && setDuplicateSrcDate(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy size={18} className="text-primary" /> Duplicar Cardápio do Dia
            </DialogTitle>
            <DialogDescription>
              {duplicateSrcDate
                ? `Copiando itens de ${format(new Date(duplicateSrcDate + "T12:00"), "EEEE, dd/MM", { locale: ptBR })} para:`
                : "Selecione o dia de destino."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Dia de destino</label>
              <input
                type="date"
                value={duplicateTargetDate}
                onChange={e => setDuplicateTargetDate(e.target.value)}
                min={format(new Date(), "yyyy-MM-dd")}
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setDuplicateSrcDate(null); setDuplicateTargetDate(""); }}>
                Cancelar
              </Button>
              <Button onClick={handleDuplicateDay} disabled={!duplicateTargetDate} className="gap-2">
                <Copy size={14} /> Duplicar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}