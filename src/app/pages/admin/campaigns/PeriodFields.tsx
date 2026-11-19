import { AlertTriangle, X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { cn } from "../../../lib/utils";
import { scheduleMins } from "../../../lib/campaigns/schedule";
import type { ScheduleBlock, ScheduleCheck, ScheduleValues } from "../../../lib/campaigns/schedule";

/**
 * Cronograma da campanha, igual no formulário (criar/editar) e em Configurações → Período.
 * Com votação são três blocos numerados, em sequência estrita: 1 Participação → 2 Votação → 3 Divulgação do resultado.
 * Sem votação, só os dois campos da participação. A lógica (validação, mensagens, envio) vive em `lib/campaigns/schedule.ts`.
 * Datas em Brasília: o início vale a partir das 00:00 e o encerramento até o fim do dia.
 * A data de divulgação é só uma referência: o resultado é divulgado sozinho nessa data SE o ganhador já estiver
 * confirmado antes dela; se não, a divulgação continua sendo uma ação da gestão.
 */
const LABEL = "text-xs font-bold uppercase tracking-wider text-muted-foreground";

function Block({
  n, title, tutorial, check, block, children,
}: {
  n?: number; title?: string; tutorial?: string; check: ScheduleCheck; block: ScheduleBlock; children: React.ReactNode;
}) {
  const issue = check.issue?.block === block ? check.issue : null;
  const warnings = block === "participation" ? [] : check.warnings.filter((w) => w.block === block);
  const body = (
    <>
      {children}
      {issue && (
        <p role="alert" className={cn("text-[11px]", issue.kind === "invalid" ? "font-medium text-destructive" : "text-muted-foreground")}>
          {issue.message}
        </p>
      )}
      {!issue && warnings.map((w) => (
        <p key={w.message} className="flex items-start gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangle size={12} className="mt-px shrink-0" aria-hidden="true" />
          <span>{w.message}</span>
        </p>
      ))}
    </>
  );
  if (!n) return <div className="space-y-2" data-tutorial={tutorial}>{body}</div>;
  return (
    <section className="space-y-3 rounded-2xl border p-3.5" data-tutorial={tutorial} aria-label={title}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden="true">{n}</span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      {body}
    </section>
  );
}

export function PeriodFields({
  values, onChange, hasVoting, check, disabled, datesDisabled, legacyWindow,
}: {
  values: ScheduleValues; onChange: (next: ScheduleValues) => void; hasVoting: boolean;
  /** Resultado de `validateSchedule` (o pai também usa, para habilitar o botão de salvar). */
  check: ScheduleCheck;
  disabled?: boolean;
  /** Trava as datas de participação e votação (ganhador já confirmado), deixando a divulgação editável. */
  datesDisabled?: boolean;
  /** A campanha foi gravada no modelo antigo (votação com as mesmas datas da participação). */
  legacyWindow?: boolean;
}) {
  const set = (patch: Partial<ScheduleValues>) => onChange({ ...values, ...patch });
  const mins = scheduleMins(values, hasVoting);
  const own = hasVoting && values.ownVoting;
  const lock = !!disabled || !!datesDisabled;
  const votingEnd = own ? values.vend : values.end;

  const participation = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className={LABEL}>Início das participações</Label>
        <Input
          type="date" value={values.start} onChange={(e) => set({ start: e.target.value })}
          className="h-11 rounded-xl" disabled={lock} aria-label="Início das participações"
        />
      </div>
      <div className="space-y-1.5">
        <Label className={LABEL}>Encerramento das participações</Label>
        <Input
          type="date" value={values.end} min={mins.end} onChange={(e) => set({ end: e.target.value })}
          className="h-11 rounded-xl" disabled={lock} aria-label="Encerramento das participações"
        />
      </div>
    </div>
  );

  if (!hasVoting) {
    return <Block check={check} block="participation" tutorial="camp-period-participation">{participation}</Block>;
  }

  return (
    <div className="space-y-3">
      <Block n={1} title="Participação" block="participation" check={check} tutorial="camp-period-participation">
        {participation}
      </Block>

      <Block n={2} title="Votação" block="voting" check={check} tutorial="camp-period-voting">
        {own ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className={LABEL}>Início da votação</Label>
                <Input
                  type="date" value={values.vstart} min={mins.vstart} onChange={(e) => set({ vstart: e.target.value })}
                  className="h-11 rounded-xl" disabled={lock || !values.end} aria-label="Início da votação"
                />
              </div>
              <div className="space-y-1.5">
                <Label className={LABEL}>Encerramento da votação</Label>
                <Input
                  type="date" value={values.vend} min={mins.vend} onChange={(e) => set({ vend: e.target.value })}
                  className="h-11 rounded-xl" disabled={lock || !values.vstart} aria-label="Encerramento da votação"
                />
              </div>
            </div>
            {!values.end && <p className="text-[11px] text-muted-foreground">Defina primeiro o encerramento da participação.</p>}
            {legacyWindow && !lock && (
              <Button type="button" variant="ghost" size="sm" className="h-8 rounded-xl px-2 text-[11px] text-muted-foreground" onClick={() => set({ ownVoting: false, vstart: "", vend: "" })}>
                Voltar a usar o mesmo período da participação
              </Button>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Esta campanha usa o modelo antigo: a votação acontece junto com a participação, nas mesmas datas.
              Se quiser, defina datas próprias para a votação.
            </p>
            <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={lock} onClick={() => set({ ownVoting: true, vstart: "", vend: "" })}>
              Definir datas da votação
            </Button>
          </div>
        )}
      </Block>

      <Block n={3} title="Divulgação do resultado" block="announce" check={check} tutorial="camp-period-announce">
        <div className="space-y-1.5">
          <Label className={LABEL}>Data e hora da divulgação</Label>
          <div className="flex items-center gap-2">
            <Input
              type="datetime-local" value={values.announce} min={mins.announce} onChange={(e) => set({ announce: e.target.value })}
              className="h-11 min-w-0 flex-1 rounded-xl" disabled={!!disabled || !votingEnd} aria-label="Data e hora da divulgação do resultado"
            />
            {values.announce && !disabled && (
              <button
                type="button" onClick={() => set({ announce: "" })} aria-label="Limpar a data de divulgação"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {votingEnd
              ? "Opcional. A divulgação é automática nessa data só se o ganhador já estiver confirmado; senão, você divulga quando quiser."
              : `Defina primeiro ${own ? "a votação" : "a participação"}.`}
          </p>
        </div>
      </Block>
    </div>
  );
}
