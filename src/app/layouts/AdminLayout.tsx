import { useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import { 
  LayoutDashboard, 
  UtensilsCrossed, 
  CalendarDays, 
  Calendar,
  Settings, 
  Users, 
  BarChart3, 
  LogOut, 
  Menu as MenuIcon, 
  ChefHat,
  Sun,
  Moon,
  ClipboardCheck,
  X,
  MessageSquare,
  Bell,
  ClipboardList,
  Image as ImageIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  ClipboardPlus,
  Store,
  Clock,
  Save,
  Pen,
  Trash2,
  ShieldCheck,
  Lock,
  ScrollText,
  BookMarked,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/auth-context";
import { useNotifications } from "../context/notification-context";
import { useTheme } from "next-themes";
import { api } from "../lib/api";
import { toast } from "sonner";
import Lottie from "lottie-react";
import foodAnimation from "../assets/food-animation.json";
import { Badge } from "../components/ui/Badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { getBrazilDateString, getBrazilTimeString } from "../lib/date-utils";

// Grouped Menu Items
const MENU_GROUPS = [
  {
    title: "Operacional",
    items: [
      { icon: LayoutDashboard, label: "Visão Geral", path: "/admin", permKey: "dashboard" },
      { icon: ChefHat, label: "Cozinha (KDS)", path: "/admin/kitchen", permKey: "kds" },
      { icon: ClipboardList, label: "Pedidos", path: "/admin/orders", permKey: "orders" },
      { icon: ClipboardCheck, label: "Check-in", path: "/admin/checkin", permKey: "checkin" },
    ]
  },
  {
    title: "Gestão",
    items: [
      { icon: CalendarDays, label: "Cardápio", path: "/admin/menu-planner", permKey: "menu" },
      { icon: UtensilsCrossed, label: "Gestão de Pratos", path: "/admin/items", permKey: "items" },
      { icon: MessageSquare, label: "Avaliações", path: "/admin/reviews", permKey: "reviews" },
      { icon: BookMarked, label: "Sugestões de Receita", path: "/admin/recipe-suggestions", permKey: "recipe-suggestions" },
      { icon: Users, label: "Usuários & Permissões", path: "/admin/users", permKey: "users" },
    ]
  },
  {
    title: "Inteligência",
    items: [
      { icon: Trash2, label: "Desperdício", path: "/admin/waste", permKey: "waste", isComingSoon: true },
      { icon: BarChart3, label: "Relatórios", path: "/admin/reports", permKey: "reports" },
    ]
  },
  {
    title: "Administrativo",
    items: [
      { icon: ImageIcon, label: "Banners", path: "/admin/banners", permKey: "banners" },
      { icon: Bell, label: "Notifica\u00e7\u00f5es", path: "/admin/notifications", permKey: "notifications" },
      { icon: Settings, label: "Configura\u00e7\u00f5es", path: "/admin/settings", permKey: "settings" },
      { icon: ScrollText, label: "Log de Auditoria", path: "/admin/logs", permKey: "logs" },
    ]
  }
];

// Bottom Nav Items (Mobile) - Only the most important ones
const BOTTOM_NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Início", path: "/admin" },
  { icon: ChefHat, label: "Cozinha", path: "/admin/kitchen" },
  { icon: Trash2, label: "Desperdício", path: "/admin/waste", isComingSoon: true },
  { icon: ClipboardList, label: "Pedidos", path: "/admin/orders" },
  { icon: MenuIcon, label: "Menu", path: "MORE" }, // Triggers sidebar/drawer
];

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { unreadCount, markAllRead } = useNotifications();
  const unreadCountRef = useRef(unreadCount);
  useEffect(() => { unreadCountRef.current = unreadCount; }, [unreadCount]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [myPermissions, setMyPermissions] = useState<Record<string, boolean> | null>(null);
  const [settingsData, setSettingsData] = useState<{ unitName?: string, cutoffTime?: string }>({});
  const [badges, setBadges] = useState({ orders: 0, users: 0, reviews: 0 });
  
  const [seenBadgeCounts, setSeenBadgeCounts] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sf:admin:seen-badges');
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  const [isEditTimeOpen, setIsEditTimeOpen] = useState(false);
  const [tempCutoff, setTempCutoff] = useState("");

  // Persist seen counts
  useEffect(() => {
    localStorage.setItem('sf:admin:seen-badges', JSON.stringify(seenBadgeCounts));
  }, [seenBadgeCounts]);

  // Mark badge as "seen" when user navigates to the corresponding page
  useEffect(() => {
    const permKeyByPath: Record<string, string> = {};
    for (const group of MENU_GROUPS) {
      for (const item of group.items) {
        permKeyByPath[item.path] = item.permKey;
      }
    }
    const currentPath = location.pathname;
    const currentPermKey = permKeyByPath[currentPath];
    
    if (currentPermKey) {
      const currentCount =
        currentPermKey === 'orders' ? badges.orders :
        currentPermKey === 'users' ? badges.users :
        currentPermKey === 'reviews' ? badges.reviews : 0;
      
      if (currentCount > 0) {
        setSeenBadgeCounts(prev => ({ ...prev, [currentPermKey]: currentCount }));
      }
    }

    // Clear system notifications badge if visiting notification pages
    if (currentPath === "/admin/notifications" || currentPath === "/notifications") {
      if (unreadCountRef.current > 0) {
        markAllRead();
      }
    }
  }, [location.pathname, badges, markAllRead]);

  useEffect(() => {
    setMounted(true);
    // Load resolved permissions for current user + settings
    Promise.all([
      api.authGet("/admin/my-permissions").catch(() => null),
      api.get("/admin/settings").catch(() => ({})),
    ]).then(([perms, settings]) => {
      setMyPermissions(perms || null);
      setSettingsData(settings || {});
      setTempCutoff(settings?.cutoffTime || "10:30");
    });

    // Load badges (counts)
    const fetchBadges = async () => {
       if (!user) return;
       try {
         const todayStr = getBrazilDateString();
         const [dashData, usersData, reviewsData] = await Promise.all([
            api.authGet("/admin/dashboard").catch(() => ({})),
            api.authGet("/admin/users").catch(() => []),
            api.authGet("/admin/ratings").catch(() => [])
         ]);

         const ordersCount = dashData.todayOrdersCount || 0;
         
         const newUsers = Array.isArray(usersData) 
            ? usersData.filter((u: any) => u.created_at && getBrazilDateString(new Date(u.created_at)) === todayStr).length 
            : 0;

         const newReviews = Array.isArray(reviewsData)
            ? reviewsData.filter((r: any) => r.date && r.date.startsWith(todayStr)).length
            : 0;

         setBadges({ orders: ordersCount, users: newUsers, reviews: newReviews });
       } catch (e) {
         console.error("Failed to fetch badges", e);
       }
    };

    if (user && (user.role === 'admin' || user.role === 'master' || user.role === 'kitchen')) {
        fetchBadges();
        const interval = setInterval(fetchBadges, 30000);
        return () => clearInterval(interval);
    }
  }, [user]);

  const hasPermission = (permKey: string) => {
    if (!user) return false;
    // Master has access to everything always
    if (user.role === 'master') return true;
    // Kitchen role always sees recipe suggestions (primary audience)
    if (user.role === 'kitchen' && permKey === 'recipe-suggestions') return true;
    // While permissions are loading, show everything to avoid flicker
    if (myPermissions === null) return true;
    return myPermissions[permKey] === true;
  };

  // Determine the permKey for the current page (for PermissionGuard)
  const currentPagePermKey = (() => {
    for (const group of MENU_GROUPS) {
      for (const item of group.items) {
        if (location.pathname === item.path) return item.permKey;
      }
    }
    return null;
  })();

  const isCurrentPageBlocked =
    myPermissions !== null &&
    user?.role !== 'master' &&
    currentPagePermKey !== null &&
    myPermissions[currentPagePermKey] !== true;

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const getStoreStatus = () => {
    if (!settingsData.cutoffTime) return { isOpen: false, label: "Carregando..." };
    const [cutHours, cutMinutes] = settingsData.cutoffTime.split(':').map(Number);
    const timeStr = getBrazilTimeString();
    const [currentHours, currentMinutes] = timeStr.split(':').map(Number);
    const nowMins = currentHours * 60 + currentMinutes;
    const cutMins = cutHours * 60 + cutMinutes;
    if (nowMins < cutMins) {
      return { isOpen: true, label: "ABERTO" };
    } else {
      return { isOpen: false, label: "FECHADO" };
    }
  };

  const storeStatus = getStoreStatus();

  const handleUpdateCutoff = async () => {
    try {
      setSettingsData(prev => ({ ...prev, cutoffTime: tempCutoff }));
      setIsEditTimeOpen(false);
      await api.authPost("/admin/settings", { 
          ...settingsData, 
          cutoffTime: tempCutoff 
      });
      toast.success(`Horário de fechamento atualizado para ${tempCutoff}`);
    } catch (e) {
      toast.error("Erro ao atualizar horário");
    }
  };

  return (
    <div className="min-h-screen bg-muted/20 flex">
      {/* Desktop Sidebar (Collapsible) */}
      <aside 
        className={cn(
          "hidden lg:flex flex-col border-r bg-card h-screen sticky top-0 transition-all duration-300 z-50",
          isSidebarOpen ? "w-64" : "w-20"
        )}
      >
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-5 h-6 w-6 bg-card border border-border rounded-full flex items-center justify-center shadow-md text-muted-foreground hover:text-primary transition-colors z-[60] cursor-pointer"
        >
          {isSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="h-16 flex items-center justify-center border-b px-4">
          <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap w-full justify-start px-2">
             <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <Lottie animationData={foodAnimation} loop={false} className="h-7 w-7" />
             </div>
             <span className={cn("font-[Space_Grotesk] text-xl transition-opacity duration-200", isSidebarOpen ? "opacity-100" : "opacity-0 w-0")}>
               <span className="font-thin">Space</span>
               <span className="font-bold">Food</span>
             </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
           {MENU_GROUPS.map((group, idx) => (
             <div key={idx} className="px-3">
               {isSidebarOpen && (
                 <h3 className="mb-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider animate-in fade-in duration-300">
                   {group.title}
                 </h3>
               )}
               <div className="space-y-1">
                 {group.items.filter(item => hasPermission(item.permKey)).map((item) => {
                    const isActive = location.pathname === item.path;
                    let badgeCount = item.permKey === 'orders' ? badges.orders :
                                       item.permKey === 'users' ? badges.users :
                                       item.permKey === 'reviews' ? badges.reviews : 
                                       item.permKey === 'notifications' ? unreadCount : 0;
                    
                    const seenCount = seenBadgeCounts[item.permKey] || 0;
                    const displayCount = Math.max(0, badgeCount - (item.permKey === 'notifications' ? 0 : seenCount));
                    const showBadge = displayCount > 0;

                    return (
                      <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative",
                          isActive 
                            ? "bg-primary/10 text-primary" 
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          !isSidebarOpen && "justify-center"
                        )}
                        title={!isSidebarOpen ? item.label : undefined}
                      >
                        <div className="relative">
                          <item.icon size={20} className={cn("flex-shrink-0", isActive && "text-primary")} />
                          {!isSidebarOpen && showBadge && (
                            <span className="absolute -top-2 -right-2 h-4 w-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full border-2 border-card">
                              {displayCount > 9 ? "9+" : displayCount}
                            </span>
                          )}
                          {!isSidebarOpen && item.isComingSoon && (
                            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-gray-400 border border-card rounded-full" title="Em Breve" />
                          )}
                        </div>
                        
                        <span className={cn("whitespace-nowrap transition-all duration-300 flex-1 text-left flex items-center gap-1.5", isSidebarOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 absolute left-10 hidden")}>
                          {item.label}
                          {isSidebarOpen && item.isComingSoon && (
                            <span className="text-[8px] px-1 py-0.5 rounded-[4px] bg-gray-100 dark:bg-gray-800 text-gray-500 font-bold uppercase tracking-tighter border border-gray-200 dark:border-gray-700 ml-auto">
                              Breve
                            </span>
                          )}
                        </span>
                        
                        {isSidebarOpen && showBadge && (
                          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-5 flex items-center justify-center shadow-sm shadow-red-500/20 tabular-nums animate-in zoom-in duration-300">
                            {displayCount > 99 ? "99+" : displayCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
               </div>
               {idx < MENU_GROUPS.length - 1 && isSidebarOpen && <div className="mt-4 mx-2 h-[1px] bg-border/50" />}
             </div>
           ))}
        </div>

        <div className="p-4 border-t space-y-2">
            <button 
              onClick={handleSignOut}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors",
                !isSidebarOpen && "justify-center"
              )}
            >
              <LogOut size={20} className="rotate-180" />
              {isSidebarOpen && <span>Sair</span>}
            </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        {/* Top Header */}
        <header className="h-16 bg-card/80 backdrop-blur-md border-b sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
             {/* Mobile Logo */}
             <div className="lg:hidden flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ChefHat size={18} />
                </div>
                <span className="font-bold text-lg">SpaceFood</span>
             </div>
             
             {/* Desktop Title */}
             <div className="hidden lg:flex flex-col">
               <h1 className="text-sm font-medium text-muted-foreground">Admin Portal</h1>
               <span className="text-xs font-bold text-foreground">{settingsData.unitName || "Space Network"}</span>
             </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Store Status Toggle */}
            <Dialog open={isEditTimeOpen} onOpenChange={setIsEditTimeOpen}>
              <DialogTrigger asChild>
                <div 
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors hover:bg-accent select-none",
                    storeStatus.isOpen 
                      ? "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400" 
                      : "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400"
                  )}
                >
                   <div className={cn("h-2 w-2 rounded-full", storeStatus.isOpen ? "bg-green-500 animate-pulse" : "bg-red-500")} />
                   <div className="flex flex-col leading-none">
                     <span className="text-[10px] uppercase font-bold tracking-wider">{storeStatus.label}</span>
                     <span className="text-[9px] opacity-70 font-medium">Fecha às {settingsData.cutoffTime}</span>
                   </div>
                </div>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Alterar Horário de Fechamento</DialogTitle>
                  <DialogDescription>
                    Defina até que horas os pedidos serão aceitos hoje.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-center py-6">
                   <div className="flex flex-col items-center gap-2">
                       <Clock className="h-8 w-8 text-muted-foreground" />
                       <Input
                         type="time"
                         value={tempCutoff}
                         onChange={(e) => setTempCutoff(e.target.value)}
                         className="text-3xl font-bold h-16 w-48 text-center bg-accent/20 border-2 border-primary/20 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl"
                       />
                       <p className="text-xs text-muted-foreground mt-2">Horário atual: {settingsData.cutoffTime}</p>
                   </div>
                </div>
                <DialogFooter className="sm:justify-between gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary" className="w-full sm:w-auto">
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="button" onClick={handleUpdateCutoff} className="w-full sm:w-auto font-bold">
                    <Save className="mr-2 h-4 w-4" />
                    Salvar Alteração
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="h-6 w-[1px] bg-border mx-1"></div>

            <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full">
              {mounted && theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-auto w-auto rounded-xl hover:bg-accent px-2 py-2">
                  <div className="flex items-center gap-3">
                    <img 
                      src={user?.avatar} 
                      alt={user?.name} 
                      className="h-10 w-10 rounded-xl object-cover border border-primary/20 shadow-sm bg-muted flex-shrink-0"
                    />
                    <div className="hidden sm:flex flex-col items-start text-left">
                      <p className="text-sm font-medium leading-tight">{user?.name}</p>
                      <p className="text-xs text-muted-foreground leading-tight">{user?.email}</p>
                    </div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 mt-2" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/admin/settings')}>
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isCurrentPageBlocked ? (
              <PageAccessDenied onNavigateBack={() => navigate('/admin')} />
            ) : (
              <Outlet />
            )}
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t z-50 pb-safe lg:hidden">
        <div className="flex items-center justify-around h-16">
          {BOTTOM_NAV_ITEMS.map((item, index) => {
            const isActive = item.path !== "MORE" && location.pathname === item.path;
            const badgeCount = item.path === '/admin/orders' ? badges.orders : 0;
            const badgePermKey = item.path === '/admin/orders' ? 'orders' : '';
            
            return (
              <button
                key={index}
                onClick={() => {
                  if (item.path === "MORE") {
                    setIsMobileMenuOpen(true);
                  } else {
                    navigate(item.path);
                  }
                }}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full space-y-1 relative",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <div className="relative">
                  <item.icon size={20} className={cn(isActive && "fill-current/20")} />
                  {badgePermKey && (badgeCount - (seenBadgeCounts[badgePermKey] || 0) > 0) && (
                    <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full border border-card">
                      {badgeCount - (seenBadgeCounts[badgePermKey] || 0)}
                    </span>
                  )}
                  {(item as any).isComingSoon && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-gray-400 border border-card rounded-full" />
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile Full Menu Sheet */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-background lg:hidden flex flex-col animate-in slide-in-from-bottom-full duration-300">
          <div className="h-16 flex items-center justify-between px-4 border-b">
            <span className="font-bold text-lg">Menu Completo</span>
            <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={24} />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {MENU_GROUPS.map((group, idx) => (
               <div key={idx}>
                 <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                   {group.title}
                 </h3>
                 <div className="grid grid-cols-2 gap-3">
                   {group.items.filter(item => hasPermission(item.permKey)).map((item) => {
                     const badgeCount = item.permKey === 'orders' ? badges.orders :
                                        item.permKey === 'users' ? badges.users :
                                        item.permKey === 'reviews' ? badges.reviews : 
                                        item.permKey === 'notifications' ? unreadCount : 0;
                     const displayCount = Math.max(0, badgeCount - (item.permKey === 'notifications' ? 0 : (seenBadgeCounts[item.permKey] || 0)));
                     const showBadge = displayCount > 0;

                     return (
                      <button
                        key={item.path}
                        onClick={() => {
                          navigate(item.path);
                          setIsMobileMenuOpen(false);
                        }}
                        className={cn(
                          "flex flex-col items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent transition-all relative",
                          location.pathname === item.path && "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                        )}
                      >
                        <div className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center relative",
                          location.pathname === item.path ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}>
                          <item.icon size={20} />
                          {showBadge && (
                            <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-card shadow-sm">
                              {displayCount > 9 ? "9+" : displayCount}
                            </span>
                          )}
                          {item.isComingSoon && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded-[4px] bg-gray-400 text-white text-[7px] font-bold uppercase tracking-tighter shadow-sm border border-gray-500 z-10">
                              Breve
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-medium">{item.label}</span>
                      </button>
                     );
                   })}
                 </div>
               </div>
            ))}
            
            <Button 
              variant="destructive" 
              className="w-full gap-2 mt-8" 
              onClick={handleSignOut}
            >
              <LogOut size={18} /> Sair do Sistema
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page Access Denied ────────────────────────────────────────────────────────
function PageAccessDenied({ onNavigateBack }: { onNavigateBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <Lock size={28} className="text-destructive" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">Acesso Restrito</h2>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        Você não tem permissão para acessar esta página. Contate o administrador para solicitar acesso.
      </p>
      <Button onClick={onNavigateBack} className="gap-2">
        <LayoutDashboard size={16} />
        Voltar ao Início
      </Button>
    </div>
  );
}