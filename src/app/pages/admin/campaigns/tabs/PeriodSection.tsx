import { useEffect, useState } from "react";
import { CalendarDays, Loader2, Save } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { PHASE_STATE, fmtPeriod, fromInputValue, toInputValue } from "../../../../lib/campaigns/format";
import { Notice, stageState, useBusy } from "../shared";
import type { TabProps } from "./types";

const dateOf = (iso: string | null | undefined) => (iso ? toInputValue(iso).slice(0, 10) : "");

/**
 * Período da campanha: só Início e Encerramento. Vale para a participação e, se houver, para a votação
 * (o servidor aplica as duas datas juntas). Prorrogar é só mudar a data de encerramento.
 */
export function PeriodSection({ campaignId, campaign, stages, perms, onChanged }: TabProps) {
  const reg = stages.find((s) => s.stage_key === "registration");
  const [start, setStart] = useState(dateOf(reg?.starts_at));
  const [end, setEnd] = useState(dateOf(reg?.ends_at));
  const { busy, run } = useBusy();

  // Se o servidor mudou as datas (outra pessoa, recarga), o formulário acompanha.
  useEffect(() => {
    setStart(dateOf(reg?.starts_at));
    setEnd(dateOf(reg?.ends_at));
  }, [reg?.starts_at, reg?.ends_at]);

  const finished = campaign.status === "closed" || campaign.status === "archived";
  const canEdit = !!perms.campaigns_schedule && !finished;
  const s = start ? fromInputValue(`${start}T00:00`) : null;
  const e = end ? fromInputValue(`${end}T23:59:59`) : null;
  const dirty = start !== dateOf(reg?.starts_at) || end !== dateOf(reg?.ends_at);
  const both = !!s && !!e;
  const orderOk = both && new Date(e as string) > new Date(s as string);
  const valid = both && orderOk;
  const phase = PHASE_STATE[stageState(reg)];

  const save = async () => {
    if (!valid) return;
    const r = await run("period", () => campaignsApi.put(`/admin/campaigns/${campaignId}/period`, { starts_at: s, ends_at: e }), "Período salvo.");
    if (r.ok) onChanged();
  };

  return (
    <div className="space-y-4" data-tutorial="camp-period-form">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <CalendarDays size={16} className="text-primary" aria-hidden="true" />
        <b>{fmtPeriod(reg?.starts_at, reg?.ends_at)}</b>
        <Badge className={cn("border text-[10px]", phase.className)}>{phase.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Início</Label>
          <Input type="date" value={start} onChange={(ev) => setStart(ev.target.value)} className="h-11 rounded-xl" disabled={!canEdit || !!busy} aria-label="Data de início" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Encerramento</Label>
          <Input type="date" value={end} min={start || undefined} onChange={(ev) => setEnd(ev.target.value)} className="h-11 rounded-xl" disabled={!canEdit || !!busy} aria-label="Data de encerramento" />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {campaign.features.voting ? "Vale para a participação e para a votação." : "Vale para a participação."} Horário de Brasília: abre às 00:00 do início e fecha no fim do dia do encerramento.
        Para prorrogar, é só escolher uma nova data de encerramento.
      </p>

      {both && !orderOk && <p className="text-[11px] text-destructive">O encerramento precisa ser depois do início.</p>}
      {!canEdit && <Notice tone="info">{finished ? "A campanha foi encerrada: o período não pode mais ser alterado." : "Você não tem permissão para alterar o período."}</Notice>}

      {canEdit && (
        <Button className="gap-2 rounded-xl" onClick={save} disabled={!dirty || !valid || !!busy}>
          {busy === "period" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar período
        </Button>
      )}
    </div>
  );
}
