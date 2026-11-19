import { Badge } from "../../../../components/ui/Badge";
import { cn } from "../../../../lib/utils";

/**
 * Selo "Fora do prazo": receita enviada depois do encerramento da participação (só campanhas com votação, até a
 * divulgação do resultado). Ela é analisada e aparece normalmente, mas não concorre à votação, ao ranking nem ao resultado.
 */
export function LateBadge({ className }: { className?: string }) {
  return (
    <Badge
      title="Enviada depois do encerramento da participação: não concorre à votação"
      className={cn(
        "border border-orange-300 bg-orange-100 text-[10px] text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
        className,
      )}
    >
      Fora do prazo
    </Badge>
  );
}
