import { Loader2, XCircle, Smile } from "lucide-react";
import { cn } from "../../lib/utils";

interface AbstentionButtonProps {
  hasAbstained: boolean;
  absLoading: boolean;
  isCutoffPassed: boolean;
  onToggle: () => void;
  isToday?: boolean;
}

export function AbstentionButton({ hasAbstained, absLoading, isCutoffPassed, onToggle, isToday = true }: AbstentionButtonProps) {
  return (
    <button
      data-tutorial="abstention"
      onClick={onToggle}
      disabled={absLoading || isCutoffPassed}
      className={cn(
        "w-full group relative overflow-hidden px-4 py-3 rounded-3xl transition-all duration-300",
        hasAbstained
          ? "bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700"
          : "bg-gradient-to-r from-orange-500 to-orange-600 shadow-xl shadow-orange-500/20 hover:shadow-orange-500/30 hover:scale-[1.01]"
      )}
    >
      <div className="relative z-10 flex items-center justify-center gap-3">
        {absLoading ? (
          <Loader2 size={24} className="animate-spin text-white" />
        ) : hasAbstained ? (
          <>
            <XCircle size={24} className="text-slate-400" />
            <span className="font-bold text-slate-500">{isToday ? "Almoço dispensado hoje" : "Almoço dispensado"}</span>
          </>
        ) : (
          <>
            <div className="bg-white/20 p-1.5 rounded-full backdrop-blur-sm">
              <Smile size={20} className="text-white group-hover:rotate-12 transition-transform" />
            </div>
            <span className="font-bold text-lg text-white">{isToday ? "Não quero almoçar hoje" : "Não quero almoçar"}</span>
          </>
        )}
      </div>
      {!hasAbstained && (
        <div className="absolute top-0 left-0 w-full h-full bg-white/10 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
      )}
    </button>
  );
}