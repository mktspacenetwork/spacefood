import { useMemo, useState } from "react";
import { CalendarClock, Check, Loader2, Search, Trophy, X } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../../../components/ui/dialog";
import { cn } from "../../../../lib/utils";
import { fmtDayTime, fromInputValue, plural, toInputValue } from "../../../../lib/campaigns/format";
import type { DrawEligible, DrawWinner } from "../../../../lib/campaigns/types";

/** Linha de pré-requisito do sorteio: ✓ cumprido / ✕ pendente. */
export function Requirement({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px]">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          ok ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
        )}
        aria-hidden="true"
      >
        {ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
      </span>
      <span className={cn("min-w-0", ok ? "text-muted-foreground" : "font-medium text-foreground")}>
        {children}
        <span className="sr-only">{ok ? " (cumprido)" : " (pendente)"}</span>
      </span>
    </li>
  );
}

/** Pessoas elegíveis, em lista compacta (nunca tabela larga); com busca quando a lista é longa. */
export function EligibleList({ eligible }: { eligible: DrawEligible[] }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const rows = useMemo(
    () => (term ? eligible.filter((p) => `${p.name} ${p.department} ${p.unit}`.toLowerCase().includes(term)) : eligible),
    [eligible, term],
  );
  if (eligible.length === 0) {
    return <p className="text-sm text-muted-foreground">Ninguém tem receita aprovada ainda.</p>;
  }
  return (
    <div className="space-y-3">
      {eligible.length > 8 && (
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar pelo nome ou departamento"
            className="h-10 rounded-xl pl-9"
            aria-label="Buscar entre os elegíveis"
          />
        </div>
      )}
      <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-2xl border border-border">
        {rows.map((p) => (
          <li key={p.user_id} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{[p.department, p.unit].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            <span
              className="shrink-0 pt-0.5 text-[11px] font-medium text-muted-foreground"
              title={p.recipes.map((r) => r.dish_name).join(", ")}
            >
              {plural(p.recipes.length, "receita", "receitas")}
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3.5 py-4 text-center text-sm text-muted-foreground">Ninguém encontrado.</li>}
      </ul>
    </div>
  );
}

/** Ganhadores: posição, nome e receita sorteada. */
export function WinnersList({ winners }: { winners: DrawWinner[] }) {
  const sorted = [...winners].sort((a, b) => a.position - b.position);
  return (
    <ol className="space-y-2">
      {sorted.map((w) => (
        <li
          key={`${w.position}-${w.submission_id}`}
          className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-white/70 px-3.5 py-3 dark:border-amber-800 dark:bg-amber-950/10"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-extrabold text-white shadow-sm"
            aria-label={`${w.position}º sorteado`}
          >
            {w.position}
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-bold leading-snug text-foreground">{w.name}</p>
            <p className="line-clamp-2 break-words text-[12px] text-muted-foreground">{w.dish_name}</p>
            {(w.department || w.unit) && (
              <p className="truncate text-[11px] text-muted-foreground">{[w.department, w.unit].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <Trophy size={16} className="shrink-0 text-amber-500" aria-hidden="true" />
        </li>
      ))}
    </ol>
  );
}

/** Diálogo "Programar / Alterar horário" (data + hora de Brasília; só no futuro). */
export function ScheduleDialog({
  open, onOpenChange, current, pending, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ISO do horário já programado (ao alterar) */
  current: string | null;
  pending: boolean;
  onSave: (iso: string) => void | Promise<void>;
}) {
  // Sugestão: o horário atual ou a próxima hora cheia. O valor é recalculado a cada abertura.
  const [value, setValue] = useState("");
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    const nextHour = new Date(Math.ceil((Date.now() + 120_000) / 3_600_000) * 3_600_000).toISOString();
    setValue(toInputValue(current ?? nextHour));
    setSeenOpen(true);
  } else if (!open && seenOpen) {
    setSeenOpen(false);
  }
  const iso = fromInputValue(value);
  const ok = !!iso && new Date(iso).getTime() > Date.now() + 60_000;
  const changing = !!current;
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={18} className="text-primary" /> {changing ? "Alterar horário" : "Programar divulgação"}
          </DialogTitle>
          <DialogDescription>
            No horário escolhido os ganhadores aparecem para os colaboradores e quem participou recebe um aviso. Você pode alterar ou cancelar até lá.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Data e hora (Brasília)</Label>
          <Input
            type="datetime-local"
            value={value}
            min={toInputValue(new Date(Date.now() + 120_000).toISOString())}
            onChange={(e) => setValue(e.target.value)}
            className="h-11 rounded-xl"
            aria-label="Data e hora da divulgação"
            disabled={pending}
          />
          {value && !ok && <p className="text-[11px] text-destructive">Escolha um horário no futuro.</p>}
          {ok && iso && <p className="text-[11px] text-muted-foreground">Divulga em {fmtDayTime(iso)}.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={pending}>Voltar</Button>
          <Button className="gap-2 rounded-xl" onClick={() => iso && ok && onSave(iso)} disabled={!ok || pending}>
            {pending && <Loader2 size={14} className="animate-spin" />}
            {changing ? "Salvar horário" : "Programar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
