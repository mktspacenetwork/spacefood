import { ChevronDown } from "lucide-react";
import { Card } from "../../../../components/ui/Card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../../components/ui/collapsible";
import { cn } from "../../../../lib/utils";

/** Linha de propósito no topo de cada aba: "o que fazer aqui" (uma frase) + ação opcional à direita. */
export function TabIntro({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
      <p className="min-w-0 flex-1 basis-64 text-[13px] leading-relaxed text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

/**
 * Seção recolhível em cartão. Serve para esconder o que não é o foco da etapa sem tirar da tela:
 * o título continua visível e um toque abre. Pode ser controlada (`open` + `onOpenChange`) ou livre (`defaultOpen`).
 */
export function Fold({
  title, hint, icon, badge, open, defaultOpen, onOpenChange, anchorId, tutorial, className, children,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** id do elemento (para rolar até ele em links diretos) */
  anchorId?: string;
  /** valor do data-tutorial (alvo da tour) */
  tutorial?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const controlled = open !== undefined ? { open, onOpenChange } : { defaultOpen, onOpenChange };
  return (
    <Card id={anchorId} data-tutorial={tutorial} className={cn("scroll-mt-36 overflow-hidden rounded-3xl border hover:shadow-sm", className)}>
      <Collapsible {...controlled}>
        <CollapsibleTrigger
          className="group flex min-h-[56px] w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {icon && <span className="shrink-0 text-primary">{icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-foreground">{title}</span>
            {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
          </span>
          {badge}
          <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border p-5">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
