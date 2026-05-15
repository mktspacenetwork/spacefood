import { useRef, useEffect } from "react";
import { format, isSameDay, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronRight, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";

interface MenuDatePickerProps {
  orderDate: Date;
  setOrderDate: (date: Date) => void;
  availableDates: Date[];
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  datesLoading: boolean;
}

function getDateLabel(date: Date) {
  const dayAndMonth = format(date, "dd/MM", { locale: ptBR });
  const weekDay = format(date, "EEEE", { locale: ptBR }).split('-')[0];
  const weekDayFormatted = weekDay.charAt(0).toUpperCase() + weekDay.slice(1);

  if (isSameDay(date, new Date())) return `Hoje, ${weekDayFormatted}, ${dayAndMonth}`;
  if (isSameDay(date, addDays(new Date(), 1))) return `Amanhã, ${weekDayFormatted}, ${dayAndMonth}`;
  return `${weekDayFormatted}, ${dayAndMonth}`;
}

export function MenuDatePicker({
  orderDate,
  setOrderDate,
  availableDates,
  isOpen,
  setIsOpen,
  datesLoading,
}: MenuDatePickerProps) {
  const datePickerRef = useRef<HTMLDivElement>(null);
  const selectedDateLabel = getDateLabel(orderDate);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={datePickerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={datesLoading}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm whitespace-nowrap",
          isOpen
            ? "bg-primary text-primary-foreground border-primary shadow-primary/20"
            : "bg-accent text-foreground border-border hover:bg-accent/80"
        )}
      >
        <CalendarDays size={14} className={isOpen ? "text-primary-foreground" : "text-primary"} />
        <span className="max-w-[120px] sm:max-w-[180px] truncate">{datesLoading ? "..." : selectedDateLabel}</span>
        <ChevronRight size={12} className={cn(
          "opacity-60 transition-transform duration-200",
          isOpen && "rotate-90"
        )} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 min-w-[200px] rounded-2xl border border-border bg-card shadow-xl overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-border">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Cardápios disponíveis
              </span>
            </div>
            {availableDates.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                Nenhum cardápio liberado
              </div>
            ) : (
              <div className="py-1 max-h-[240px] overflow-y-auto">
                {availableDates.map((date) => {
                  const isSelected = isSameDay(date, orderDate);
                  const label = getDateLabel(date);
                  const fullLabel = format(date, "EEEE, dd/MM", { locale: ptBR });
                  const capitalizedFull = fullLabel.charAt(0).toUpperCase() + fullLabel.slice(1);

                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => {
                        setOrderDate(date);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors",
                        isSelected ? "bg-primary/10" : "hover:bg-accent"
                      )}
                    >
                      <div className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold shrink-0",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-muted-foreground"
                      )}>
                        {format(date, "dd")}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={cn(
                          "text-sm font-bold truncate",
                          isSelected ? "text-primary" : "text-foreground"
                        )}>
                          {label}
                          {isSameDay(date, new Date()) && (
                            <span className="ml-1 text-[10px] bg-primary/20 text-primary px-1 rounded">Hoje</span>
                          )}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {capitalizedFull}
                        </span>
                      </div>
                      {isSelected && (
                        <CheckCircle size={14} className="ml-auto text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
