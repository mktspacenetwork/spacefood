import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  MapPin,
  Clock,
  CalendarDays,
  Search,
  ChevronRight,
  ChevronLeft,
  X,
  Rocket,
  Megaphone,
  Smile,
  UtensilsCrossed,
  Bell,
  Plus,
  LayoutGrid,
} from "lucide-react";
import { cn } from "../../lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StepConfig {
  /** data-tutorial attribute value on the target element */
  selector: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Preferred tooltip placement relative to the spotlight */
  preferredPlacement: "bottom" | "top" | "bottom-left" | "bottom-right";
  accentColor: string;
  bgFrom: string;
  bgTo: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

/* ------------------------------------------------------------------ */
/*  Step definitions                                                    */
/* ------------------------------------------------------------------ */

const STEPS: StepConfig[] = [
  {
    selector: "unit",
    icon: <MapPin size={22} />,
    title: "Onde voce almoca?",
    description:
      "Toque aqui para escolher a sede onde voce faz suas refeicoes. Troque sempre que precisar!",
    preferredPlacement: "bottom",
    accentColor: "text-violet-500",
    bgFrom: "from-violet-500",
    bgTo: "to-purple-600",
  },
  {
    selector: "cutoff",
    icon: <Clock size={22} />,
    title: "Horario limite",
    description:
      "Aqui voce ve ate que horas pode fazer ou alterar seu pedido. Fique atento ao relogio!",
    preferredPlacement: "bottom-left",
    accentColor: "text-orange-500",
    bgFrom: "from-orange-500",
    bgTo: "to-amber-600",
  },
  {
    selector: "dates",
    icon: <CalendarDays size={22} />,
    title: "Outros dias",
    description:
      "Toque na data para ver o cardapio de amanha e dos proximos dias. Planeje suas refeicoes!",
    preferredPlacement: "bottom-left",
    accentColor: "text-blue-500",
    bgFrom: "from-blue-500",
    bgTo: "to-cyan-600",
  },
  {
    selector: "notices",
    icon: <Megaphone size={22} />,
    title: "Avisos importantes",
    description:
      "Fique de olho neste banner! Aqui aparecem comunicados da cozinha, mudancas no cardapio e avisos da nutricionista.",
    preferredPlacement: "bottom",
    accentColor: "text-amber-500",
    bgFrom: "from-amber-500",
    bgTo: "to-yellow-600",
  },
  {
    selector: "search",
    icon: <Search size={22} />,
    title: "Buscar no cardapio",
    description:
      "Use a lupa para procurar qualquer prato pelo nome. Encontre rapidamente o que deseja!",
    preferredPlacement: "bottom",
    accentColor: "text-emerald-500",
    bgFrom: "from-emerald-500",
    bgTo: "to-green-600",
  },
  {
    selector: "food-grid",
    icon: <LayoutGrid size={22} />,
    title: "Alimentos disponiveis",
    description:
      "Aqui voce encontra todos os pratos disponiveis para o dia. O contador ao lado mostra quantas opcoes existem. Explore as categorias!",
    preferredPlacement: "bottom",
    accentColor: "text-lime-500",
    bgFrom: "from-lime-500",
    bgTo: "to-green-600",
  },
  {
    selector: "food-card",
    icon: <UtensilsCrossed size={22} />,
    title: "Conheca o cardapio",
    description:
      "Cada card mostra a foto do prato, nome, descricao, calorias e a porcao permitida. Visualize tudo antes de escolher!",
    preferredPlacement: "bottom",
    accentColor: "text-teal-500",
    bgFrom: "from-teal-500",
    bgTo: "to-emerald-600",
  },
  {
    selector: "order",
    icon: <Plus size={22} />,
    title: "Adicione ao pedido",
    description:
      "Toque neste botao \"+\" para adicionar o prato a sua sacola. Depois, va ate \"Ver Sacola\" para revisar e enviar!",
    preferredPlacement: "top",
    accentColor: "text-rose-500",
    bgFrom: "from-rose-500",
    bgTo: "to-pink-600",
  },
  {
    selector: "abstention",
    icon: <Smile size={22} />,
    title: "Nao vai almocar?",
    description:
      "Se nao for almocar hoje, toque aqui para avisar a cozinha. Isso ajuda a reduzir o desperdicio de alimentos!",
    preferredPlacement: "top",
    accentColor: "text-sky-500",
    bgFrom: "from-sky-500",
    bgTo: "to-indigo-600",
  },
  {
    selector: "notifications",
    icon: <Bell size={22} />,
    title: "Suas notificacoes",
    description:
      "Aqui voce recebe alertas sobre o status do seu pedido, avisos da cozinha e comunicados importantes. Fique de olho!",
    preferredPlacement: "top",
    accentColor: "text-purple-500",
    bgFrom: "from-purple-500",
    bgTo: "to-violet-600",
  },
];

