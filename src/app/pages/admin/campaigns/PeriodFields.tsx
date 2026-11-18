import { X } from "lucide-react";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { fromInputValue, toInputValue } from "../../../lib/campaigns/format";
import type { PeriodPayload } from "../../../lib/campaigns/types";

/**
 * Período da campanha, igual no formulário (criar/editar) e em Configurações → Período. Três informações:
 *  1. Início das participações · 2. Encerramento das participações · 3. Data de anúncio do resultado (só com votação).
 * A votação, quando existe, usa a MESMA janela da participação — não há período de votação separado.
 * A data de anúncio é só uma referência: o resultado é divulgado sozinho nessa data SE o ganhador já estiver
 * confirmado antes dela; se não, a divulgação continua sendo uma ação da gestão.
 * Datas em Brasília: o início vale a partir das 00:00 e o encerramento até o fim do dia.
 */
export type PeriodValues = {
  start: string; // yyyy-MM-dd
  end: string; // yyyy-MM-dd
  announce: string; // yyyy-MM-ddTHH:mm (Brasília); "" = sem data de anúncio
};

export const EMPTY_PERIOD: PeriodValues = { start: "", end: "", announce: "" };

export const dateOf = (iso: string | null | undefined) => (iso ? toInputValue(iso).slice(0, 10) : "");
export const startIso = (d: string) => fromInputValue(d ? `${d}T00:00` : "");
export const endIso = (d: string) => fromInputValue(d ? `${d}T23:59:59` : "");

/** Valores do formulário a partir das etapas do servidor e da data de anúncio já gravada. */
export function periodFromStages(
  reg: { starts_at: string | null; ends_at: string | null } | undefined,
  announceAt?: string | null,
): PeriodValues {
  return { start: dateOf(reg?.starts_at), end: dateOf(reg?.ends_at), announce: announceAt ? toInputValue(announceAt) : "" };
}

/**
 * Mesma regra do servidor, para avisar antes de enviar. Devolve a mensagem ou null.
 * `savedAnnounce`: valor já gravado — reenviar o mesmo não conta como mudança (o servidor só recusa data passada
 * quando o valor MUDA).
 */
export function validatePeriod(v: PeriodValues, hasVoting: boolean, savedAnnounce = ""): string | null {
  if (!!v.start !== !!v.end) return "Informe o início e o encerramento das participações (ou deixe os dois em branco por enquanto).";
  if (!v.start) return hasVoting && v.announce ? "Defina primeiro o início e o encerramento das participações." : null;
  if (!startIso(v.start) || !endIso(v.end) || new Date(endIso(v.end) as string) <= new Date(startIso(v.start) as string)) {
    return "O encerramento das participações precisa ser depois do início.";
  }
  if (!hasVoting || !v.announce) return null;
  const at = fromInputValue(v.announce);
  if (!at) return "Escolha uma data e hora válidas para o anúncio.";
  if (new Date(at).getTime() <= new Date(endIso(v.end) as string).getTime()) return "O anúncio do resultado precisa ser depois do encerramento das participações.";
  if (v.announce !== savedAnnounce && new Date(at).getTime() < Date.now() + 60_000) return "A data de anúncio precisa ser no futuro.";
  return null;
}

/** Corpo do `PUT /period`; null quando ainda não há datas completas. Sem votação, não envia data de anúncio. */
export function periodPayload(v: PeriodValues, hasVoting: boolean): PeriodPayload | null {
  const s = startIso(v.start);
  const e = endIso(v.end);
  if (!s || !e) return null;
  if (!hasVoting) return { starts_at: s, ends_at: e };
  return { starts_at: s, ends_at: e, announce_at: v.announce ? fromInputValue(v.announce) : null };
}

export const samePeriod = (a: PeriodValues, b: PeriodValues, hasVoting: boolean) =>
  a.start === b.start && a.end === b.end && (!hasVoting || a.announce === b.announce);

export function PeriodFields({
  values, onChange, hasVoting, disabled, datesDisabled,
}: {
  values: PeriodValues; onChange: (next: PeriodValues) => void; hasVoting: boolean; disabled?: boolean;
  /** Trava só início/encerramento (ganhador já confirmado), deixando a data de anúncio editável. */
  datesDisabled?: boolean;
}) {
  const set = (patch: Partial<PeriodValues>) => onChange({ ...values, ...patch });
  const announceMin = values.end ? `${values.end}T23:59` : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Início das participações</Label>
          <Input
            type="date" value={values.start} onChange={(e) => set({ start: e.target.value })}
            className="h-11 rounded-xl" disabled={disabled || datesDisabled} aria-label="Início das participações"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Encerramento das participações</Label>
          <Input
            type="date" value={values.end} min={values.start || undefined} onChange={(e) => set({ end: e.target.value })}
            className="h-11 rounded-xl" disabled={disabled || datesDisabled} aria-label="Encerramento das participações"
          />
        </div>
      </div>

      {hasVoting && (
        <div className="space-y-1.5" data-tutorial="camp-period-announce">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Data de anúncio do resultado</Label>
          <div className="flex items-center gap-2">
            <Input
              type="datetime-local" value={values.announce} min={announceMin} onChange={(e) => set({ announce: e.target.value })}
              className="h-11 min-w-0 flex-1 rounded-xl" disabled={disabled} aria-label="Data de anúncio do resultado"
            />
            {values.announce && !disabled && (
              <button
                type="button" onClick={() => set({ announce: "" })} aria-label="Limpar a data de anúncio"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Opcional. A divulgação é automática nessa data só se o ganhador já estiver confirmado; senão, você divulga quando quiser.
          </p>
        </div>
      )}
    </div>
  );
}
