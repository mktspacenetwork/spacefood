import { MenuItem } from "../../types";
import { useCart } from "../../context/Store";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { Plus, Minus, Flame, Dumbbell, Wheat, Droplets, Leaf } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { hapticLight, hapticMedium } from "../../lib/haptics";

interface MenuItemCardProps {
  item: MenuItem;
  ordersAllowed?: boolean;
  isFirstCard?: boolean;
}

function isEggItem(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("ovo") || n.includes("omelete");
}

export function MenuItemCard({ item, ordersAllowed = true, isFirstCard = false }: MenuItemCardProps) {
  const { addToCart, getItemQuantity, updateQuantity, removeFromCart, items } = useCart();
  const quantity = getItemQuantity(item.id);

  const isSoldOut = item.available <= 0;
  // Each item has its own authorized portion count — compare only this item's quantity against its own limit
  // For egg/omelete Prato Principal items: also blocked when a DIFFERENT egg item is already in the cart
  const hasDifferentEggInCart =
    item.category === "Prato Principal" &&
    isEggItem(item.name) &&
    items.some((i) => i.category === "Prato Principal" && isEggItem(i.name) && i.id !== item.id);
  const isLimitReached = quantity >= item.limit || hasDifferentEggInCart;
  const isPreviousDay = item.isPreviousDay || false;
  const isNotOnMenu = item.isNotOnMenu || false;

  const handleAdd = () => {
    if (!ordersAllowed) {
      toast.info("Pedidos desabilitados para sua unidade.");
      return;
    }
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
          <h3 className="font-bold text-sm sm:text-lg text-foreground line-clamp-1 group-hover:text-primary transition-colors">{item.name}</h3>
          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">{item.description}</p>
        </div>

        {/* Bottom: nutritional info (view-only) OR add button (orders allowed) */}
        {!ordersAllowed ? (
          /* Nutritional Info Row — compact, icon-only */
          <div className="pt-2 border-t border-border border-dashed mt-1">
            <div className="flex items-center justify-between gap-1">
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
          </div>
        ) : (
          <div className="flex items-center justify-between pt-2 border-t border-border border-dashed mt-1">
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
        )}
      </div>
    </Card>
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