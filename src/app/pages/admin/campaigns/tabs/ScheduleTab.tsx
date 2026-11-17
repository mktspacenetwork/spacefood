import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Lock, Pause, Play, Save, Vote } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { PHASE_STATE, STAGE_LABEL, fmtDateTime, fromInputValue, toInputValue } from "../../../../lib/campaigns/format";
import type { StageKey } from "../../../../lib/campaigns/types";
import { Notice, ReasonDialog, stageState, useBusy } from "../shared";
import type { TabProps } from "./types";

const KEYS: StageKey[] = ["registration", "voting", "results", "announcement"];
type Edit = { starts: string; ends: string };

/**
 * Calendário da campanha (seção de Configurações): edita as datas das quatro etapas.
 * Pausar/prorrogar ficam só nas INSCRIÇÕES; para a votação isso fica na aba Votação,
 * para não haver o mesmo controle em dois lugares.
 */
export function ScheduleTab({ campaignId, campaign, stages, perms, onChanged, goTab }: TabProps) {
  const { busy, run } = useBusy();
  const locked = !!campaign.edit_locked_at;
  const closedCampaign = campaign.status === "closed" || campaign.status === "archived";
  const base = `/admin/campaigns/${campaignId}`;

  const original = useMemo(() => {
    const o = {} as Record<StageKey, Edit>;
    for (const k of KEYS) {
      const s = stages.find((x) => x.stage_key === k);
      o[k] = { starts: toInputValue(s?.starts_at), ends: toInputValue(s?.ends_at) };
    }
    return o;
  }, [stages]);

  const [edits, setEdits] = useState<Record<StageKey, Edit>>(original);
  useEffect(() => setEdits(original), [original]);

  const [saveTarget, setSaveTarget] = useState<StageKey | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);

  const stageOf = (k: StageKey) => stages.find((s) => s.stage_key === k);
  const dirty = (k: StageKey) => edits[k].starts !== original[k].starts || edits[k].ends !== original[k].ends;

  const problem = (k: StageKey): string | null => {
    const s = fromInputValue(edits[k].starts), e = fromInputValue(edits[k].ends);
    if (s && e && new Date(e) <= new Date(s)) return "O fim precisa ser depois do início.";
    const g = (key: StageKey) => ({ s: fromInputValue(edits[key].starts), e: fromInputValue(edits[key].ends) });
    if (k === "registration" || k === "voting") {
      const reg = g("registration"), vot = g("voting");
      if (reg.e && vot.s && new Date(reg.e) > new Date(vot.s)) return "As inscrições precisam terminar antes de a votação começar.";
    }
    if (k === "voting" || k === "results") {
      const vot = g("voting"), res = g("results");
      if (vot.e && res.s && new Date(vot.e) > new Date(res.s)) return "A votação precisa terminar antes de a apuração começar.";
    }
    return null;
  };

  const features = campaign.features;
  const visibleKeys = KEYS.filter((k) => (k === "registration" ? features.submission : k === "announcement" ? features.announcement : features.voting));

  const saveStage = async (reason: string) => {
    const k = saveTarget;
    if (!k) return;
    const r = await run("save", () =>
      campaignsApi.put(`${base}/stages/${k}`, { starts_at: fromInputValue(edits[k].starts), ends_at: fromInputValue(edits[k].ends), reason: reason || null }),
      "Datas salvas.");
    if (r.ok) { setSaveTarget(null); onChanged(); }
  };
  const registration = stageOf("registration");
  const pauseRegistration = async (reason: string) => {
    const pausing = !registration?.paused;
    const r = await run("pause", () => campaignsApi.post(`${base}/stages/registration/pause`, { pause: pausing, reason: reason || null }), pausing ? "Inscrições pausadas." : "Inscrições reabertas.");
    if (r.ok) { setPauseOpen(false); onChanged(); }
  };

  if (!perms.campaigns_schedule) {
    return <Notice tone="info">Você não tem permissão para alterar datas e etapas desta campanha.</Notice>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Datas e horários no fuso de Brasília.</p>

      {locked && (
        <Notice tone="warn" title="A votação já começou">
          <span className="inline-flex items-start gap-1.5"><Lock size={12} className="mt-0.5 shrink-0" />
            O início da votação e as datas das inscrições não podem mais ser alterados. Pausar, reabrir e prorrogar não liberam a edição das receitas — o bloqueio é permanente.
          </span>
        </Notice>
      )}
      {closedCampaign && <Notice tone="warn">Campanha encerrada ou arquivada: as datas não podem mais ser alteradas.</Notice>}

      {visibleKeys.map((k) => {
        const s = stageOf(k);
        const st = stageState(s);
        const phase = PHASE_STATE[st];
        const lockedStarts = locked && (k === "registration" || k === "voting");
        const lockedEnds = locked && k === "registration";
        const err = problem(k);
        const isReg = k === "registration";
        return (
          <Card key={k} className="rounded-3xl border">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{STAGE_LABEL[k]}</p>
                <Badge className={cn("border text-[10px]", phase.className)}>{s?.paused ? "Pausada" : phase.label}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Início</Label>
                  <Input type="datetime-local" value={edits[k].starts} onChange={(e) => setEdits((v) => ({ ...v, [k]: { ...v[k], starts: e.target.value } }))} className="rounded-xl h-10" disabled={lockedStarts || closedCampaign || busy !== null} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Fim</Label>
                  <Input type="datetime-local" value={edits[k].ends} onChange={(e) => setEdits((v) => ({ ...v, [k]: { ...v[k], ends: e.target.value } }))} className="rounded-xl h-10" disabled={lockedEnds || closedCampaign || busy !== null} />
                </div>
              </div>
              {err && <p className="text-[12px] text-destructive">{err}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-2 rounded-xl" disabled={!dirty(k) || !!err || closedCampaign || busy !== null} onClick={() => setSaveTarget(k)}>
                  <Save size={13} /> Salvar datas
                </Button>
                {dirty(k) && (
                  <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setEdits((v) => ({ ...v, [k]: original[k] }))}>Descartar</Button>
                )}
                {isReg && s?.ends_at && !closedCampaign && (
                  <Button size="sm" variant="outline" className="gap-2 rounded-xl" disabled={busy !== null || locked} onClick={() => setExtendOpen(true)}>
                    <CalendarPlus size={13} /> Prorrogar
                  </Button>
                )}
                {isReg && s?.starts_at && !closedCampaign && (
                  <Button size="sm" variant="outline" className="gap-2 rounded-xl" disabled={busy !== null} onClick={() => setPauseOpen(true)}>
                    {s.paused ? <><Play size={13} /> Reabrir</> : <><Pause size={13} /> Pausar</>}
                  </Button>
                )}
              </div>
              {k === "voting" && !closedCampaign && (
                <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                  <Vote size={13} className="shrink-0" />
                  Para pausar, prorrogar ou encerrar a votação, use a aba Votação.
                  {goTab && (
                    <button type="button" onClick={() => goTab("voting")} className="font-semibold text-primary hover:underline">
                      Ir para Votação
                    </button>
                  )}
                </p>
              )}
              {s?.ends_at && <p className="text-[11px] text-muted-foreground">Prazo atual: {fmtDateTime(s.ends_at)}</p>}
            </CardContent>
          </Card>
        );
      })}

      <ReasonDialog
        open={!!saveTarget}
        onOpenChange={(o) => !o && setSaveTarget(null)}
        title="Salvar novas datas"
        description={saveTarget ? `A alteração das datas de "${STAGE_LABEL[saveTarget]}" fica registrada no histórico com os valores anterior e novo.` : undefined}
        label="Motivo da alteração"
        placeholder="Motivo (opcional)"
        confirmLabel="Salvar datas"
        pending={busy === "save"}
        onConfirm={saveStage}
      />
      <ReasonDialog
        open={pauseOpen}
        onOpenChange={setPauseOpen}
        title={registration?.paused ? "Reabrir as inscrições?" : "Pausar as inscrições?"}
        description="Pausar as inscrições impede novos envios e edições enquanto estiver pausada. Nenhuma receita é apagada."
        label="Motivo"
        placeholder="Motivo (opcional)"
        confirmLabel={registration?.paused ? "Reabrir" : "Pausar"}
        pending={busy === "pause"}
        onConfirm={pauseRegistration}
      />
      {extendOpen && registration?.ends_at && (
        <ExtendRegistrationDialog
          currentEnd={registration.ends_at}
          base={base}
          onClose={() => setExtendOpen(false)}
          onDone={() => { setExtendOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
}

/** Prorroga o prazo final das inscrições (o novo prazo precisa ser depois do atual). */
function ExtendRegistrationDialog({
  currentEnd, base, onClose, onDone,
}: {
  currentEnd: string;
  base: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(toInputValue(currentEnd));
  const [reason, setReason] = useState("");
  const { busy, run } = useBusy();
  const iso = fromInputValue(value);
  const valid = !!iso && new Date(iso) > new Date(currentEnd);

  const submit = async () => {
    if (!valid) return;
    const r = await run("extend", () => campaignsApi.post(`${base}/stages/registration/extend`, { ends_at: iso, reason: reason.trim() || null }), "Prazo prorrogado.");
    if (r.ok) onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Prorrogar as inscrições</DialogTitle>
          <DialogDescription>Prazo atual: {fmtDateTime(currentEnd)} (Brasília). O novo prazo precisa ser depois do atual.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Novo prazo final</Label>
            <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="rounded-xl h-10" disabled={!!busy} />
            {!valid && <p className="text-[11px] text-destructive">Escolha uma data e hora depois do prazo atual.</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Motivo (opcional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} className="rounded-xl" disabled={!!busy} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={!!busy}>Cancelar</Button>
          <Button className="rounded-xl" onClick={submit} disabled={!valid || !!busy}>Prorrogar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
