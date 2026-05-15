import { useState } from "react";
import { Star, Loader2, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Order } from "../../types";

interface RatingSheetProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onSubmit: (orderId: string, stars: number, comment: string) => Promise<void>;
}

export function RatingSheet({ isOpen, onClose, order, onSubmit }: RatingSheetProps) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!order || stars === 0) return;
    setLoading(true);
    try {
      await onSubmit(order.id, stars, comment);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-[32px] p-6 shadow-2xl border-t border-border"
          >
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />

            <div className="flex flex-col items-center text-center gap-4">
              <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-full mb-2">
                <MessageSquare size={32} className="text-orange-600" />
              </div>

              <h3 className="text-2xl font-bold text-foreground">Avalie seu último pedido</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                O que achou do almoço de ontem? Sua opinião ajuda a melhorar o cardápio.
              </p>

              <div className="flex items-center gap-2 my-4">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStars(s)}
                    className="focus:outline-none transition-transform hover:scale-110 active:scale-90"
                  >
                    <Star
                      size={36}
                      className={cn(
                        "transition-colors duration-200",
                        s <= stars ? "fill-orange-400 text-orange-400" : "text-muted stroke-[1.5px]"
                      )}
                    />
                  </button>
                ))}
              </div>

              {stars > 0 && stars <= 3 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="w-full"
                >
                  <textarea
                    placeholder="O que houve? Conta pra gente como podemos melhorar..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full p-4 rounded-xl border border-border bg-accent/30 text-sm focus:ring-2 focus:ring-primary/50 outline-none resize-none h-24"
                  />
                </motion.div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={loading || stars === 0}
                className="w-full h-14 text-lg font-bold rounded-2xl bg-foreground text-background mt-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : "Enviar Avaliação"}
              </Button>

              <button
                onClick={onClose}
                className="text-xs text-muted-foreground hover:text-foreground font-medium py-2"
              >
                Pular avaliação
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
