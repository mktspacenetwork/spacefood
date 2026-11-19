import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, Megaphone, Save, Vote } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { PHASE_STATE, fmtDayTime, fmtRange } from "../../../../lib/campaigns/format";
import { periodPayload, sameSchedule, scheduleFromServer, validateSchedule } from "../../../../lib/campaigns/schedule";
import { Notice, stageState, useBusy } from "../shared";
import { PeriodFields } from "../PeriodFields";
import type { TabProps } from "./types";

/**
 * Cronograma da campanha. Sem votação: início e encerramento da participação. Com votação, três datas independentes
 * em sequência — participação → votação → divulgação do resultado — e cada uma pode ser ajustada (prorrogar é só
 * escolher uma nova data de encerramento). Campanhas antigas (votação junto com a participação) continuam como estão
 * até a gestão definir datas próprias para a votação.
 */
export function PeriodSection({ campaignId, campaign, stages, results, perms, onChanged }: TabProps) {
  const hasVoting = !!campaign.features.voting;
  const reg = stages.find((s) => s.stage_key === "registration");
  const vot = stages.find((s) => s.stage_key === "voting");
  const savedAnnounce = hasVoting ? results?.announce_at ?? null : null;
  const announced = results?.status === "announced";
  const stagesKey = JSON.stringify([reg?.starts_at, reg?.ends_at, vot?.starts_at, vot?.ends_at]);
  const saved = useMemo(
    () => scheduleFromServer(stages, savedAnnounce, hasVoting),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stagesKey, savedAnnounce, hasVoting],
  );
  const [values, setValues] = useState(saved.values);
  const { busy, run } = useBusy();

  // Se o servidor mudou as datas (outra pessoa, recarga), o formulário acompanha.
  useEffect(() => { setValues(saved.values); }, [saved]);

  const finished = campaign.status === "closed" || campaign.status === "archived";
  const canEdit = !!perms.campaigns_schedule && !finished;
  const dirty = !sameSchedule(values, saved.values, hasVoting);
  const check = validateSchedule(values, hasVoting, saved);
  const payload = periodPayload(values, hasVoting, saved);
  const valid = !check.issue && !!payload;
  const regPhase = PHASE_STATE[stageState(reg)];
  const votPhase = PHASE_STATE[stageState(vot)];

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
          <span className="text-muted-foreground">Participação</span>
          <b>{fmtRange(reg?.starts_at, reg?.ends_at)}</b>
          <Badge className={cn("border text-[10px]", regPhase.className)}>{regPhase.label}</Badge>
        </div>
        {hasVoting && (
          <div className="flex flex-wrap items-center gap-2">
            <Vote size={16} className="text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">Votação</span>
            <b>{fmtRange(vot?.starts_at, vot?.ends_at)}</b>
            <Badge className={cn("border text-[10px]", votPhase.className)}>{votPhase.label}</Badge>
            {saved.legacy && <span className="text-[11px] text-muted-foreground">junto com a participação</span>}
          </div>
        )}
        {hasVoting && savedAnnounce && (
          <div className="flex flex-wrap items-center gap-2">
            <Megaphone size={16} className="text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">{announced ? "Divulgado em" : "Divulgação"}</span>
            <b>{fmtDayTime(announced ? results?.announced_at ?? savedAnnounce : savedAnnounce)}</b>
          </div>
        )}
      </div>

      <PeriodFields
        values={values} onChange={setValues} hasVoting={hasVoting} check={check}
        disabled={!canEdit || !!busy || announced}
        datesDisabled={results?.status === "confirmed"}
        legacyWindow={saved.legacy}
      />

      <p className="text-[11px] text-muted-foreground">
        Horário de Brasília: cada etapa abre às 00:00 do início e fecha no fim do dia do encerramento.
        {hasVoting ? " A votação só começa depois do fim da participação, e a divulgação só depois do fim da votação." : ""}
      </p>

      {announced && <Notice tone="info">O resultado já foi divulgado: as datas não mudam mais.</Notice>}
      {!canEdit && <Notice tone="info">{finished ? "A campanha foi encerrada: as datas não podem mais ser alteradas." : "Você não tem permissão para alterar as datas."}</Notice>}

      {canEdit && (
        <Button className="gap-2 rounded-xl" onClick={save} disabled={!dirty || !valid || !!busy || announced}>
          {busy === "period" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar período
        </Button>
      )}
    </div>
  );
}
