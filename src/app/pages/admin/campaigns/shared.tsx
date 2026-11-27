import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, Loader2, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { cn } from "../../../lib/utils";
import { errMsg } from "../../../lib/campaigns/api";

// ───────────────────────────── Estados de tela ─────────────────────────────

export function LoadingBox({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground" role="status">
      <Loader2 size={28} className="animate-spin" />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="rounded-3xl border-dashed">
      <CardContent className="p-10 text-center">
        <AlertTriangle size={32} className="mx-auto mb-3 text-destructive opacity-70" />
        <p className="font-medium text-foreground">Não foi possível carregar</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-4 gap-2 rounded-xl" onClick={onRetry}>
            <RefreshCw size={14} /> Tentar de novo
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function EmptyBox({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <Card className="rounded-3xl border-dashed">
      <CardContent className="p-10 text-center">
        <div className="mx-auto mb-3 flex justify-center text-muted-foreground opacity-40">{icon}</div>
        <p className="font-medium text-muted-foreground">{title}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1 opacity-70">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function RestrictedBox({ message }: { message?: string }) {
  return (
    <Card className="rounded-3xl border-dashed">
      <CardContent className="p-12 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <Lock size={24} className="text-destructive" />
        </div>
        <p className="text-lg font-bold text-foreground">Acesso restrito</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          {message ?? "Você não tem acesso ao módulo de Campanhas. Peça a quem gerencia os acessos do módulo para liberar."}
        </p>
      </CardContent>
    </Card>
  );
}

const NOTICE_TONES = {
  info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200",
  warn: "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200",
  danger: "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200",
  ok: "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200",
} as const;

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof NOTICE_TONES;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "info" || tone === "ok" ? Info : AlertTriangle;
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-4 text-sm", NOTICE_TONES[tone], className)}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[13px] leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-2xl border", className)}>
      <CardContent className="p-4 flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-2xl font-bold text-foreground tabular-nums">{value}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────── Hooks ──────────────────────────────────

/** Carrega dados e expõe loading/erro/recarregar. Respostas atrasadas de chamadas antigas são ignoradas. */
export function useLoader<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await fn();
      if (id === seq.current) setData(d);
    } catch (e) {
      if (id === seq.current) setError(errMsg(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

/**
 * Executa uma ação com trava anti-duplo-clique. `busy` guarda a chave da ação em andamento
 * (para desabilitar botões e mostrar spinner). Erros viram toast com a mensagem do servidor.
 */
export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<string | null>(null);

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string): Promise<{ ok: true; value: T } | { ok: false }> => {
      if (ref.current) return { ok: false };
      ref.current = key;
      setBusy(key);
      try {
        const value = await fn();
        if (success) toast.success(success);
        return { ok: true, value };
      } catch (e) {
        toast.error(errMsg(e));
        return { ok: false };
      } finally {
        ref.current = null;
        setBusy(null);
      }
    },
    [],
  );

  return { busy, run };
}

// ─────────────────────────── Diálogo com justificativa ───────────────────────────

/**
 * Diálogo genérico "confirmar com motivo". Quando `minLength` > 0 o botão só habilita com
 * pelo menos esse número de caracteres não brancos (regra do servidor: justificativa ≥ 10).
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label = "Justificativa",
  placeholder,
  minLength = 0,
  maxLength = 1000,
  confirmLabel = "Confirmar",
  destructive = false,
  pending = false,
  children,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  minLength?: number;
  /** Limite de caracteres do texto (padrão 1000; a exclusão de receita usa 500, o mesmo teto do servidor). */
  maxLength?: number;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  children?: React.ReactNode;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText("");
  }, [open]);
  const len = text.trim().length;
  const ok = len >= minLength;
  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md" {...(description ? {} : { "aria-describedby": undefined })}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {label}
            {minLength > 0 ? "" : " (opcional)"}
          </Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            rows={4}
            maxLength={maxLength}
            className="rounded-xl min-h-24"
            disabled={pending}
          />
          {minLength > 0 && (
            <p className={cn("text-[11px]", ok ? "text-muted-foreground" : "text-destructive")}>
              {len}/{minLength} caracteres mínimos{ok ? "" : " — escreva um pouco mais para continuar"}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending} className="rounded-xl">
            Cancelar
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            disabled={!ok || pending}
            onClick={() => onConfirm(text.trim())}
            className="rounded-xl gap-2"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Helpers de dados ─────────────────────────────

/** Estado de uma etapa calculado no navegador a partir das datas (espelha o banco só para decidir quais botões mostrar). */
export function stageState(s: { starts_at: string | null; ends_at: string | null; paused: boolean } | undefined): "unset" | "upcoming" | "open" | "paused" | "closed" {
  if (!s || !s.starts_at) return "unset";
  const now = Date.now();
  if (new Date(s.starts_at).getTime() > now) return "upcoming";
  if (s.ends_at && new Date(s.ends_at).getTime() <= now) return "closed";
  return s.paused ? "paused" : "open";
}

export function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || ""
  );
}

/**
 * Itens do checklist de publicação que valem mostrar. Os itens "datas da votação" e "ordem das datas" (participação →
 * votação) só aparecem quando estão pendentes — e as datas da votação só quando as da participação já estão certas
 * (senão é a mesma causa e o aviso ficaria em dobro). Os demais itens (inclusive novos do servidor) aparecem sempre.
 */
export function visibleCheckItems<T extends { key: string; ok: boolean }>(items: T[]): T[] {
  const regOk = items.find((i) => i.key === "registration_dates")?.ok ?? true;
  return items.filter((i) => {
    if (i.key === "voting_order") return !i.ok;
    if (i.key === "voting_dates") return !i.ok && regOk;
    return true;
  });
}
