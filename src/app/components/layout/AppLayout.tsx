import {
  User,
  Home,
  ShoppingBag,
  Bell,
  Settings,
  Lock,
  Star
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth, useCart, useNotifications } from "../../context/Store";
import { cn } from "../../lib/utils";
import { useState, useEffect, useRef } from "react";
import Lottie from "lottie-react";
import type { LottieRefCurrentProps } from "lottie-react";
import foodAnimation from "../../assets/food-animation.json";
import { PWAInstallBanner } from "../PWAInstallBanner";
import { api } from "../../lib/api";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();
  const { totalItems } = useCart();
  const { unreadCount, markAllRead } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const [ordersAllowed, setOrdersAllowed] = useState<boolean | null>(null);

  // Check if user's unit allows orders
  useEffect(() => {
    if (!user?.email) return;
    api.get("/admin/settings")
      .then(settings => {
        const userUnit = user.lunchLocation || '';
        const rawUnits = settings?.units;
        if (!rawUnits || !Array.isArray(rawUnits) || rawUnits.length === 0 || !userUnit) {
          setOrdersAllowed(true);
          return;
        }
        if (typeof rawUnits[0] === 'string') {
          setOrdersAllowed(true);
          return;
        }
        const unitConfig = rawUnits.find((u: any) => u.name === userUnit);
        setOrdersAllowed(unitConfig ? unitConfig.allowOrders !== false : true);
      })
      .catch(() => setOrdersAllowed(true));
  }, [user]);

  // Play Lottie once, then replay every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (lottieRef.current) {
        lottieRef.current.goToAndPlay(0);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!user) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  const canOrder = ordersAllowed !== false; // null (loading) = allow by default

  const navItems = [
    { label: "Inicio", href: "/", icon: Home, disabled: false },
    { label: "Sacola", href: "/cart", icon: ShoppingBag, disabled: !canOrder },
    ...(canOrder
      ? [{ label: "Pedidos", href: "/orders", icon: User, disabled: false }]
      : [{ label: "Avaliar", href: "/rate", icon: Star, disabled: false }]
    ),
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Desktop Sidebar — always expanded */}
      <aside
        className="hidden md:flex flex-col border-r border-border bg-card h-screen sticky top-0 transition-all duration-300 z-20 shadow-sm w-64"
      >
        {/* Logo */}
        <div className="h-16 flex items-center border-b border-border/50 px-5">
          <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
            <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Lottie animationData={foodAnimation} loop={false} className="h-7 w-7" lottieRef={lottieRef} />
            </div>
            <span className="text-xl tracking-tight font-[Space_Grotesk]">
              Space<span className="font-bold">Food</span>
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            if (item.disabled) {
              return (
                <div
                  key={item.href}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground/40 cursor-not-allowed select-none"
                  title="Pedidos nao disponiveis para sua unidade"
                >
                  <div className="relative flex-shrink-0">
                    <item.icon size={20} strokeWidth={2} />
                    <Lock size={9} className="absolute -bottom-0.5 -right-1 text-muted-foreground/60" />
                  </div>
                  <span className="whitespace-nowrap flex-1 text-left">
                    {item.label}
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} className="flex-shrink-0" />
                <span className="whitespace-nowrap flex-1 text-left">
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* Notifications link */}
          <Link
            to="/notifications"
            data-tutorial="notifications"
            onClick={() => unreadCount > 0 && markAllRead()}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative",
              location.pathname === "/notifications"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <div className="relative flex-shrink-0">
              <Bell size={20} strokeWidth={location.pathname === "/notifications" ? 2.5 : 2} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-orange-500 text-[9px] font-bold text-white flex items-center justify-center border-2 border-card">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <span className="whitespace-nowrap flex-1 text-left">
              Notificacoes
            </span>
            {unreadCount > 0 && (
              <span className="ml-auto bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </Link>
        </nav>

        {/* User Section */}
        <div className="mt-auto pt-4 px-3 border-t border-border">
          <button
            onClick={() => navigate("/settings")}
            className="flex items-center gap-3 rounded-xl bg-accent/50 p-2.5 w-full hover:bg-accent transition-all duration-200 cursor-pointer text-left"
          >
            <img
              src={user.avatar}
              alt={user.name}
              className="h-9 w-9 rounded-full object-cover ring-2 ring-background flex-shrink-0"
            />
            <div className="flex flex-col overflow-hidden flex-1">
              <span className="truncate text-sm font-semibold">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <Settings size={16} className="text-muted-foreground flex-shrink-0" />
          </button>
        </div>

        {/* Bottom padding */}
        <div className="h-4" />
      </aside>

      {/* Mobile Header */}
      <header className="fixed top-0 z-20 flex h-16 w-full items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-md px-4 md:hidden transition-all">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Lottie animationData={foodAnimation} loop={false} className="h-6 w-6" />
          </div>
          <span className="tracking-tight font-[Space_Grotesk] text-[20px]">Space<span className="font-bold">Food</span></span>
        </div>
        {/* Orange shopping bag icon replaces the avatar in the header */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => canOrder && navigate("/cart")}
            disabled={!canOrder}
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all active:scale-95",
              canOrder
                ? "bg-orange-500 shadow-orange-500/30 hover:bg-orange-600"
                : "bg-muted shadow-transparent cursor-not-allowed opacity-40"
            )}
          >
            <ShoppingBag size={18} className={canOrder ? "text-white" : "text-muted-foreground"} strokeWidth={2.5} />
            {canOrder && totalItems > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center border-2 border-background shadow-sm">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-28 md:pb-8 pt-20 md:pt-8 px-4 md:px-8 max-w-7xl mx-auto w-full overflow-x-hidden">
         {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe">
        <div className="absolute inset-0 bg-background/80 backdrop-blur-xl border-t border-border/50" />
        <div className="relative flex h-16 w-full items-center justify-around px-1">
          {navItems.map((item) => {
             const isActive = location.pathname === item.href;
             if (item.disabled) {
               return (
                 <div
                   key={item.href}
                   className="relative flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-1.5 text-muted-foreground/40 cursor-not-allowed select-none"
                   title="Pedidos não disponíveis para sua unidade"
                 >
                   <div className="relative">
                     <item.icon size={22} strokeWidth={2} />
                     <Lock size={9} className="absolute -bottom-0.5 -right-1 text-muted-foreground/60" />
                   </div>
                   <span className="text-[10px] font-medium">{item.label}</span>
                 </div>
               );
             }
             return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-1.5 transition-all duration-300",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className={cn(
                  "absolute -top-1 h-1 w-8 rounded-full bg-primary transition-all duration-300",
                  isActive ? "opacity-100 scale-100" : "opacity-0 scale-0"
                )} />
                <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} className={cn("transition-transform duration-300", isActive && "scale-110")} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
             )
          })}

          {/* Notifications Bell */}
          <Link
            to="/notifications"
            data-tutorial="notifications"
            onClick={() => unreadCount > 0 && markAllRead()}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-1.5 transition-all duration-300",
              location.pathname === "/notifications" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className={cn(
              "absolute -top-1 h-1 w-8 rounded-full bg-primary transition-all duration-300",
              location.pathname === "/notifications" ? "opacity-100 scale-100" : "opacity-0 scale-0"
            )} />
            <div className="relative">
              <Bell size={22} strokeWidth={location.pathname === "/notifications" ? 2.5 : 2} className={cn("transition-transform duration-300", location.pathname === "/notifications" && "scale-110")} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-orange-500 text-[9px] font-bold text-white flex items-center justify-center border border-background">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">Avisos</span>
          </Link>

          {/* Profile photo as Settings link */}
          <Link
            to="/settings"
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-1.5 transition-all duration-300",
              location.pathname === "/settings" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className={cn(
              "absolute -top-1 h-1 w-8 rounded-full bg-primary transition-all duration-300",
              location.pathname === "/settings" ? "opacity-100 scale-100" : "opacity-0 scale-0"
            )} />
            <div className={cn(
              "rounded-full overflow-hidden transition-all duration-300",
              location.pathname === "/settings"
                ? "ring-2 ring-primary ring-offset-1 ring-offset-background scale-110"
                : "ring-1 ring-border"
            )}>
              <img
                src={user.avatar}
                alt={user.name}
                className="h-6 w-6 object-cover"
              />
            </div>
            <span className="text-[10px] font-medium">Perfil</span>
          </Link>
        </div>
      </nav>
      <PWAInstallBanner />
    </div>
  );
}