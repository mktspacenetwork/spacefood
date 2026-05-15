import { useState, useRef, useCallback, ReactNode } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

const THRESHOLD = 80;

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only enable pull-to-refresh when scrolled to top
    const el = e.currentTarget;
    if (el.scrollTop > 0 || window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      // Apply resistance
      const distance = Math.min(delta * 0.4, 120);
      setPullDistance(distance);
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, refreshing, onRefresh]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);

  return (
    <div
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence>
        {(pullDistance > 10 || refreshing) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-3"
            style={{ height: refreshing ? 48 : pullDistance * 0.5 }}
          >
            {refreshing ? (
              <Loader2 size={20} className="animate-spin text-primary" />
            ) : (
              <motion.div
                style={{ rotate: progress * 180 }}
                className="text-muted-foreground"
              >
                <ArrowDown size={20} className={progress >= 1 ? "text-primary" : ""} />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}
