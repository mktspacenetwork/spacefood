import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, Megaphone, Save } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { PHASE_STATE, fmtDayTime, fmtRange } from "../../../../lib/campaigns/format";
import { Notice, stageState, useBusy } from "../shared";
import { PeriodFields, periodFromStages, periodPayload, samePeriod, validatePeriod } from "../PeriodFields";
import type { TabProps } from "./types";

/**
 * Período da campanha: início e encerramento das participações e, só com votação, a data de anúncio do resultado.
 * A votação usa a mesma janela da participação. Prorrogar é só escolher uma nova data de encerramento.
 */
export function PeriodSection({ campaignId, campaign, stages, results, perms, onChanged }: TabProps) {
  const hasVoting = !!campaign.features.voting;
  const reg = stages.find((s) => s.stage_key === "registration");
  const [rs, re] = [reg?.starts_at ?? null, reg?.ends_at ?? null];
  const savedAnnounce = hasVoting ? results?.announce_at ?? null : null;
  const announced = results?.status === "announced";
  const server = useMemo(() => periodFromStages({ starts_at: rs, ends_at: re }, savedAnnounce), [rs, re, savedAnnounce]);
  const [values, setValues] = useState(server);
  const { busy, run } = useBusy();

  // Se o servidor mudou as datas (outra pessoa, recarga), o formulário acompanha.
  useEffect(() => { setValues(server); }, [server]);

  const finished = campaign.status === "closed" || campaign.status === "archived";
  const canEdit = !!perms.campaigns_schedule && !finished;
  const dirty = !samePeriod(values, server, hasVoting);
  const problem = validatePeriod(values, hasVoting, server.announce);
  const payload = periodPayload(values, hasVoting);
  const valid = !problem && !!payload;
  const regPhase = PHASE_STATE[stageState(reg)];

  const save = async () => {
    if (!valid || !payload) return;
    const r = await run("period", () => campaignsApi.put(`/admin/campaigns/${campaignId}/period`, payload), "Período salvo.");
    if (r.ok) onChanged();
  };

  return (
    <div className="space-y-4" data-tutorial="camp-period-form">
      <div className="space-y-1.5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays size={16} className="text-primary" aria-hidden="true" />
          <span className="text-muted-foreground">Participações</span>
          <b>{fmtRange(reg?.starts_at, reg?.ends_at)}</b>
          <Badge className={cn("border text-[10px]", regPhase.className)}>{regPhase.label}</Badge>
        </div>
        {hasVoting && savedAnnounce && !announced && (
          <div className="flex flex-wrap items-center gap-2 pl-6">
            <Megaphone size={14} className="text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Anúncio do resultado</span>
            <b>{fmtDayTime(savedAnnounce)}</b>
          </div>
        )}
      </div>

      <PeriodFields
        values={values} onChange={setValues} hasVoting={hasVoting}
        disabled={!canEdit || !!busy || announced}
        datesDisabled={results?.status === "confirmed"}
      />

      <p className="text-[11px] text-muted-foreground">
        Horário de Brasília: abre às 00:00 do início e fecha no fim do dia do encerramento.
        {hasVoting ? " A votação acontece nesse mesmo período." : ""}
      </p>

      {problem && dirty && <p className="text-[11px] text-destructive">{problem}</p>}
      {announced && <Notice tone="info">O resultado já foi divulgado: a data de anúncio não muda mais.</Notice>}
      {!canEdit && <Notice tone="info">{finished ? "A campanha foi encerrada: o período não pode mais ser alterado." : "Você não tem permissão para alterar o período."}</Notice>}

      {canEdit && (
        <Button className="gap-2 rounded-xl" onClick={save} disabled={!dirty || !valid || !!busy}>
          {busy === "period" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar período
        </Button>
      )}
    </div>
  );
}
