import { motion } from "motion/react";
import { CheckCircle, Clock, Edit2, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Order } from "../../types";

interface OrderBannerProps {
  order: Order;
  cutoffTime?: string;
  isCancelAllowed: boolean;
  cancelDeadlineLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  /** Real-time status if polling detected a change */
  liveStatus?: string;
}

export function OrderBanner({
  order,
  cutoffTime,
  isCancelAllowed,
  cancelDeadlineLabel,
  onEdit,
  onDelete,
  liveStatus,
}: OrderBannerProps) {
  const displayStatus = liveStatus || order.status;
  const statusColors: Record<string, string> = {
    "Confirmado": "bg-emerald-500 border-emerald-400/50",
    "Em Preparo": "bg-blue-500 border-blue-400/50",
    "Pronto": "bg-purple-500 border-purple-400/50",
    "Retirado": "bg-gray-500 border-gray-400/50",
  };
  const statusMessages: Record<string, string> = {
    "Confirmado": "Seu almoço de hoje está garantido.",
    "Em Preparo": "Seu pedido está sendo preparado na cozinha!",
    "Pronto": "Seu pedido está pronto para retirada!",
    "Retirado": "Pedido retirado. Bom apetite!",
  };
  const bgClass = statusColors[displayStatus] || "bg-emerald-500 border-emerald-400/50";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-3xl ${bgClass} text-white shadow-lg p-6 border-2`}
    >
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-full">
            <CheckCircle size={28} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg leading-tight">
              {displayStatus === "Pronto" ? "Pedido Pronto!" : displayStatus === "Em Preparo" ? "Em Preparo..." : "Pedido Realizado!"}
            </h3>
            <p className="text-white/80 text-sm">
              {statusMessages[displayStatus] || "Seu almoço de hoje está garantido."}
            </p>
          </div>
        </div>

        <div className="bg-white/10 rounded-xl p-3 text-sm border border-white/10">
          <p className="opacity-90 line-clamp-2">
            {order.items.map((i: any) => `${i.quantity}x ${i.name}`).join(", ")}
          </p>
        </div>

        {/* Edit/Delete deadline info */}
        {cutoffTime && (
          <div className="flex items-center gap-2 text-xs">
            <Clock size={12} className="text-white/70" />
            {isCancelAllowed ? (
              <span className="text-white/80">
                Editar/excluir até <span className="font-bold text-white">{cancelDeadlineLabel}</span>
              </span>
            ) : (
              <span className="text-white/70 italic">
                Prazo para editar/excluir encerrado
              </span>
            )}
          </div>
        )}

        {isCancelAllowed && (
          <div className="flex gap-2 relative z-20">
            <Button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="flex-1 bg-white text-emerald-600 hover:bg-emerald-50 font-bold border-none shadow-md text-xs h-9"
            >
              <Edit2 size={14} className="mr-1.5" />
              Editar
            </Button>
            <Button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="flex-1 bg-red-500/80 text-white hover:bg-red-500 font-bold border-none shadow-md text-xs h-9"
            >
              <Trash2 size={14} className="mr-1.5" />
              Excluir
            </Button>
          </div>
        )}
      </div>
      <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -left-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
    </motion.div>
  );
}