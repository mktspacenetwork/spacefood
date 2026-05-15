import { MapPin, ChevronDown, X, Check, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../context/auth-context";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";

interface CompanyUnit {
  name: string;
  allowOrders: boolean;
}

interface UnitSelectorProps {
  selectedUnit: string;
  setSelectedUnit: (unit: string) => void;
  setConsumptionMode: (mode: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onAllowOrdersChange?: (allowed: boolean) => void;
}

const MODE_MAP: Record<string, string> = {
  "Sede Damasceno": "dine_in_damasceno",
  "Sede Taipas": "dine_in_taipas",
  "Externo (Marmita)": "takeout_external",
};

function getModeForUnit(unit: string): string {
  return MODE_MAP[unit] ?? "dine_in_damasceno";
}

export function UnitSelector({
  selectedUnit,
  setSelectedUnit,
  setConsumptionMode,
  isOpen,
  setIsOpen,
  onAllowOrdersChange,
}: UnitSelectorProps) {
  const { updateUserProfile } = useAuth();
  const [availableUnits, setAvailableUnits] = useState<CompanyUnit[]>([]);
  const [pendingUnit, setPendingUnit] = useState<string>(selectedUnit);
  const [isSaving, setIsSaving] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect desktop
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setIsDesktop(e.matches);
    handler(mql);
    mql.addEventListener("change", handler as any);
    return () => mql.removeEventListener("change", handler as any);
  }, []);

  // Sync pendingUnit when sheet opens
  useEffect(() => {
    if (isOpen) {
      setPendingUnit(selectedUnit);
    }
  }, [isOpen, selectedUnit]);

  // Fetch available units from admin settings
  useEffect(() => {
    api
      .get("/admin/settings")
      .then((settings) => {
        const rawUnits = settings?.units;
        if (Array.isArray(rawUnits) && rawUnits.length > 0) {
          if (typeof rawUnits[0] === "string") {
            setAvailableUnits(
              (rawUnits as string[]).map((u) => ({ name: u, allowOrders: true }))
            );
          } else {
            setAvailableUnits(rawUnits as CompanyUnit[]);
          }
        } else {
          setAvailableUnits([
            { name: "Sede Damasceno", allowOrders: true },
            { name: "Sede Taipas", allowOrders: true },
            { name: "Externo (Marmita)", allowOrders: true },
          ]);
        }
      })
      .catch(() => {
        setAvailableUnits([
          { name: "Sede Damasceno", allowOrders: true },
          { name: "Sede Taipas", allowOrders: true },
          { name: "Externo (Marmita)", allowOrders: true },
        ]);
      });
  }, []);

  // Notify parent of allowOrders status whenever selectedUnit or availableUnits change
  useEffect(() => {
    if (availableUnits.length === 0) return;
    const current = availableUnits.find((u) => u.name === selectedUnit);
    onAllowOrdersChange?.(current ? current.allowOrders !== false : true);
  }, [selectedUnit, availableUnits, onAllowOrdersChange]);

  // Close desktop dropdown on outside click
  useEffect(() => {
    if (!isDesktop || !isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isDesktop, isOpen, setIsOpen]);

  const hasChanges = pendingUnit !== selectedUnit;

  // Get current unit config
  const currentUnitConfig = availableUnits.find((u) => u.name === selectedUnit);
  const currentAllowOrders = currentUnitConfig ? currentUnitConfig.allowOrders !== false : true;

  // Desktop: select immediately on hover click
  const handleDesktopSelect = async (unit: string) => {
    if (unit === selectedUnit) {
      setIsOpen(false);
      return;
    }
    setIsSaving(true);
    try {
      await updateUserProfile(undefined, undefined, undefined, undefined, unit);
      setSelectedUnit(unit);
      setConsumptionMode(getModeForUnit(unit));
      const unitConfig = availableUnits.find((u) => u.name === unit);
      onAllowOrdersChange?.(unitConfig ? unitConfig.allowOrders !== false : true);
      toast.success(`Unidade alterada para ${unit}`);
      setIsOpen(false);
    } catch {
      toast.error("Nao foi possivel salvar a unidade.");
    } finally {
      setIsSaving(false);
    }
  };

  // Mobile: save pending
  const handleMobileSave = async () => {
    if (!hasChanges || isSaving) return;
    setIsSaving(true);
    try {
      await updateUserProfile(
        undefined,
        undefined,
        undefined,
        undefined,
        pendingUnit
      );
      setSelectedUnit(pendingUnit);
      setConsumptionMode(getModeForUnit(pendingUnit));
      const unitConfig = availableUnits.find((u) => u.name === pendingUnit);
      onAllowOrdersChange?.(unitConfig ? unitConfig.allowOrders !== false : true);
      toast.success(`Unidade alterada para ${pendingUnit}`);
      setIsOpen(false);
    } catch {
      toast.error("Nao foi possivel salvar a unidade.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleMouseEnter = () => {
    if (!isDesktop) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (!isDesktop) return;
    hoverTimeoutRef.current = setTimeout(() => {
      if (!isSaving) setIsOpen(false);
    }, 200);
  };

  return (
    <div
      className="relative"
      ref={dropdownRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger button */}
      <button
        data-tutorial="unit"
        onClick={() => setIsOpen(!isOpen)}
        className="text-[12px] font-bold text-muted-foreground tracking-wide flex items-center gap-1.5 bg-accent px-2 py-1 rounded-md border border-border hover:bg-accent/80 transition-colors w-fit"
      >
        <MapPin size={12} className="text-primary" />
        <span>{selectedUnit}</span>
        <ChevronDown
          size={10}
          className={cn(
            "opacity-50 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* ==================== DESKTOP DROPDOWN ==================== */}
      {isDesktop && (
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-2 z-50 min-w-[280px] rounded-xl border border-border bg-card shadow-xl overflow-hidden"
            >
              <div className="px-3 pt-3 pb-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Unidade de Almoco
                </p>
              </div>
              <div className="px-1.5 pb-1.5 space-y-0.5">
                {availableUnits.map((unit) => {
                  const isCurrent = selectedUnit === unit.name;
                  return (
                    <button
                      key={unit.name}
                      onClick={() => handleDesktopSelect(unit.name)}
                      disabled={isSaving}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all text-left",
                        isCurrent
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      <MapPin
                        size={14}
                        className={cn(
                          "shrink-0",
                          isCurrent
                            ? "text-primary"
                            : "text-muted-foreground"
                        )}
                      />
                      <span className="flex-1">{unit.name}</span>
                      {isCurrent && (
                        <Check size={14} className="text-primary shrink-0" />
                      )}
                      {isSaving && !isCurrent && (
                        <Loader2
                          size={14}
                          className="animate-spin text-muted-foreground shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ==================== MOBILE BOTTOM SHEET ==================== */}
      {!isDesktop && (
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />

              {/* Sheet */}
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 320 }}
                className="fixed bottom-0 left-0 right-0 z-[70] rounded-t-3xl border border-border bg-card shadow-xl overflow-hidden"
              >
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="h-1 w-10 rounded-full bg-border" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-2 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-foreground">
                      Unidade de Almoco
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      A sede onde voce realiza o almoco.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-muted-foreground hover:bg-accent/80 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Unit list */}
                <div className="px-4 pb-2 space-y-2">
                  {availableUnits.map((unit) => {
                    const isSelected = pendingUnit === unit.name;
                    return (
                      <button
                        key={unit.name}
                        onClick={() => setPendingUnit(unit.name)}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-2xl border-2 p-4 transition-all text-left",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background hover:border-primary/30"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-accent text-muted-foreground"
                          )}
                        >
                          <MapPin size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span
                            className={cn(
                              "text-sm font-semibold block",
                              isSelected ? "text-primary" : "text-foreground"
                            )}
                          >
                            {unit.name}
                          </span>
                        </div>
                        {isSelected && (
                          <Check size={16} className="text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Save */}
                <div className="px-4 pt-2 pb-12">
                  <AnimatePresence>
                    {hasChanges && (
                      <motion.button
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        onClick={handleMobileSave}
                        disabled={isSaving}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl h-12 bg-primary text-primary-foreground text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
                      >
                        {isSaving ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Check size={18} />
                        )}
                        Salvar Alteracoes
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}