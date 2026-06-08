import { motion } from "motion/react";
import { ClipboardList, Eye, Star, MapPin } from "lucide-react";

interface UnitNoOrdersBannerProps {
  unitName: string;
}

export function UnitNoOrdersBanner({ unitName }: UnitNoOrdersBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="relative overflow-hidden rounded-2xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 shadow-sm"
    >
      {/* Decorative bg */}
      <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-blue-200/30 dark:bg-blue-700/20 blur-2xl" />
      <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-indigo-200/30 dark:bg-indigo-700/20 blur-2xl" />

      <div className="relative p-4">
        {/* Header with icon */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/50 shrink-0 mt-0.5">
            <ClipboardList size={20} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={12} className="text-blue-500 shrink-0" />
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider truncate">
                {unitName}
              </span>
            </div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 leading-snug">
              As refeições são servidas diretamente pela cozinha local.
            </p>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/70 mt-1.5 leading-relaxed">
              Registre o que você comeu para acompanhar suas calorias e macros no perfil.
            </p>
          </div>
        </div>

        {/* Action hints */}
        <div className="flex items-center gap-4 mt-3.5 pl-[52px]">
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <ClipboardList size={13} />
            <span className="text-[11px] font-medium">Registrar refeição</span>
          </div>
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <Eye size={13} />
            <span className="text-[11px] font-medium">Ver cardápio</span>
          </div>
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <Star size={13} />
            <span className="text-[11px] font-medium">Avaliar refeição</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
