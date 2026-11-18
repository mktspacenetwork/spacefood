import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { fromInputValue, toInputValue } from "../../../lib/campaigns/format";
import type { PeriodPayload } from "../../../lib/campaigns/types";

/**
 * Campos de período da campanha, iguais no formulário (criar/editar) e em Configurações → Período.
 *  - Sem votação: um período só ("Participação").
 *  - Com votação: DOIS períodos separados — participação (envio de receitas) e votação. A votação nasce com as
 *    mesmas datas da participação e acompanha as mudanças enquanto a pessoa não a alterar de propósito.
 * Datas em Brasília: o início vale a partir das 00:00 e o encerramento até o fim do dia.
 */
export type PeriodValues = { start: string; end: string; vStart: string; vEnd: string };

export const EMPTY_PERIOD: PeriodValues = { start: "", end: "", vStart: "", vEnd: "" };

export const dateOf = (iso: string | null | undefined) => (iso ? toInputValue(iso).slice(0, 10) : "");
export const startIso = (d: string) => fromInputValue(d ? `${d}T00:00` : "");
export const endIso = (d: string) => fromInputValue(d ? `${d}T23:59:59` : "");

/** Valores do formulário a partir das etapas do servidor (votação sem data própria = mesma janela da participação). */
export function periodFromStages(
  reg: { starts_at: string | null; ends_at: string | null } | undefined,
  vot: { starts_at: string | null; ends_at: string | null } | undefined,
): PeriodValues {
  const start = dateOf(reg?.starts_at);
  const end = dateOf(reg?.ends_at);
  return { start, end, vStart: dateOf(vot?.starts_at) || start, vEnd: dateOf(vot?.ends_at) || end };
}

/** Mesma regra do servidor, para avisar antes de enviar. Devolve a mensagem ou null. */
export function validatePeriod(v: PeriodValues, hasVoting: boolean): string | null {
  if (!!v.start !== !!v.end) return "Informe o início e o encerramento da participação (ou deixe os dois em branco por enquanto).";
  if (!v.start) return null;
  if (!startIso(v.start) || !endIso(v.end) || new Date(endIso(v.end) as string) <= new Date(startIso(v.start) as string)) {
    return "O encerramento da participação precisa ser depois do início.";
  }
  if (!hasVoting) return null;
  if (!v.vStart || !v.vEnd) return "Informe o início e o encerramento da votação.";
  if (new Date(endIso(v.vEnd) as string) <= new Date(startIso(v.vStart) as string)) return "O encerramento da votação precisa ser depois do início dela.";
  if (v.vStart < v.start) return "A votação não pode começar antes da participação.";
  if (v.vEnd < v.end) return "A votação precisa terminar no mesmo dia da participação ou depois.";
  return null;
}

/** Corpo do `PUT /period`; null quando ainda não há datas completas. */
export function periodPayload(v: PeriodValues, hasVoting: boolean): PeriodPayload | null {
  const s = startIso(v.start);
  const e = endIso(v.end);
  if (!s || !e) return null;
  if (!hasVoting) return { starts_at: s, ends_at: e };
  const vs = startIso(v.vStart);
  const ve = endIso(v.vEnd);
  if (!vs || !ve) return null;
  return { starts_at: s, ends_at: e, voting_starts_at: vs, voting_ends_at: ve };
}

export const samePeriod = (a: PeriodValues, b: PeriodValues, hasVoting: boolean) =>
  a.start === b.start && a.end === b.end && (!hasVoting || (a.vStart === b.vStart && a.vEnd === b.vEnd));

function DateRow({
  title, hint, start, end, startMin, endMin, onStart, onEnd, disabled, labels,
}: {
  title?: string;
  hint?: string;
  start: string;
  end: string;
  startMin?: string;
  endMin?: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  disabled?: boolean;
  labels: [string, string];
}) {
  return (
    <div className="space-y-2">
      {title && (
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Início</Label>
          <Input type="date" value={start} min={startMin || undefined} onChange={(e) => onStart(e.target.value)} className="h-11 rounded-xl" disabled={disabled} aria-label={labels[0]} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Encerramento</Label>
          <Input type="date" value={end} min={endMin || undefined} onChange={(e) => onEnd(e.target.value)} className="h-11 rounded-xl" disabled={disabled} aria-label={labels[1]} />
        </div>
      </div>
    </div>
  );
}

export function PeriodFields({
  values, onChange, hasVoting, disabled,
}: { values: PeriodValues; onChange: (next: PeriodValues) => void; hasVoting: boolean; disabled?: boolean }) {
  const set = (patch: Partial<PeriodValues>) => {
    const next = { ...values, ...patch };
    if (hasVoting) {
      // A votação acompanha a participação enquanto estiver igual (ou vazia).
      if (patch.start !== undefined && (!values.vStart || values.vStart === values.start)) next.vStart = patch.start;
      if (patch.end !== undefined && (!values.vEnd || values.vEnd === values.end)) next.vEnd = patch.end;
    }
    onChange(next);
  };

  if (!hasVoting) {
    return (
      <DateRow
        start={values.start} end={values.end} endMin={values.start}
        onStart={(v) => set({ start: v })} onEnd={(v) => set({ end: v })}
        disabled={disabled} labels={["Data de início", "Data de encerramento"]}
      />
    );
  }
  return (
    <div className="space-y-4">
      <DateRow
        title="Período de participação" hint="Quando dá para enviar receitas."
        start={values.start} end={values.end} endMin={values.start}
        onStart={(v) => set({ start: v })} onEnd={(v) => set({ end: v })}
        disabled={disabled} labels={["Início da participação", "Encerramento da participação"]}
      />
      <DateRow
        title="Período de votação" hint="Quando dá para votar. Começa igual à participação — mude se quiser votar depois."
        start={values.vStart} end={values.vEnd} startMin={values.start}
        endMin={[values.vStart, values.end].filter(Boolean).sort().pop()}
        onStart={(v) => set({ vStart: v })} onEnd={(v) => set({ vEnd: v })}
        disabled={disabled} labels={["Início da votação", "Encerramento da votação"]}
      />
    </div>
  );
}
