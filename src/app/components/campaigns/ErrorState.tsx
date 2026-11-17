import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";

/** Erro ao carregar: sempre com explicação e, quando faz sentido, "Tentar de novo". */
export function ErrorState({
  title = "Não foi possível carregar",
  message,
  onRetry,
  children,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <Card role="alert" className="rounded-3xl p-8 text-center hover:shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400">
        <AlertTriangle size={22} />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {message && <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{message}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="h-11 gap-2 rounded-xl px-4">
            <RefreshCw size={14} />
            Tentar de novo
          </Button>
        )}
        {children}
      </div>
    </Card>
  );
}
