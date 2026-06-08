import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { format, isSameDay, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "../context/auth-context";
import { useCart } from "../context/cart-context";
import { MenuItem, Order } from "../types";
import { MenuItemCard } from "../components/menu/MenuItemCard";
import { OrderBanner } from "../components/menu/OrderBanner";
import { MenuDatePicker } from "../components/menu/MenuDatePicker";
import { UnitSelector } from "../components/menu/UnitSelector";
import { AbstentionButton } from "../components/menu/AbstentionButton";
import { BannerCarousel } from "../components/menu/BannerCarousel";
import { RatingSheet } from "../components/menu/RatingSheet";
import { OnboardingTutorial } from "../components/menu/OnboardingTutorial";
import { UnitNoOrdersBanner } from "../components/menu/UnitNoOrdersBanner";
import { Link } from "react-router";
import { Button } from "../components/ui/Button";
import { SkeletonCard } from "../components/ui/SkeletonCard";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { PullToRefresh } from "../components/ui/PullToRefresh";
import { ShoppingBag, ChevronRight, Clock, Search, XCircle, X, Star, Lock, UtensilsCrossed, Salad, Coffee, IceCream, LayoutGrid, Soup, Leaf, CookingPot, Apple, CupSoda, Flame, Circle, CheckCircle, Scale, Users, ShoppingCart, BookOpen, ClipboardList, CalendarOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { api } from "../lib/api";
import { invalidateCache } from "../lib/api";
import { toast } from "sonner";
import { addDays } from "date-fns";
import { getBrazilTime, getBrazilDateString, getBrazilTimeString, isBrazilToday, isBrazilTomorrow, getBrazilHour, getBrazilMinute } from "../lib/date-utils";

/** "HH:MM" minus 30 minutes, returned as "HH:MM" (clamped at 00:00). */
function minusThirty(time: string): string {
  const [h, m] = time.split(":").map(Number);
  let total = h * 60 + m - 30;
  if (total < 0) total = 0;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function Menu() {
  const { user } = useAuth();
  const { totalItems, totalCalories, orderDate, setOrderDate, addToCart, clearCart, selectedUnit, setSelectedUnit, consumptionMode, setConsumptionMode, isManualLog, setIsManualLog } = useCart();
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullCatalog, setFullCatalog] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasAbstained, setHasAbstained] = useState(false);
  const [absLoading, setAbsLoading] = useState(false);
  const [settings, setSettings] = useState<{ unitName?: string; cutoffTime?: string; openingTime?: string; institutionalMessage?: string; showBannerCarousel?: boolean }>({});
  const [isEditUnitOpen, setIsEditUnitOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isCutoffPassed, setIsCutoffPassed] = useState(false);
  const [isFutureLocked, setIsFutureLocked] = useState(false);
  const [cancelAllowed, setCancelAllowed] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [datesLoading, setDatesLoading] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  // Whether user's unit allows placing orders
  const [ordersAllowed, setOrdersAllowed] = useState(true);
  // Whether this specific user has meal ordering permission
  const userCanOrderMeal = user?.canOrderMeal !== false;

  // Orders & Ratings
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [todayOrder, setTodayOrder] = useState<Order | null>(null);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [isRatingOpen, setIsRatingOpen] = useState(false);
  const [showRatingBanner, setShowRatingBanner] = useState(false);
  const [liveOrderStatus, setLiveOrderStatus] = useState<string | undefined>();
  const liveOrderStatusRef = useRef<string | undefined>(undefined);

  const navigate = useNavigate();

  // Map lunch location name → cart mode
  const LOCATION_MODE_MAP: Record<string, string> = {
    "Sede Damasceno": "dine_in_damasceno",
    "Sede Taipas": "dine_in_taipas",
    "Externo (Marmita)": "takeout_external",
  };

  // Sync cart selectedUnit/consumptionMode with user's saved lunchLocation
  useEffect(() => {
    if (!user?.lunchLocation) return;
    const mode = LOCATION_MODE_MAP[user.lunchLocation] || "dine_in_damasceno";
    setSelectedUnit(user.lunchLocation);
    setConsumptionMode(mode);
  }, [user?.lunchLocation]);

  // Sync isManualLog flag whenever ordersAllowed changes
  useEffect(() => {
    setIsManualLog(!ordersAllowed);
  }, [ordersAllowed]);

  // ── Single consolidated bootstrap: ONE request returns everything ──
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setLoading(true);
      setDatesLoading(true);

      try {
        const data = await api.authGet("/bootstrap");
        if (cancelled) return;

        // Dates
        const datesRes = data.availableDates || [];
        let dates: Date[] = datesRes
          .map((d: string) => new Date(d + "T00:00:00"))
          .filter((d: Date) => startOfDay(d) >= startOfDay(new Date()))
          .sort((a: Date, b: Date) => a.getTime() - b.getTime());
        if (!dates.some(d => isSameDay(d, new Date()))) {
          dates.unshift(new Date());
        }
        setAvailableDates(dates);
        if (dates.length > 0 && !dates.some((d: Date) => isSameDay(d, orderDate))) {
          setOrderDate(dates[0]);
        }
        setDatesLoading(false);

        // Orders
        const ordersRes = data.orders || [];
        if (Array.isArray(ordersRes)) {
          setAllOrders(ordersRes);
          const todayStr = getBrazilDateString();
          const yesterdayStr = getBrazilDateString(addDays(new Date(), -1));
          const tOrder = ordersRes.find((o: any) => o.date?.startsWith(todayStr) && o.status !== "Cancelado" && !o.isManualLog);
          setTodayOrder(tOrder || null);
          const lOrder = ordersRes.find((o: any) => o.date?.startsWith(yesterdayStr) && !o.rating && o.status !== "Cancelado");
          if (lOrder) {
            setLastOrder(lOrder);
            setShowRatingBanner(true);
          }
        }

        // Menu items
        const itemsRes = data.menuItems || [];
        if (Array.isArray(itemsRes)) setMenuItems(itemsRes);
        else setMenuItems([]);

        // Abstention
        setHasAbstained(data.abstention?.abstained || false);

        // Settings + unit order permission
        const settingsRes = data.settings || {};
        setSettings(settingsRes);
        const rawUnits = settingsRes?.units;
        const userUnit = selectedUnit || user?.lunchLocation || "";
        if (rawUnits && Array.isArray(rawUnits) && rawUnits.length > 0 && typeof rawUnits[0] !== "string" && userUnit) {
          const unitConfig = rawUnits.find((u: any) => u.name === userUnit);
          setOrdersAllowed(unitConfig ? unitConfig.allowOrders !== false : true);
        } else {
          setOrdersAllowed(true);
        }
      } catch (err) {
        console.error("Bootstrap failed, falling back to individual requests:", err);
        // Graceful fallback: fetch individually if bootstrap endpoint fails
        try {
          const dateStr = format(orderDate, "yyyy-MM-dd");
          const menuEndpoint = isSameDay(orderDate, new Date()) ? "/menu/today" : `/menu?date=${dateStr}`;
          const [datesRes, ordersRes, itemsRes, absRes, settingsRes] = await Promise.all([
            api.get("/menu/available-dates").catch(() => []),
            api.authGet("/orders").catch(() => []),
            api.get(menuEndpoint).catch(() => []),
            api.authGet("/abstention/me").catch(() => ({ abstained: false })),
            api.get("/admin/settings").catch(() => ({})),
          ]);
          if (cancelled) return;
          let dates: Date[] = [];
          if (Array.isArray(datesRes)) {
            dates = datesRes.map((d: string) => new Date(d + "T00:00:00")).filter((d: Date) => startOfDay(d) >= startOfDay(new Date())).sort((a: Date, b: Date) => a.getTime() - b.getTime());
          }
          if (!dates.some(d => isSameDay(d, new Date()))) dates.unshift(new Date());
          setAvailableDates(dates);
          if (dates.length > 0 && !dates.some((d: Date) => isSameDay(d, orderDate))) setOrderDate(dates[0]);
          setDatesLoading(false);
          if (Array.isArray(ordersRes)) {
            setAllOrders(ordersRes);
            const todayStr = getBrazilDateString();
            const yesterdayStr = getBrazilDateString(addDays(new Date(), -1));
            setTodayOrder(ordersRes.find((o: any) => o.date?.startsWith(todayStr) && o.status !== "Cancelado" && !o.isManualLog) || null);
            const lOrder = ordersRes.find((o: any) => o.date?.startsWith(yesterdayStr) && !o.rating && o.status !== "Cancelado");
            if (lOrder) { setLastOrder(lOrder); setShowRatingBanner(true); }
          }
          if (Array.isArray(itemsRes)) setMenuItems(itemsRes); else setMenuItems([]);
          setHasAbstained(absRes?.abstained || false);
          setSettings(settingsRes || {});
        } catch (fallbackErr) {
          console.error("Fallback requests also failed:", fallbackErr);
          setDatesLoading(false);
        }
      }

      setLoading(false);
    };

    bootstrap();
    return () => { cancelled = true; };
  }, []); // fires once on mount

  // ── Refetch only menu + abstention + settings when date/unit changes (not first render) ──
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      const dateStr = format(orderDate, "yyyy-MM-dd");
      const menuEndpoint = isSameDay(orderDate, new Date()) ? "/menu/today" : `/menu?date=${dateStr}`;
      const [itemsRes, absRes, settingsRes] = await Promise.all([
        api.get(menuEndpoint).catch(() => []),
        api.authGet("/abstention/me").catch(() => ({ abstained: false })),
        api.get("/admin/settings").catch(() => ({})),
      ]);
      if (cancelled) return;
      if (Array.isArray(itemsRes)) setMenuItems(itemsRes); else setMenuItems([]);
      setHasAbstained(absRes?.abstained || false);
      setSettings(settingsRes || {});
      const rawUnits = settingsRes?.units;
      const userUnit = selectedUnit || user?.lunchLocation || "";
      if (rawUnits && Array.isArray(rawUnits) && rawUnits.length > 0 && typeof rawUnits[0] !== "string" && userUnit) {
        const unitConfig = rawUnits.find((u: any) => u.name === userUnit);
        setOrdersAllowed(unitConfig ? unitConfig.allowOrders !== false : true);
      } else {
        setOrdersAllowed(true);
      }
      setLoading(false);
    };
    refresh();
    return () => { cancelled = true; };
  }, [orderDate, selectedUnit]);

  // Order status polling (every 15s when there's a today order)
  useEffect(() => {
    if (!todayOrder) return;
    const poll = async () => {
      try {
        const data = await api.authGet("/orders/today-status");
        if (data?.order?.status && data.order.status !== liveOrderStatusRef.current) {
          // Notify user when order is ready (compare against ref to avoid stale closure)
          if (data.order.status === "Pronto" && liveOrderStatusRef.current && liveOrderStatusRef.current !== "Pronto") {
            toast.success("Seu pedido está pronto para retirada!", { duration: 8000 });
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("SpaceFood", {
                body: "Seu pedido está pronto para retirada!",
                icon: "/favicon.ico",
                tag: "order-ready",
              });
            }
          }
          liveOrderStatusRef.current = data.order.status;
          setLiveOrderStatus(data.order.status);
        }
      } catch (_) {}
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [todayOrder?.id]); // ← removed liveOrderStatus: using ref avoids interval being recreated on every status change

  // Lazy-fetch full catalog only when search is opened
  const catalogFetched = useRef(false);
  useEffect(() => {
    if (!isSearchOpen || catalogFetched.current) return;
    catalogFetched.current = true;
    api.get("/menu").then((data) => {
      if (Array.isArray(data)) setFullCatalog(data);
    }).catch(() => {});
  }, [isSearchOpen]);

  // Countdown & Blocking Logic
  useEffect(() => {
    const checkTime = () => {
      // Use helper functions to get Brazil time components directly
      // This avoids timezone issues when using Date objects in different browser locales
      const brazilHour = getBrazilHour();
      const brazilMinute = getBrazilMinute();
      const currentMinutes = brazilHour * 60 + brazilMinute;

      // 1. Check if "Today" cutoff passed
      if (isBrazilToday(orderDate)) {
        setIsFutureLocked(false); // Today is never "future locked", just "cutoff passed"
        
        if (!settings.cutoffTime) {
          setIsCutoffPassed(false);
          setTimeLeft("");
          setCancelAllowed(true);
          return;
        }

        const [h, m] = settings.cutoffTime.split(':').map(Number);
        const cutoffMinutes = h * 60 + m;

        if (currentMinutes >= cutoffMinutes) {
          setIsCutoffPassed(true);
          setTimeLeft("Encerrado");
          setCancelAllowed(false);
        } else {
          setIsCutoffPassed(false);
          const diffMinutes = cutoffMinutes - currentMinutes;
          const hoursLeft = Math.floor(diffMinutes / 60);
          const minsLeft = diffMinutes % 60;
          
          if (diffMinutes < 60) {
             setTimeLeft(`${diffMinutes}m restantes`);
          } else {
             setTimeLeft(`Até ${settings.cutoffTime}`);
          }

          // Update cancel/edit allowed: allowed up to cutoff time
          setCancelAllowed(currentMinutes < cutoffMinutes);
        }
      } 
      // 2. Check "Tomorrow" opening time
      else if (isBrazilTomorrow(orderDate)) {
        setIsCutoffPassed(false); // It's future, not "cutoff passed" (which implies too late)
        
        // Default opening time 15:00 if not set
        const openTime = settings.openingTime || "15:00";
        const [h, m] = openTime.split(':').map(Number);
        const openMinutes = h * 60 + m;

        if (currentMinutes < openMinutes) {
          setIsFutureLocked(true);
          setTimeLeft(`Abre às ${openTime}`);
        } else {
          setIsFutureLocked(false);
          setTimeLeft("Aberto");
        }
      }
      // 3. Far Future
      else {
        setIsCutoffPassed(false);
        setIsFutureLocked(false);
        setTimeLeft("Agendamento");
        setCancelAllowed(false);
      }
    };

    const interval = setInterval(checkTime, 1000);
    checkTime();
    return () => clearInterval(interval);
  }, [settings.cutoffTime, settings.openingTime, orderDate, liveOrderStatus, todayOrder?.status]);

  // Derived: is the currently selected order date today?
  const isToday = isSameDay(orderDate, new Date());

  // The real order (if any) placed for the currently-viewed date. Matched by the
  // order's target menuDate (falls back to creation date for legacy orders).
  // This is what drives the "order placed" banner — for today AND future dates.
  const orderForDate = useMemo(() => {
    const dateStr = format(orderDate, "yyyy-MM-dd");
    return allOrders.find((o: any) => {
      if (o.isManualLog || o.status === "Cancelado") return false;
      const target = o.menuDate || (o.date ? o.date.split("T")[0] : "");
      return target === dateStr;
    }) || null;
  }, [allOrders, orderDate]);

  // Whether the given order can still be edited/deleted.
  // Future-dated orders: always editable. Today: until 30 min before cutoff. Past: no.
  const isOrderEditable = (order: Order | null): boolean => {
    if (!order) return false;
    const target = (order as any).menuDate || (order.date ? order.date.split("T")[0] : "");
    const todayStr = getBrazilDateString();
    if (target > todayStr) return true;       // future order — always editable
    if (target < todayStr) return false;      // past order — locked
    if (!settings.cutoffTime) return true;    // today, no cutoff configured
    const [h, m] = settings.cutoffTime.split(":").map(Number);
    const cutoffMinutes = h * 60 + m;
    const nowMinutes = getBrazilHour() * 60 + getBrazilMinute();
    return nowMinutes < cutoffMinutes - 30;   // today — 30-min buffer before cutoff
  };

  // Human-readable edit deadline label for the order banner.
  const getEditDeadlineLabel = (order: Order | null): string => {
    if (!order) return "";
    const target = (order as any).menuDate || (order.date ? order.date.split("T")[0] : "");
    const todayStr = getBrazilDateString();
    if (target > todayStr) {
      // Future order: deadline is 30 min before that day's cutoff
      if (!settings.cutoffTime) return "o dia do pedido";
      const dayLabel = format(new Date(target + "T00:00:00"), "dd/MM", { locale: ptBR });
      return `${dayLabel} às ${minusThirty(settings.cutoffTime)}`;
    }
    // Today: 30 min before cutoff
    if (!settings.cutoffTime) return "";
    return minusThirty(settings.cutoffTime);
  };

  // Auto-advance fires at most once per session. After the first advance the user
  // is free to navigate back to today and see today's menu greyed-out with a notice.
  const hasAutoAdvanced = useRef(false);

  // Auto-advance to next available date when today's cutoff passes (Damasceno only).
  // Taipas users (ordersAllowed=false) register any time — no auto-advance for them.
  useEffect(() => {
    if (!isCutoffPassed || !ordersAllowed || !isToday) return;
    if (hasAutoAdvanced.current) return; // already advanced once — don't override manual navigation
    if (availableDates.length === 0) return;
    const todayStart = startOfDay(new Date());
    const nextDate = availableDates.find(d => startOfDay(d) > todayStart);
    if (nextDate) {
      hasAutoAdvanced.current = true;
      setOrderDate(nextDate);
    }
  }, [isCutoffPassed, isToday, ordersAllowed, availableDates]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAbstention = async () => {
    setAbsLoading(true);
    try {
      if (hasAbstained) {
        await api.authDel("/abstention");
        setHasAbstained(false);
        toast.success(ordersAllowed ? "Abstenção cancelada. Você pode fazer pedido." : "Abstenção cancelada.");
      } else {
        await api.authPost("/abstention", {});
        setHasAbstained(true);
        toast.info("Registrado: Você não almoçará hoje.");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao registrar abstenção.");
    } finally {
      setAbsLoading(false);
    }
  };

  const handleRatingSubmit = async (orderId: string, stars: number, comment: string) => {
    try {
      await api.authPost("/ratings", { orderId, stars, comment });
      toast.success("Obrigado pela avaliação!");
      setShowRatingBanner(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar avaliação.");
    }
  };

  // Compute cancel deadline label
  const getCancelDeadlineLabel = (): string => {
    if (!settings.cutoffTime) return "";
    return settings.cutoffTime;
  };

  // Check if cancel/edit is still allowed (up to cutoff time)
  const isCancelAllowed = (): boolean => {
    if (!settings.cutoffTime) return !isCutoffPassed;

    const [h, m] = settings.cutoffTime.split(':').map(Number);
    const cutoffMinutes = h * 60 + m;
    
    // Get current Brazil time in minutes
    const currentMinutes = getBrazilHour() * 60 + getBrazilMinute();
    
    // Allowed up to cutoff time
    return currentMinutes < cutoffMinutes && !isCutoffPassed;
  };

  const handleEditOrder = () => {
    if (!orderForDate) return;

    if (!isOrderEditable(orderForDate)) {
      toast.error(`O prazo para editar já passou (limite: ${getEditDeadlineLabel(orderForDate)}).`);
      return;
    }
    setEditDialogOpen(true);
  };

  const confirmEditOrder = async () => {
    setEditDialogOpen(false);
    if (!orderForDate) return;
    const editingOrder = orderForDate;
    const toastId = toast.loading("Preparando edição...");
    try {
      await api.authDel(`/orders/${editingOrder.id}`);
      clearCart();
      editingOrder.items.forEach((orderItem: any) => {
        const fullItem = menuItems.find(i => i.id === orderItem.id) || orderItem;
        for (let i = 0; i < (orderItem.quantity || 1); i++) {
          addToCart(fullItem);
        }
      });
      toast.dismiss(toastId);
      setAllOrders(prev => prev.filter(o => o.id !== editingOrder.id));
      if (todayOrder?.id === editingOrder.id) setTodayOrder(null);
      navigate("/cart");
    } catch (e: any) {
      toast.error(e.message || "Erro ao editar pedido.");
      toast.dismiss(toastId);
    }
  };

  const handleDeleteOrder = () => {
    if (!orderForDate) return;

    if (!isOrderEditable(orderForDate)) {
      toast.error(`O prazo para excluir já passou (limite: ${getEditDeadlineLabel(orderForDate)}).`);
      return;
    }
    setDeleteDialogOpen(true);
  };

  const confirmDeleteOrder = async () => {
    setDeleteDialogOpen(false);
    if (!orderForDate) return;
    const deletingOrder = orderForDate;
    const toastId = toast.loading("Excluindo pedido...");
    try {
      await api.authDel(`/orders/${deletingOrder.id}`);
      toast.success("Pedido excluído com sucesso.");
      setAllOrders(prev => prev.filter(o => o.id !== deletingOrder.id));
      if (todayOrder?.id === deletingOrder.id) setTodayOrder(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir pedido.");
    } finally {
      toast.dismiss(toastId);
    }
  };

  const handleRefresh = async () => {
    invalidateCache("/admin/settings");
    invalidateCache("/menu/available-dates");
    setLoading(true);
    const dateStr = format(orderDate, "yyyy-MM-dd");
    const menuEndpoint = isSameDay(orderDate, new Date()) ? "/menu/today" : `/menu?date=${dateStr}`;
    try {
      const [itemsRes, absRes, settingsRes, orders] = await Promise.all([
        api.get(menuEndpoint).catch(() => []),
        api.authGet("/abstention/me").catch(() => ({ abstained: false })),
        api.get("/admin/settings").catch(() => ({})),
        api.authGet("/orders").catch(() => []),
      ]);
      if (Array.isArray(itemsRes)) setMenuItems(itemsRes); else setMenuItems([]);
      setHasAbstained(absRes?.abstained || false);
      setSettings(settingsRes || {});
      if (Array.isArray(orders)) {
        const todayStr = getBrazilDateString();
        const tOrder = orders.find((o: any) => o.date?.startsWith(todayStr) && o.status !== "Cancelado");
        setTodayOrder(tOrder || null);
      }
    } catch (_) {}
    setLoading(false);
  };

  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const userUnit = selectedUnit || user?.lunchLocation || "";

    // 1. Filter daily items (also filter by unit restrictions)
    const dailyMatches = menuItems.filter((item) => {
      const matchesCategory = selectedCategory === "Todos" || item.category === selectedCategory;
      const matchesSearch = query === "" ||
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);
      // Unit restriction: if item has restrictions, only show for matching units
      const matchesUnit = !item.unitRestrictions || item.unitRestrictions.length === 0 ||
        (userUnit && item.unitRestrictions.includes(userUnit));
      return matchesCategory && matchesSearch && matchesUnit;
    });

    // 2. If searching, also look in fullCatalog for items NOT in menuItems
    if (query !== "") {
       const dailyIds = new Set(menuItems.map(i => i.id));
       const extraMatches = fullCatalog.filter(item => 
         !dailyIds.has(item.id) &&
         (item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)) &&
         (selectedCategory === "Todos" || item.category === selectedCategory)
       ).map(item => ({ ...item, isNotOnMenu: true }));
       
       return [...dailyMatches, ...extraMatches];
    }

    return dailyMatches;
  }, [menuItems, fullCatalog, searchQuery, selectedCategory]);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(menuItems.map(i => i.category).filter(Boolean)));
    // Priority order for categories
    const priority = [
      "Prato Principal",
      "Opção Vegetariana",
      "Guarnição",
      "Salada",
      "Sobremesa",
      "Suco",
      "Bebida"
    ];
    
    unique.sort((a, b) => {
      const idxA = priority.indexOf(a);
      const idxB = priority.indexOf(b);
      
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return ["Todos", ...unique];
  }, [menuItems]);
  const hasAnyPreviousDay = menuItems.some(item => item.isPreviousDay);

  // For Taipas (manual log) include yesterday and day-before in the date picker
  const visibleDates = useMemo(() => {
    if (!isManualLog) return availableDates;
    const today = startOfDay(new Date());
    const pastDays = [addDays(today, -2), addDays(today, -1)];
    const existing = new Set(availableDates.map(d => d.toISOString().split('T')[0]));
    const toAdd = pastDays.filter(d => !existing.has(d.toISOString().split('T')[0]));
    return [...toAdd, ...availableDates].sort((a, b) => a.getTime() - b.getTime());
  }, [availableDates, isManualLog]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-8 pb-16 md:pb-8 relative w-full">
        {/* Header Section */}
        <div className="flex flex-col gap-6 pt-4">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2 font-space-grotesk">
                <span className="text-xl md:text-[26px]">
                  Olá, <span className="text-orange-500">{user?.name.split(" ")[0]}</span>
                </span>
              </h1>

              <UnitSelector
                selectedUnit={selectedUnit}
                setSelectedUnit={setSelectedUnit}
                setConsumptionMode={setConsumptionMode}
                isOpen={isEditUnitOpen}
                setIsOpen={setIsEditUnitOpen}
                onAllowOrdersChange={setOrdersAllowed}
              />
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <div data-tutorial="dates">
              <MenuDatePicker
                orderDate={orderDate}
                setOrderDate={setOrderDate}
                availableDates={visibleDates}
                isOpen={isDatePickerOpen}
                setIsOpen={setIsDatePickerOpen}
                datesLoading={datesLoading}
                allowPast={isManualLog}
              />
              </div>

              {ordersAllowed && (!isCutoffPassed && !isFutureLocked ? (
                <span data-tutorial="cutoff" className={cn(
                  "text-xs font-bold px-4 py-1 rounded-lg border flex items-center gap-1.5 transition-all whitespace-nowrap w-fit shadow-sm",
                  isToday
                    ? "text-orange-600 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
                    : "text-green-600 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                )}>
                  <Clock size={14} />
                  {timeLeft}
                </span>
              ) : (
                <span data-tutorial="cutoff" className={cn(
                  "text-xs font-bold px-4 py-1 rounded-lg border flex items-center gap-1.5 whitespace-nowrap w-fit shadow-sm",
                  isFutureLocked
                    ? "text-blue-600 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                    : "text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                )}>
                  {isFutureLocked ? <Lock size={14} /> : <XCircle size={14} />}
                  {isFutureLocked ? "Aguardando Abertura" : "Encerrado"}
                </span>
              ))}
            </div>
          </div>

          {/* Institutional Message Banner */}
          {settings.institutionalMessage && (
            <div data-tutorial="notices" className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-orange-600 p-4 text-white shadow-lg">
              <p className="text-sm font-medium relative z-10">{settings.institutionalMessage}</p>
              <div className="absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            </div>
          )}

          {/* Orders NOT allowed for this unit */}
          {!ordersAllowed && (
            <UnitNoOrdersBanner unitName={selectedUnit} />
          )}

          {/* User does not have meal ordering permission */}
          {ordersAllowed && !userCanOrderMeal && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-500 to-red-700 p-4 text-white shadow-lg"
            >
              <div className="relative z-10 flex items-start gap-3">
                <Lock size={20} className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold">Pedidos bloqueados para sua conta</p>
                  <p className="text-xs opacity-90 mt-0.5">
                    Sua conta não tem permissão para realizar pedidos. Entre em contato com o administrador.
                  </p>
                </div>
              </div>
              <div className="absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            </motion.div>
          )}

          {/* Subtle Rating Banner (instead of auto-opening sheet) */}
          {showRatingBanner && lastOrder && !isRatingOpen && (
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setIsRatingOpen(true)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 transition-all hover:shadow-md group"
            >
              <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-full">
                <Star size={20} className="text-amber-500 fill-amber-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Avalie sua refeição de ontem</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">Toque para dar sua opinião</p>
              </div>
              <X
                size={16}
                className="text-amber-400 hover:text-amber-600"
                onClick={(e) => { e.stopPropagation(); setShowRatingBanner(false); }}
              />
            </motion.button>
          )}

          {/* Order Status Banner — shows for the order placed for the currently-viewed
               date (today OR a future pre-order). Only shows the live status for today. */}
          {orderForDate && (
            <OrderBanner
              order={orderForDate}
              cutoffTime={settings.cutoffTime}
              isCancelAllowed={isOrderEditable(orderForDate)}
              cancelDeadlineLabel={getEditDeadlineLabel(orderForDate)}
              onEdit={handleEditOrder}
              onDelete={handleDeleteOrder}
              liveStatus={isToday ? liveOrderStatus : undefined}
              targetDateLabel={isToday ? undefined : format(orderDate, "EEEE, dd/MM", { locale: ptBR })}
            />
          )}

          {/* Banner Carousel - Controlled by settings.showBannerCarousel (default true).
               Hidden only when an order banner is active for the viewed date.
               Manual logs (Taipas diary) do NOT count as "ordered", so banners always show. */}
          {!orderForDate && (settings.showBannerCarousel !== false) && (
            <BannerCarousel userUnit={selectedUnit} />
          )}

          {/* Previous Day Menu Banner */}
          {hasAnyPreviousDay && isToday && !orderForDate && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gray-500 to-gray-700 p-4 text-white shadow-lg border border-gray-600"
            >
              <div className="relative z-10">
                <p className="text-sm font-bold mb-1">📅 Cardápio do Dia Anterior</p>
                <p className="text-xs opacity-90">
                  O cardápio de hoje ainda não foi configurado. Estamos exibindo o cardápio anterior apenas para visualização. Aguarde a atualização!
                </p>
              </div>
              <div className="absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            </motion.div>
          )}

          {/* Menu Content — hidden when an order already exists for the viewed date.
               Navigating to a date without an order always shows that day's menu. */}
          {orderForDate ? null : (
            <>
              {/* Empty menu state: no specific menu configured for this day */}
              {!loading && menuItems.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-16 text-center bg-accent/30 rounded-3xl border border-dashed border-border gap-3"
                >
                  <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
                    <CalendarOff size={28} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">Não há cardápio disponível ainda para esse dia.</p>
                    <p className="text-sm text-muted-foreground mt-1">Volte em breve.</p>
                  </div>
                </motion.div>
              )}

              {/* Cutoff passed notice — items stay visible (greyed out) so user can browse */}
              {isCutoffPassed && isToday && ordersAllowed && !loading && menuItems.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800"
                >
                  <div className="p-1.5 bg-orange-100 dark:bg-orange-900/50 rounded-full shrink-0 mt-0.5">
                    <Clock size={16} className="text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-orange-900 dark:text-orange-200">Pedidos encerrados por hoje</p>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                      Os pedidos de hoje já encerraram, mas você pode fazer o seu pedido para amanhã, caso esteja liberado.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Categories Filter with Search — only when menu has items (or loading) */}
              {(loading || menuItems.length > 0) && (
              <>
              <div className="sticky top-16 md:top-0 z-10 -mx-4 md:-mx-8 -mt-10 bg-background/80 px-4 md:px-8 py-3 backdrop-blur-xl md:static md:mx-0 md:mt-0 md:bg-transparent md:px-0 md:py-0 border-b border-border/50 md:border-none transition-all">
                <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1 md:pb-0 scroll-smooth px-1 py-1 items-center">
                  
                  {/* Search Button / Bar */}
                  <motion.div 
                    data-tutorial="search"
                    initial={false}
                    animate={{ width: isSearchOpen ? "100%" : "auto" }}
                    className={cn(
                        "relative flex items-center transition-all duration-300",
                        isSearchOpen ? "flex-1 min-w-[200px]" : "shrink-0"
                    )}
                  >
                    {!isSearchOpen ? (
                        <button
                            onClick={() => setIsSearchOpen(true)}
                            className="whitespace-nowrap rounded-full p-2.5 text-sm font-medium border flex items-center justify-center bg-background text-muted-foreground border-border hover:bg-accent hover:border-accent-foreground/20"
                        >
                            <Search size={18} />
                        </button>
                    ) : (
                        <div className="relative w-full">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                             <input
                                autoFocus
                                type="text"
                                placeholder="Buscar no cardápio..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onBlur={() => {
                                    if (!searchQuery) setIsSearchOpen(false);
                                }}
                                className="w-full pl-9 pr-9 py-2.5 rounded-full border border-primary/50 bg-background text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 outline-none"
                             />
                             <button 
                                onClick={() => {
                                    setSearchQuery("");
                                    setIsSearchOpen(false);
                                }} 
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}
                  </motion.div>

                  {/* Categories */}
                  {categories.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    const getIcon = (category: string) => {
                      const lower = category.toLowerCase();
                      const iconClass = cn("shrink-0", isSelected ? "text-orange-500" : "text-muted-foreground");
                      
                      if (category === "Todos") return <LayoutGrid size={18} className={iconClass} />;
                      if (lower.includes("prato principal")) return <UtensilsCrossed size={18} className={iconClass} />;
                      if (lower.includes("vegetariana") || lower.includes("vegano")) return <Leaf size={18} className={iconClass} />;
                      if (lower.includes("guarnição") || lower.includes("arroz") || lower.includes("feijão")) return <CookingPot size={18} className={iconClass} />;
                      if (lower.includes("salada")) return <Salad size={18} className={iconClass} />;
                      if (lower.includes("sobremesa") || lower.includes("doce")) return <IceCream size={18} className={iconClass} />;
                      if (lower.includes("fruta")) return <Apple size={18} className={iconClass} />;
                      if (lower.includes("suco")) return <CupSoda size={18} className={iconClass} />;
                      if (lower.includes("bebida")) return <Coffee size={18} className={iconClass} />;
                      if (lower.includes("grelhado") || lower.includes("chapa")) return <Flame size={18} className={iconClass} />;
                      return <UtensilsCrossed size={18} className={iconClass} />;
                    };

                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        disabled={ordersAllowed && isCutoffPassed}
                        className={cn(
                          "whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 border disabled:opacity-50 flex items-center gap-2",
                          isSelected
                            ? "bg-foreground text-background border-foreground shadow-lg scale-105"
                            : "bg-background text-muted-foreground border-border hover:bg-accent hover:border-accent-foreground/20"
                        )}
                      >
                        {getIcon(cat)}
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Menu Grid */}
              <div className={cn("space-y-4", ordersAllowed && (isCutoffPassed || isFutureLocked) && "opacity-50 pointer-events-none grayscale")}>
                <div data-tutorial="food-grid" className="flex items-center justify-between">
                  <h2 className="font-bold text-foreground text-[15px]">
                    {selectedCategory === "Todos"
                      ? (ordersAllowed ? "Vamos escolher seu almoço?" : "O que você comeu hoje?")
                      : selectedCategory}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {filteredItems.length} {filteredItems.length === 1 ? "item" : "itens"}
                  </span>
                </div>

                {loading ? (
                  <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <SkeletonCard key={i} />
                    ))}
                  </div>
                ) : (
                  <motion.div
                    layout
                    className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4"
                  >
                    <AnimatePresence mode="popLayout">
                      {filteredItems.map((item, index) => (
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: 0.9, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                          transition={{ type: "spring", stiffness: 300, damping: 25 }}
                          key={item.id}
                          {...(index === 0 ? { "data-tutorial": "food-card" } : {})}
                        >
                          <MenuItemCard item={item} ordersAllowed={ordersAllowed} isFirstCard={index === 0} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}

                {!loading && filteredItems.length === 0 && menuItems.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-20 text-center bg-accent/30 rounded-3xl border border-dashed border-border"
                  >
                    <div className="w-16 h-16 rounded-full bg-accent mb-4 flex items-center justify-center">
                      <ShoppingBag size={24} className="text-muted-foreground" />
                    </div>
                    <p className="text-lg font-medium text-foreground">Nenhum item encontrado</p>
                    <p className="text-sm text-muted-foreground max-w-xs mt-1">
                      Não encontramos itens disponíveis nesta categoria para a data selecionada.
                    </p>
                  </motion.div>
                )}
              </div>
            </>
            )}
          </>
          )}

          {/* Bottom Actions */}
          <div className="pt-6 space-y-4">
            {isToday && !orderForDate && ordersAllowed && userCanOrderMeal && (
              <AbstentionButton
                hasAbstained={hasAbstained}
                absLoading={absLoading}
                isCutoffPassed={isCutoffPassed}
                onToggle={toggleAbstention}
              />
            )}

            {/* Link discreto para receitas */}
            <div className="flex justify-center">
              <Link
                to="/receitas"
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-all"
              >
                <BookOpen size={13} />
                Ver receitas disponíveis
              </Link>
            </div>

            <div className="flex items-center justify-center gap-4 py-2 opacity-60">
              <Link
                to="/food-care"
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline transition-all"
              >
                Cuidados com sua comida
              </Link>
              <span className="text-border text-[10px]">|</span>
              <Link
                to="/measurements"
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline transition-all"
              >
                Tabela de Medidas
              </Link>
              <span className="text-border text-[10px]">|</span>
              <Link
                to="/team"
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline transition-all"
              >
                Equipe Responsável
              </Link>
            </div>
          </div>

          {/* Dialogs */}
          <ConfirmDialog
            open={deleteDialogOpen}
            onOpenChange={(v) => setDeleteDialogOpen(v)}
            onConfirm={confirmDeleteOrder}
            title="Excluir Pedido?"
            description="O pedido será removido permanentemente e os itens voltarão para o estoque. Você poderá fazer um novo pedido."
            confirmLabel="Sim, Excluir"
            cancelLabel="Não, Voltar"
            variant="destructive"
          />

          <ConfirmDialog
            open={editDialogOpen}
            onOpenChange={(v) => setEditDialogOpen(v)}
            onConfirm={confirmEditOrder}
            title="Editar Pedido?"
            description="Isso cancelará seu pedido atual e adicionará os mesmos itens ao carrinho para você modificar."
            confirmLabel="Editar"
            cancelLabel="Cancelar"
          />

          <RatingSheet
            order={lastOrder}
            isOpen={isRatingOpen}
            onClose={() => setIsRatingOpen(false)}
            onSubmit={handleRatingSubmit}
            isManualLog={isManualLog}
          />

          {/* Footer Spacer */}
          <div className="h-2" />
        </div>

        {/* Floating Cart Bar — visible for Damasceno (order) and Taipas (manual log) */}
        <AnimatePresence>
          {totalItems > 0 && !orderForDate && (ordersAllowed ? userCanOrderMeal : true) && (
            <motion.div
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 80 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-8 md:w-96 z-40"
            >
              <button
                onClick={() => navigate("/cart")}
                className={`w-full flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 shadow-xl active:scale-[0.98] transition-all ${
                  isManualLog
                    ? "bg-blue-600 text-white shadow-blue-500/30 hover:shadow-blue-500/40"
                    : "bg-primary text-primary-foreground shadow-primary/30 hover:shadow-primary/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                    {isManualLog
                      ? <ClipboardList size={16} className="text-white" />
                      : <ShoppingBag size={16} className="text-white" />
                    }
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-xs font-bold">
                      {totalItems} {totalItems === 1 ? "item" : "itens"}
                    </span>
                    <span className="text-[10px] text-white/70">{totalCalories} kcal</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">
                    {isManualLog ? "Meu Registro" : "Ver Sacola"}
                  </span>
                  <ChevronRight size={16} />
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Onboarding Tutorial for first-time users */}
        <OnboardingTutorial />
      </div>
    </PullToRefresh>
  );
}