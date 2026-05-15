import { useEffect, forwardRef, useState, useRef } from "react";
import { useNotifications, AppNotification } from "../context/notification-context";
import { Bell, BellOff, CheckCheck, Info, AlertTriangle, ShoppingBag, Tag, Loader2, Inbox, Trash2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";

const typeConfig = {
  info: {
    icon: Info,
    gradient: "from-blue-500 to-blue-600",
    iconBg: "bg-blue-500",
    dotColor: "bg-blue-500",
    label: "Informação",
  },
  alert: {
    icon: AlertTriangle,
    gradient: "from-amber-500 to-orange-500",
    iconBg: "bg-amber-500",
    dotColor: "bg-amber-500",
    label: "Alerta",
  },
  order: {
    icon: ShoppingBag,
    gradient: "from-emerald-500 to-green-600",
    iconBg: "bg-emerald-500",
    dotColor: "bg-emerald-500",
    label: "Pedido",
  },
  promo: {
    icon: Tag,
    gradient: "from-orange-500 to-red-500",
    iconBg: "bg-orange-500",
    dotColor: "bg-orange-500",
    label: "Promoção",
  },
};

const NotificationCard = forwardRef<HTMLDivElement, { notification: AppNotification; onRead: (id: string) => void; onDismiss: (id: string) => void }>(
  ({ notification, onRead, onDismiss }, ref) => {
    const config = typeConfig[notification.type] || typeConfig.info;
    const Icon = config.icon;

    const timeAgo = (() => {
      try {
        return formatDistanceToNow(new Date(notification.sentAt), { addSuffix: true, locale: ptBR });
      } catch {
        return "há algum tempo";
      }
    })();

    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, x: -30, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onClick={() => !notification.read && onRead(notification.id)}
        className={cn(
          "relative group rounded-2xl bg-card border transition-all duration-200 overflow-hidden",
          !notification.read
            ? "border-border shadow-sm cursor-pointer active:scale-[0.98]"
            : "border-border/50 opacity-60"
        )}
      >
        <div className="flex gap-3.5 p-4">
          {/* Icon */}
          <div className={cn(
            "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl shadow-sm",
            config.iconBg
          )}>
            <Icon size={20} className="text-white" strokeWidth={2} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-sm text-foreground leading-tight flex-1">{notification.title}</h3>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!notification.read && (
                  <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                )}
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{notification.message}</p>
            <div className="flex items-center justify-between mt-1.5">
              {notification.sentByName && (
                <p className="text-[10px] text-muted-foreground/70">por {notification.sentByName}</p>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss(notification.id); }}
                className="ml-auto p-1.5 rounded-lg text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                title="Apagar notificação"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom accent line for unread */}
        {!notification.read && (
          <div className={cn("h-0.5 w-full bg-gradient-to-r", config.gradient)} />
        )}
      </motion.div>
    );
  }
);
NotificationCard.displayName = "NotificationCard";

export function Notifications() {
  const { notifications, unreadCount, loading, markRead, markAllRead, dismissNotification, dismissAllNotifications, fetchNotifications } = useNotifications();
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchNotifications();
  }, [fetchNotifications]);

  // Mark all as read when visiting the page (once)
  useEffect(() => {
    if (!loading && notifications.length > 0) {
      const hasUnread = notifications.some((n) => !n.read);
      if (hasUnread) markAllRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const unread = notifications.filter((n) => !n.read);
  const read = notifications.filter((n) => n.read);

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2 font-space-grotesk">
            Notificações
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {unreadCount > 0
              ? `${unreadCount} não ${unreadCount === 1 ? "lida" : "lidas"}`
              : "Tudo em dia!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllRead}
            className="gap-1.5 text-xs text-primary hover:text-primary/80 rounded-xl"
          >
            <CheckCheck size={14} />
            Marcar tudo
          </Button>
        )}
      </div>

      {/* Delete All Bar */}
      {notifications.length > 0 && !loading && (
        <div className="flex justify-end">
          {!showDeleteAllConfirm ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteAllConfirm(true)}
              className="gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl"
            >
              <Trash2 size={14} />
              Apagar todas
            </Button>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2"
            >
              <span className="text-xs font-medium text-red-600 dark:text-red-400">Apagar todas as notificações?</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { dismissAllNotifications(); setShowDeleteAllConfirm(false); }}
                className="h-7 px-3 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg"
              >
                Sim
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteAllConfirm(false)}
                className="h-7 px-3 text-xs font-bold text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
              >
                Não
              </Button>
            </motion.div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : notifications.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <div className="bg-accent/50 p-6 rounded-full mb-5">
            <Inbox className="h-12 w-12 text-muted-foreground/40" />
          </div>
          <h3 className="font-bold text-lg text-foreground">Nenhuma notificação</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs">
            Você não tem notificações no momento. Novos avisos aparecerão aqui.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-6">
          {/* Unread */}
          {unread.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                  Novas ({unread.length})
                </span>
              </div>
              <AnimatePresence mode="popLayout">
                {unread.map((n) => (
                  <NotificationCard key={n.id} notification={n} onRead={markRead} onDismiss={dismissNotification} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Read */}
          {read.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                  Anteriores ({read.length})
                </span>
              </div>
              <AnimatePresence mode="popLayout">
                {read.map((n) => (
                  <NotificationCard key={n.id} notification={n} onRead={markRead} onDismiss={dismissNotification} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}