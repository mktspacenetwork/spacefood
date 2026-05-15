import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bell, X } from "lucide-react";

interface PushToastData {
  id: string;
  title: string;
  body: string;
  icon?: string;
  tag?: string;
}

/**
 * InAppPushToast - Listens for push notifications forwarded from the
 * Service Worker via postMessage and displays an iOS-style banner at the
 * top of the screen while the user is actively browsing the app.
 */
export function InAppPushToast() {
  const [toasts, setToasts] = useState<PushToastData[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_RECEIVED") {
        const { title, body, icon, tag } = event.data.payload || {};
        const id = `push-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        setToasts((prev) => {
          // Avoid duplicate tags
          if (tag && prev.some((t) => t.tag === tag)) return prev;
          // Keep max 3 toasts
          const next = [...prev, { id, title, body, icon, tag }];
          return next.slice(-3);
        });

        // Auto-dismiss after 5 seconds
        setTimeout(() => removeToast(id), 5000);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [removeToast]);

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none flex flex-col items-center gap-2 pt-[env(safe-area-inset-top,12px)] px-3">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: -60, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="pointer-events-auto w-full max-w-md"
          >
            <div
              className="relative overflow-hidden rounded-2xl bg-card/95 backdrop-blur-xl border border-border/60 shadow-2xl shadow-black/15"
              onClick={() => removeToast(toast.id)}
            >
              {/* Top accent */}
              <div className="h-[2px] w-full bg-gradient-to-r from-orange-500 via-red-500 to-orange-400" />

              <div className="flex items-start gap-3 p-3.5 pr-10">
                {/* Icon */}
                <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-md shadow-orange-500/25">
                  {toast.icon ? (
                    <img src={toast.icon} alt="" className="h-6 w-6 rounded" />
                  ) : (
                    <Bell size={18} className="text-white" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">SpaceFood</span>
                    <span className="text-[10px] text-muted-foreground">agora</span>
                  </div>
                  <h4 className="text-sm font-bold text-foreground leading-tight mt-0.5 truncate">
                    {toast.title}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
                    {toast.body}
                  </p>
                </div>

                {/* Close */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeToast(toast.id);
                  }}
                  className="absolute top-3.5 right-3 h-6 w-6 flex items-center justify-center rounded-full bg-accent/80 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Fechar"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