const STORAGE_KEY = "spacefood_onboarding_done";
const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 14;

/* ------------------------------------------------------------------ */
/*  Helper: measure element                                            */
/* ------------------------------------------------------------------ */

function getElementRect(selector: string): Rect | null {
  // Find all matching elements and pick the first one that is actually visible
  const els = document.querySelectorAll(`[data-tutorial="${selector}"]`);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        bottom: r.bottom,
        right: r.right,
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Helper: compute tooltip position                                   */
/* ------------------------------------------------------------------ */

function computeTooltipStyle(
  rect: Rect,
  placement: StepConfig["preferredPlacement"],
  viewW: number,
  viewH: number
): React.CSSProperties {
  const TOOLTIP_W = Math.min(300, viewW - 32);
  const GAP = 16;

  // Determine vertical position
  let top: number;
  const spaceBelow = viewH - rect.bottom - SPOTLIGHT_PADDING;
  const spaceAbove = rect.top - SPOTLIGHT_PADDING;

  const actualPlacement =
    placement === "top" && spaceAbove > 200
      ? "top"
      : spaceBelow > 200
      ? "bottom"
      : spaceAbove > spaceBelow
      ? "top"
      : "bottom";

  if (actualPlacement === "top") {
    top = rect.top - SPOTLIGHT_PADDING - GAP;
  } else {
    top = rect.bottom + SPOTLIGHT_PADDING + GAP;
  }

  // Determine horizontal position
  let left: number;
  if (
    placement === "bottom-left" ||
    rect.left + TOOLTIP_W > viewW - 16
  ) {
    // Align right edge with spotlight right edge
    left = Math.max(16, rect.right + SPOTLIGHT_PADDING - TOOLTIP_W);
  } else {
    // Align left edge with spotlight left edge
    left = Math.max(16, rect.left - SPOTLIGHT_PADDING);
  }

  // Ensure tooltip stays within viewport
  if (left + TOOLTIP_W > viewW - 16) {
    left = viewW - 16 - TOOLTIP_W;
  }

  return {
    position: "fixed" as const,
    top: actualPlacement === "top" ? undefined : top,
    bottom: actualPlacement === "top" ? viewH - top : undefined,
    left,
    width: TOOLTIP_W,
    zIndex: 10002,
  };
}

/* ------------------------------------------------------------------ */
/*  Helper: compute arrow style                                        */
/* ------------------------------------------------------------------ */

function computeArrowStyle(
  rect: Rect,
  tooltipStyle: React.CSSProperties,
  viewH: number
): { style: React.CSSProperties; isTop: boolean } {
  const tooltipLeft = (tooltipStyle.left as number) || 0;
  const tooltipW = (tooltipStyle.width as number) || 300;

  // Arrow points to center of spotlight element
  const spotlightCenterX = rect.left + rect.width / 2;
  let arrowLeft = spotlightCenterX - tooltipLeft - 8; // 8 = half arrow width
  arrowLeft = Math.max(16, Math.min(arrowLeft, tooltipW - 32));

  const isTop = tooltipStyle.bottom !== undefined;

  return {
    style: {
      position: "absolute" as const,
      left: arrowLeft,
      ...(isTop ? { bottom: -8 } : { top: -8 }),
    },
    isTop,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function OnboardingTutorial() {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [viewportSize, setViewportSize] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });
  const [direction, setDirection] = useState(0);
  const touchStartRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  // Filter steps to only those whose target elements exist in the DOM
  const [activeSteps, setActiveSteps] = useState<StepConfig[]>(STEPS);

  // Check if tutorial already completed
  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => {
        // Compute which steps are visible (element exists AND has non-zero dimensions)
        const visible = STEPS.filter(
          (s) => getElementRect(s.selector) !== null
        );
        setActiveSteps(visible.length > 0 ? visible : STEPS);
        setIsVisible(true);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  // Lock body scroll when tutorial is visible
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isVisible]);

  // Track viewport size
  useEffect(() => {
    const handler = () =>
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Measure target element whenever step changes
  useEffect(() => {
    if (!isVisible) return;

    const measure = () => {
      const rect = getElementRect(activeSteps[currentStep].selector);
      setTargetRect(rect);
    };

    // Measure after a short delay to account for layout
    const t = setTimeout(measure, 80);

    // Also measure on scroll (in case scrolling happens)
    const scrollHandler = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", scrollHandler, true);

    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", scrollHandler, true);
      cancelAnimationFrame(rafRef.current);
    };
  }, [isVisible, currentStep, activeSteps]);

  // Scroll target into view
  useEffect(() => {
    if (!isVisible) return;
    const el = document.querySelector(
      `[data-tutorial="${activeSteps[currentStep].selector}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isVisible, currentStep, activeSteps]);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsVisible(false);
  }, []);

  const next = useCallback(() => {
    if (currentStep < activeSteps.length - 1) {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    } else {
      finish();
    }
  }, [currentStep, finish, activeSteps]);

  const prev = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const diff = touchStartRef.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
    touchStartRef.current = null;
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isVisible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isVisible, next, prev, finish]);

  const step = activeSteps[currentStep];
  const isLast = currentStep === activeSteps.length - 1;
  const progress = ((currentStep + 1) / activeSteps.length) * 100;

  const tooltipStyle = useMemo(() => {
    if (!targetRect) return { position: "fixed" as const, top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: Math.min(300, viewportSize.w - 32), zIndex: 10002 };
    return computeTooltipStyle(
      targetRect,
      step.preferredPlacement,
      viewportSize.w,
      viewportSize.h
    );
  }, [targetRect, step.preferredPlacement, viewportSize]);

  const arrowInfo = useMemo(() => {
    if (!targetRect || !tooltipStyle) return null;
    return computeArrowStyle(targetRect, tooltipStyle, viewportSize.h);
  }, [targetRect, tooltipStyle, viewportSize.h]);

  if (!isVisible) return null;

  // Spotlight rect with padding
  const spotX = targetRect
    ? targetRect.left - SPOTLIGHT_PADDING
    : 0;
  const spotY = targetRect
    ? targetRect.top - SPOTLIGHT_PADDING
    : 0;
  const spotW = targetRect
    ? targetRect.width + SPOTLIGHT_PADDING * 2
    : 0;
  const spotH = targetRect
    ? targetRect.height + SPOTLIGHT_PADDING * 2
    : 0;

  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0"
          style={{ zIndex: 10000 }}
        >
          {/* ---- SVG overlay with spotlight hole ---- */}
          <svg
            className="fixed inset-0"
            style={{ zIndex: 10000, pointerEvents: "none" }}
            width="100%"
            height="100%"
          >
            <defs>
              <mask id="spotlight-mask">
                <rect width="100%" height="100%" fill="white" />
                {targetRect && (
                  <motion.rect
                    initial={false}
                    animate={{
                      x: spotX,
                      y: spotY,
                      width: spotW,
                      height: spotH,
                    }}
                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    rx={SPOTLIGHT_RADIUS}
                    ry={SPOTLIGHT_RADIUS}
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.72)"
              mask="url(#spotlight-mask)"
            />
          </svg>

          {/* ---- Spotlight glow ring ---- */}
          {targetRect && (
            <motion.div
              initial={false}
              animate={{
                top: spotY - 3,
                left: spotX - 3,
                width: spotW + 6,
                height: spotH + 6,
              }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed rounded-[17px] pointer-events-none"
              style={{
                zIndex: 10001,
                boxShadow: "0 0 0 2px rgba(255,255,255,0.5), 0 0 20px 4px rgba(255,255,255,0.15)",
              }}
            />
          )}

          {/* ---- Pulsing ring animation ---- */}
          {targetRect && (
            <motion.div
              initial={false}
              animate={{
                top: spotY - 6,
                left: spotX - 6,
                width: spotW + 12,
                height: spotH + 12,
              }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed rounded-[20px] pointer-events-none"
              style={{ zIndex: 10001 }}
            >
              <span className="absolute inset-0 rounded-[20px] animate-ping opacity-20 border-2 border-white" />
            </motion.div>
          )}

          {/* ---- Clickable backdrop (outside spotlight) ---- */}
          <div
            className="fixed inset-0"
            style={{ zIndex: 10001, cursor: "pointer" }}
            onClick={next}
          />

          {/* ---- Tooltip card ---- */}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              initial={{ opacity: 0, y: direction >= 0 ? 20 : -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: direction >= 0 ? -20 : 20, scale: 0.95 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              style={tooltipStyle}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* Arrow */}
              {arrowInfo && targetRect && (
                <div style={arrowInfo.style} className="relative z-10">
                  <div
                    className={cn(
                      "w-4 h-4 bg-card border border-border",
                      arrowInfo.isTop ? "rotate-45 border-t-0 border-l-0" : "rotate-45 border-b-0 border-r-0"
                    )}
                    style={{ borderRadius: 2 }}
                  />
                </div>
              )}

              {/* Card content */}
              <div className="relative bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                {/* Progress bar at top */}
                <div className="h-1 bg-border/30">
                  <motion.div
                    className={cn("h-full bg-gradient-to-r", step.bgFrom, step.bgTo)}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>

                <div className="p-4">
                  {/* Header row */}
                  <div className="flex items-center gap-3 mb-2.5">
                    {/* Icon */}
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md shrink-0",
                        step.bgFrom,
                        step.bgTo
                      )}
                    >
                      {step.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[15px] font-extrabold text-foreground tracking-tight leading-tight">
                          {step.title}
                        </h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            finish();
                          }}
                          className="text-muted-foreground hover:text-foreground p-1 -mr-1 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        {currentStep + 1} / {activeSteps.length}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                    {step.description}
                  </p>

                  {/* Footer: dots + buttons */}
                  <div className="flex items-center justify-between">
                    {/* Dots */}
                    <div className="flex items-center gap-1.5">
                      {activeSteps.map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            "h-1.5 rounded-full transition-all duration-300",
                            i === currentStep
                              ? cn("w-5 bg-gradient-to-r", step.bgFrom, step.bgTo)
                              : i < currentStep
                              ? "w-1.5 bg-muted-foreground/40"
                              : "w-1.5 bg-border"
                          )}
                        />
                      ))}
                    </div>

                    {/* Nav buttons */}
                    <div className="flex items-center gap-2">
                      {currentStep > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            prev();
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent transition-all"
                        >
                          <ChevronLeft size={16} />
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          next();
                        }}
                        className={cn(
                          "flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-bold text-white transition-all active:scale-[0.97] shadow-md",
                          "bg-gradient-to-r",
                          step.bgFrom,
                          step.bgTo
                        )}
                      >
                        {isLast ? (
                          <>
                            <Rocket size={14} />
                            Comecar!
                          </>
                        ) : (
                          <>
                            Proximo
                            <ChevronRight size={14} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* ---- Skip button (top right) ---- */}
          <button
            onClick={finish}
            className="fixed top-4 right-4 flex items-center gap-1.5 text-white/60 hover:text-white text-xs font-medium transition-colors bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full"
            style={{ zIndex: 10003 }}
          >
            Pular tutorial
            <X size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}