import { useMemo } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { PERIOD_PRESETS, REPORT_DATE_BASIS, resolvePeriod } from "../../../../lib/campaigns/export";
import type { PeriodChoice, ResolvedPeriod } from "../../../../lib/campaigns/export";

/**
 * "Baixar planilha" com período. Dias de Brasília; "Todo o período" não filtra. O período vale só para este
 * download (o dashboard não depende dele). A escolha fica guardada em quem abre o diálogo, para repetir sem refazer.
 */
export function ExportDialog({
  open, onOpenChange, kind, title, hint, choice, onChoiceChange, busy, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: string;
  title: string;
  hint: string;
  choice: PeriodChoice;
  onChoiceChange: (c: PeriodChoice) => void;
  busy: boolean;
  onConfirm: (p: Extract<ResolvedPeriod, { ok: true }>) => void;
}) {
  const resolved = useMemo(() => resolvePeriod(choice), [choice]);
  const basis = REPORT_DATE_BASIS[kind];
  const custom = choice.preset === "custom";
  // Erro de data só aparece depois que a pessoa começou a preencher o personalizado.
  const showError = !resolved.ok && custom && (choice.from !== "" || choice.to !== "" || resolved.error.startsWith("A data"));

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Baixar: {title}</DialogTitle>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Período</legend>
          <div className="grid grid-cols-2 gap-2">
            {PERIOD_PRESETS.map((p) => (
              <label
                key={p.value}
                className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-3 py-2 text-center text-sm font-medium transition-colors hover:bg-accent/50 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <input
                  type="radio"
                  name="export-period"
                  value={p.value}
                  checked={choice.preset === p.value}
                  onChange={() => onChoiceChange({ ...choice, preset: p.value })}
                  className="sr-only"
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>

        {custom && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="export-from">De</Label>
              <Input
                id="export-from"
                type="date"
                value={choice.from}
                onChange={(e) => onChoiceChange({ ...choice, from: e.target.value })}
                aria-invalid={showError || undefined}
                aria-describedby={showError ? "export-error" : undefined}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="export-to">Até</Label>
              <Input
                id="export-to"
                type="date"
                value={choice.to}
                min={choice.from || undefined}
                onChange={(e) => onChoiceChange({ ...choice, to: e.target.value })}
                aria-invalid={showError || undefined}
                aria-describedby={showError ? "export-error" : undefined}
                className="h-11"
              />
            </div>
          </div>
        )}

        {showError && !resolved.ok && (
          <p id="export-error" role="alert" className="text-sm font-medium text-destructive">{resolved.error}</p>
        )}
        {!resolved.ok && custom && !showError && <p className="text-[13px] text-muted-foreground">{resolved.error}</p>}
        {resolved.ok && <p className="text-[13px] text-foreground">Período: <b>{resolved.label}</b></p>}
        {basis && <p className="text-[12px] text-muted-foreground">O período filtra pela <b>{basis}</b>. Horário de Brasília.</p>}

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button
            className="gap-2 rounded-xl"
            disabled={busy || !resolved.ok}
            onClick={() => resolved.ok && onConfirm(resolved)}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Baixar planilha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
