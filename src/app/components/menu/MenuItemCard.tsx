import { MenuItem } from "../../types";
import { useCart } from "../../context/Store";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { Plus, Minus, Flame, Dumbbell, Wheat, Droplets, Leaf, BookOpen, ClipboardList, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { hapticLight, hapticMedium } from "../../lib/haptics";

interface MenuItemCardProps {
  item: MenuItem;
  ordersAllowed?: boolean;
  isFirstCard?: boolean;
  isTodayOrder?: boolean;
}

export function MenuItemCard({ item, ordersAllowed = true, isFirstCard = false, isTodayOrder = true }: MenuItemCardProps) {
  const { addToCart, getItemQuantity, updateQuantity, removeFromCart, items } = useCart();
  const quantity = getItemQuantity(item.id);
  const [showRecipe, setShowRecipe] = useState(false);
  const hasRecipe = !!(item.recipe && item.recipe.trim());

  // Stock (available) is only meaningful for same-day orders.
  // Pre-orders for future dates skip the stock check — admin resets
  // stock daily, so today's counter doesn't reflect Friday's supply.
  // Items marked unlimitedStock (bulk staples like rice/beans) never sell out.
  const isSoldOut = isTodayOrder && !item.unlimitedStock && item.available <= 0;
  // Per-item portion limit check
  // For Prato Principal: also blocked when any OTHER Prato Principal is already in the cart
  const hasDifferentPPInCart =
    item.category === "Prato Principal" &&
    items.some((i) => i.category === "Prato Principal" && i.id !== item.id);
  const isLimitReached = quantity >= item.limit || hasDifferentPPInCart;
  const isPreviousDay = item.isPreviousDay || false;
  const isNotOnMenu = item.isNotOnMenu || false;

  const handleAdd = () => {
    if (isNotOnMenu) {
      toast.info("Este item não está no cardápio de hoje.");
      return;
    }
    if (isSoldOut) {
      toast.error("Item esgotado!");
      return;
    }
    if (isPreviousDay) {
      toast.info("Este item é do cardápio anterior. Aguarde o cardápio de hoje!");
      return;
    }
    hapticMedium();
    addToCart(item);
  };

  const handleIncrement = () => {
    if (isLimitReached) {
      toast.warning(`Limite de ${item.limit} unidades por pessoa.`);
      return;
    }
    hapticLight();
    updateQuantity(item.id, 1);
  };
  
  const handleDecrement = () => {
    hapticLight();
    if (quantity === 1) {
      removeFromCart(item.id);
    } else {
      updateQuantity(item.id, -1);
    }
  };

  return (
    <>
    <Card className={cn(
      "group relative overflow-hidden border-border bg-card shadow-sm transition-all hover:shadow-lg hover:-translate-y-1 duration-300 rounded-3xl",
      (isSoldOut || isNotOnMenu) && "opacity-60 grayscale",
      isPreviousDay && "grayscale opacity-70"
    )}>
      {/* Image Section */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        <img
          src={item.image}
          alt={item.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />

        {isSoldOut && !isNotOnMenu && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
            <span className="rounded-full bg-destructive px-2 py-1 sm:px-4 sm:py-1.5 text-[10px] sm:text-xs font-bold text-destructive-foreground uppercase tracking-wider shadow-lg">
              Esgotado
            </span>
          </div>
        )}

        {isNotOnMenu && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
            <span className="rounded-full bg-muted px-2 py-1 sm:px-4 sm:py-1.5 text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider shadow-lg border border-border">
              Não disponível hoje
            </span>
          </div>
        )}

        {isPreviousDay && !isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
            <span className="rounded-full bg-muted px-2 py-1 sm:px-4 sm:py-1.5 text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider shadow-lg border border-border">
              Cardápio Anterior
            </span>
          </div>
        )}
        
        <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 flex gap-2">
          <Badge className="bg-background/90 text-foreground backdrop-blur-md border-0 font-medium shadow-sm gap-1 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs">
            <Flame size={10} className="text-orange-500 fill-orange-500 sm:w-3 sm:h-3" />
            {item.calories} kcal
          </Badge>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex flex-col gap-2 p-3 sm:gap-3 sm:p-5">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-1">
            <h3 className="font-bold text-sm sm:text-lg text-foreground line-clamp-1 group-hover:text-primary transition-colors flex-1">{item.name}</h3>
            {hasRecipe && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); hapticLight(); setShowRecipe(true); }}
                className="shrink-0 flex items-center gap-0.5 text-[9px] sm:text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded-full leading-none transition-all hover:bg-amber-100 dark:hover:bg-amber-900/40 active:scale-95 cursor-pointer"
              >
                <BookOpen size={9} className="sm:w-2.5 sm:h-2.5" />
                Receita
              </button>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">{item.description}</p>
        </div>

        {/* Bottom: nutritional info + add/register button */}
        <div className="pt-2 border-t border-border border-dashed mt-1 space-y-2">
          {/* Nutritional Info Row — always visible */}
          <div className="flex items-center gap-1 flex-wrap">
            <NutriStat icon={<Flame size={10} className="text-orange-500 fill-orange-400" />} value={item.calories} unit="kcal" />
            {item.protein != null && (
              <NutriStat icon={<Dumbbell size={10} className="text-blue-500" />} value={item.protein} unit="g" />
            )}
            {item.carbs != null && (
              <NutriStat icon={<Wheat size={10} className="text-amber-500" />} value={item.carbs} unit="g" />
            )}
            {item.fat != null && (
              <NutriStat icon={<Droplets size={10} className="text-cyan-500" />} value={item.fat} unit="g" />
            )}
            {item.fiber != null && (
              <NutriStat icon={<Leaf size={10} className="text-green-500" />} value={item.fiber} unit="g" />
            )}
          </div>

          {/* Action Row */}
          {ordersAllowed ? (
            /* Damasceno: portion info + add-to-cart button */
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider leading-tight">
                  {item.unit === "un" ? "Porção" : item.unit}
                </span>
                <span className="text-[13px] font-bold text-foreground">
                  {item.limit} un.
                </span>
              </div>

              <AnimatePresence mode="wait">
                {quantity === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    key="add-button"
                  >
                    <Button
                      size="icon"
                      disabled={isSoldOut || isNotOnMenu}
                      onClick={handleAdd}
                      className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground h-9 w-9 shadow-lg shadow-primary/20"
                      {...(isFirstCard ? { "data-tutorial": "order" } : {})}
                    >
                      <Plus size={18} strokeWidth={2.5} />
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    className="flex items-center gap-1 sm:gap-2 bg-secondary rounded-full p-0.5"
                    key="controls"
                  >
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={handleDecrement}
                      className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-background text-foreground shadow-sm hover:bg-muted transition-colors touch-manipulation"
                    >
                      <Minus size={16} strokeWidth={3} />
                    </motion.button>
                    <span className="text-xs font-bold w-5 text-center tabular-nums text-foreground">{quantity}</span>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={handleIncrement}
                      disabled={isLimitReached}
                      className={cn(
                        "flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors touch-manipulation",
                        isLimitReached && "opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
                      )}
                    >
                      <Plus size={16} strokeWidth={3} />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            /* Taipas: "Registrar" button — marca o que comeu */
            <AnimatePresence mode="wait">
              {quantity === 0 ? (
                <motion.button
                  key="register-button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={handleAdd}
                  disabled={isSoldOut || isNotOnMenu}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-blue-100 dark:bg-blue-950/50 hover:bg-blue-200 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 py-1.5 text-xs font-semibold transition-colors touch-manipulation disabled:opacity-50"
                >
                  <ClipboardList size={13} />
                  Registrar
                </motion.button>
              ) : (
                <motion.div
                  key="register-controls"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                    <ClipboardList size={11} />
                    Registrado
                  </span>
                  <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 rounded-full p-0.5 border border-blue-200 dark:border-blue-800">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={handleDecrement}
                      className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-background text-foreground shadow-sm hover:bg-muted transition-colors touch-manipulation"
                    >
                      <Minus size={14} strokeWidth={3} />
                    </motion.button>
                    <span className="text-xs font-bold w-5 text-center tabular-nums text-blue-700 dark:text-blue-300">{quantity}</span>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={handleIncrement}
                      disabled={isLimitReached}
                      className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm hover:bg-blue-700 transition-colors touch-manipulation disabled:opacity-50"
                    >
                      <Plus size={14} strokeWidth={3} />
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </Card>

    {/* Recipe modal — opens when the "Receita" badge is tapped */}
    <AnimatePresence>
      {showRecipe && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowRecipe(false)}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
        >
          <motion.div
            initial={{ y: "100%", opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "100%", opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl"
          >
            {/* Header with image */}
            <div className="relative">
              <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
                <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
              </div>
              <button
                type="button"
                onClick={() => setShowRecipe(false)}
                className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg backdrop-blur-md hover:bg-background transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">{item.name}</h3>
                {item.description && (
                  <p className="text-sm text-muted-foreground italic mt-1 leading-relaxed">{item.description}</p>
                )}
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-4">
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles size={12} />
                  Modo de Preparo / Receita
                </p>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{item.recipe}</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

/* Small nutritional stat pill */
function NutriStat({ icon, value, unit }: { icon: React.ReactNode; value: number; unit: string }) {
  return (
    <div className="flex items-center gap-0.5 bg-muted/60 rounded-full px-1.5 py-0.5">
      {icon}
      <span className="text-[9px] font-semibold text-muted-foreground tabular-nums leading-none">
        {value}{unit}
      </span>
    </div>
  );
}