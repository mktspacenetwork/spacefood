import { useState } from "react";
import { BellRing, CalendarPlus, Loader2, Pause, Play, Trophy, Users } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Progress } from "../../../../components/ui/progress";
import { Textarea } from "../../../../components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../../../components/ui/dialog";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { PHASE_STATE, fmtDateTime, fromInputValue, plural, toInputValue } from "../../../../lib/campaigns/format";
import type { AdminDashboard, AdminResults, TallyRow } from "../../../../lib/campaigns/types";
import { ErrorBox, LoadingBox, Notice, ReasonDialog, SectionLabel, stageState, useBusy, useLoader } from "../shared";
import { ResultFlow } from "./VoteFlow";
import type { TabProps } from "./types";

/**
 * VOTAÇÃO — o único lugar para: situação da votação, controles, ranking e o caminho até o resultado.
 *  - Quem votou em quem (votos individuais) e a ação de invalidar ficam em PARTICIPANTES.
 *  - Datas da votação (início/fim) ficam em CONFIGURAÇÕES; aqui só se pausa, prorroga e encerra.
 */
export function VotingTab({ campaignId, results, perms, onChanged, goTab }: TabProps) {
  const dash = useLoader<AdminDashboard>(() => campaignsApi.get(`/admin/campaigns/${campaignId}/dashboard`), [campaignId]);
  const { busy, run } = useBusy();

  const [pauseOpen, setPauseOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [endNowOpen, setEndNowOpen] = useState(false);
  const [tallyOpen, setTallyOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);

  if (dash.loading && !dash.data) return <LoadingBox />;
  if (dash.error && !dash.data) return <ErrorBox message={dash.error} onRetry={dash.reload} />;
  const d = dash.data;
  if (!d) return null;

  const base = `/admin/campaigns/${campaignId}`;
  const vs = d.stages.find((s) => s.stage_key === "voting");
  const state = stageState(vs);
  const phase = PHASE_STATE[state];
  // `results` (da campanha) traz o registro completo; o painel (dashboard) traz o mais recente. O recente vence.
  const res = { ...(results ?? {}), ...(d.results ?? {}) } as Partial<AdminResults>;
  const resultsStatus = res.status ?? "none";
  const finalized = resultsStatus === "confirmed" || resultsStatus === "announced";
  const official = finalized;
  const canSchedule = !!perms.campaigns_schedule;
  const canSeeTally = !!perms.campaigns_results;
  const tally: TallyRow[] | null = canSeeTally ? d.tally ?? [] : null;
  const refresh = () => { dash.reload(); onChanged(); };

  // ── ações ───────────────────────────────────────────────────────────────
  const pauseToggle = async (reason: string) => {
    const pause = state !== "paused";
    const r = await run("pause", () => campaignsApi.post(`${base}/stages/voting/pause`, { pause, reason: reason || null }), pause ? "Votação pausada." : "Votação reaberta.");
    if (r.ok) { setPauseOpen(false); refresh(); }
  };
  const endNow = async () => {
    setEndNowOpen(false);
    const r = await run("end", () => campaignsApi.post(`${base}/voting/close`, { end_now: true }), "Votação encerrada e apurada.");
    if (r.ok) refresh();
  };
  const tallyNow = async () => {
    setTallyOpen(false);
    const r = await run("tally", () => campaignsApi.post(`${base}/voting/close`, { end_now: false }), "Votação apurada.");
    if (r.ok) refresh();
  };
  const notify = async () => {
    setNotifyOpen(false);
    await run("notify", () => campaignsApi.post<{ queued: number }>(`${base}/notify`, { event: "voting_open" }), "Aviso enviado aos colaboradores elegíveis.");
  };
  const decideTie = async (submissionId: string, justification: string) => {
    const r = await run("tie", () => campaignsApi.post(`${base}/results/tiebreak`, { submission_id: submissionId, justification }), "Desempate registrado.");
    if (r.ok) refresh();
    return r.ok;
  };
  const confirmWinner = async () => {
    setConfirmOpen(false);
    const r = await run("confirm", () => campaignsApi.post(`${base}/results/confirm`), "Vencedor confirmado.");
    if (r.ok) refresh();
  };
  const announce = async () => {
    setAnnounceOpen(false);
    const r = await run("announce", () => campaignsApi.post(`${base}/results/announce`), "Resultado divulgado aos colaboradores.");
    if (r.ok) refresh();
  };

  // ── controles: sempre visíveis; os que não se aplicam ficam desligados COM o motivo ──
  const isBusy = busy !== null;
  const canPause = state === "open" || state === "upcoming";
  const canReopen = state === "paused";
  const canExtend = !!vs?.ends_at && (state === "open" || state === "paused" || state === "closed");
  const canNotify = state === "open";
  const whyNot: string[] = [];
  if (!canPause && !canReopen) whyNot.push("Pausar: só com a votação aberta ou prestes a abrir.");
  if (!canExtend) whyNot.push(vs?.ends_at ? "Prorrogar: só depois que a votação começa." : "Prorrogar: defina uma data de término em Configurações.");
  if (!canNotify) whyNot.push("Avisar: só com a votação aberta.");

  const winnerRow = tally?.find((t) => t.submission_id === res.winner_submission_id);
  const total = d.tally ? d.tally.reduce((acc, t) => acc + t.votes, 0) : d.votes_valid;
  const maxVotes = Math.max(1, ...(tally ?? []).map((t) => t.votes));
  const rankOf = (t: TallyRow) => 1 + (tally ?? []).filter((x) => x.votes > t.votes).length;

  return (
    <div className="space-y-5">
      {/* 1 — Situação */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-vote-status">
        <CardContent className="grid gap-5 p-5 md:grid-cols-2">
          <div className="space-y-2">
            <SectionLabel>Situação da votação</SectionLabel>
            <Badge className={cn("border px-3 py-1 text-sm", phase.className)}>Votação {phase.label.toLowerCase()}</Badge>
            <p className="text-xs text-muted-foreground">
              {vs?.starts_at || vs?.ends_at
                ? `${fmtDateTime(vs?.starts_at)} → ${fmtDateTime(vs?.ends_at)}`
                : "Defina as datas da votação na aba Configurações."}
            </p>
            {state === "open" && vs?.ends_at && <p className="text-xs font-medium text-foreground">Fecha em {fmtDateTime(vs.ends_at)}.</p>}
            {state === "paused" && <p className="text-xs font-medium text-foreground">Pausada: ninguém consegue votar até a reabertura.</p>}
            {state === "closed" && vs?.ends_at && <p className="text-xs text-muted-foreground">Encerrada em {fmtDateTime(vs.ends_at)}.</p>}
          </div>

          <div className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Votos válidos</p>
                <p className="text-3xl font-bold tabular-nums text-foreground">{d.votes_valid}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quem votou</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{d.voters} <span className="text-sm font-medium text-muted-foreground">de {d.eligible}</span></p>
              </div>
            </div>
            <div className="space-y-1">
              <Progress value={Math.min(100, d.voting_pct)} aria-label={`${d.voting_pct}% dos elegíveis já votaram`} />
              <p className="text-[11px] text-muted-foreground">{d.voting_pct}% dos elegíveis já votaram.</p>
            </div>
            {d.votes_invalidated > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {plural(d.votes_invalidated, "voto invalidado", "votos invalidados")} (não entram na contagem). Veja em Participantes.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2 — Controles */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-vote-controls">
        <CardContent className="space-y-3 p-5">
          <SectionLabel>Controles da votação</SectionLabel>
          {finalized ? (
            <Notice tone="info">O vencedor já foi confirmado: a votação não pode mais ser alterada.</Notice>
          ) : !canSchedule ? (
            <p className="text-xs text-muted-foreground">Você não tem permissão para pausar, prorrogar ou avisar sobre a votação.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {canReopen ? (
                  <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setPauseOpen(true)} disabled={isBusy}>
                    {busy === "pause" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Reabrir votação
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setPauseOpen(true)} disabled={!canPause || isBusy}>
                    {busy === "pause" ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />} Pausar votação
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setExtendOpen(true)} disabled={!canExtend || isBusy}>
                  <CalendarPlus size={13} /> Prorrogar
                </Button>
                <Button variant="ghost" size="sm" className="gap-2 rounded-xl" onClick={() => setNotifyOpen(true)} disabled={!canNotify || isBusy}>
                  {busy === "notify" ? <Loader2 size={13} className="animate-spin" /> : <BellRing size={13} />} Avisar que a votação começou
                </Button>
              </div>
              {whyNot.length > 0 && <p className="text-[11px] text-muted-foreground">Indisponível agora — {whyNot.join(" ")}</p>}
            </>
          )}
          <p className="text-[11px] text-muted-foreground">
            Quando a votação começa, as receitas ficam travadas para sempre. Pausar ou prorrogar não libera a edição nem apaga votos. Para encerrar, use o passo 1 abaixo.
          </p>
        </CardContent>
      </Card>

      {/* 3 — Ranking (votos por receita) */}
      <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-vote-ranking">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>Ranking — votos por receita</SectionLabel>
            {tally && (
              <Badge className={cn("border text-[10px]", official
                ? "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
                : "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300")}>
                {official ? "Oficial" : "Parcial"}
              </Badge>
            )}
          </div>

          {!tally ? (
            <Notice tone="info">A contagem de votos por receita aparece para quem tem a permissão “Ver apuração”.</Notice>
          ) : tally.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não há receitas aprovadas para receber votos.</p>
          ) : (
            <>
              {total === 0 && <p className="text-xs text-muted-foreground">Nenhum voto válido registrado ainda.</p>}
              <ol className="space-y-3">
                {tally.map((t) => (
                  <li key={t.submission_id} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        <b className="mr-2 text-muted-foreground">{total > 0 ? `${rankOf(t)}º` : "—"}</b>
                        {t.dish_name} <span className="text-muted-foreground">— {t.author}</span>
                        {official && res.winner_submission_id === t.submission_id && (
                          <Trophy size={13} className="ml-2 inline text-amber-500" aria-label="Vencedora" />
                        )}
                      </span>
                      <b className="shrink-0 tabular-nums">{t.votes}</b>
                    </div>
                    <Progress value={(t.votes / maxVotes) * 100} aria-label={`${t.votes} votos`} />
                  </li>
                ))}
              </ol>
            </>
          )}

          {goTab && (
            <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => goTab("participants")}>
              <Users size={13} /> Ver quem votou em cada receita
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 4 — Do fim da votação ao resultado */}
      <ResultFlow
        phase={state}
        res={res}
        tally={tally}
        perms={perms}
        busy={busy}
        votesValid={d.votes_valid}
        onEndNow={() => setEndNowOpen(true)}
        onTally={() => setTallyOpen(true)}
        onTie={decideTie}
        onConfirm={() => setConfirmOpen(true)}
        onAnnounce={() => setAnnounceOpen(true)}
      />

      {/* Diálogos */}
      <ReasonDialog
        open={pauseOpen}
        onOpenChange={setPauseOpen}
        title={state === "paused" ? "Reabrir a votação?" : "Pausar a votação?"}
        description={state === "paused" ? "Os colaboradores voltam a poder votar." : "Enquanto estiver pausada, ninguém consegue votar. Nenhum voto é apagado."}
        placeholder="Motivo (opcional)"
        confirmLabel={state === "paused" ? "Reabrir votação" : "Pausar votação"}
        pending={busy === "pause"}
        onConfirm={pauseToggle}
      />
      {extendOpen && vs?.ends_at && (
        <ExtendDialog
          stage="voting"
          title="Prorrogar a votação"
          currentEnd={vs.ends_at}
          base={base}
          onClose={() => setExtendOpen(false)}
          onDone={() => { setExtendOpen(false); refresh(); }}
        />
      )}
      <ConfirmDialog
        open={endNowOpen}
        onOpenChange={setEndNowOpen}
        title="Encerrar a votação agora?"
        description="Ninguém mais poderá votar e a votação será apurada. Você ainda poderá registrar o desempate, confirmar o vencedor e divulgar o resultado depois."
        confirmLabel="Encerrar votação"
        variant="destructive"
        onConfirm={endNow}
      />
      <ConfirmDialog
        open={tallyOpen}
        onOpenChange={setTallyOpen}
        title="Apurar a votação?"
        description={plural(d.votes_valid, "voto válido será contado", "votos válidos serão contados") + ". O resultado preliminar fica visível só para a gestão até você confirmar o vencedor."}
        confirmLabel="Apurar"
        onConfirm={tallyNow}
      />
      <ConfirmDialog
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
        title="Avisar que a votação começou?"
        description="Cada colaborador elegível recebe uma notificação. O envio não pode ser desfeito (e ninguém recebe duas vezes)."
        confirmLabel="Enviar aviso"
        onConfirm={notify}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar o vencedor?"
        description={`${winnerRow?.dish_name ?? "A receita"} será registrada como vencedora. Depois disso, votos e datas da votação não podem mais ser alterados.`}
        confirmLabel="Confirmar vencedor"
        onConfirm={confirmWinner}
      />
      <ConfirmDialog
        open={announceOpen}
        onOpenChange={setAnnounceOpen}
        title="Divulgar o resultado?"
        description="Os colaboradores elegíveis passam a ver o vencedor e recebem uma notificação. A divulgação não pode ser desfeita."
        confirmLabel="Divulgar resultado"
        variant="destructive"
        onConfirm={announce}
      />
    </div>
  );
}

/** Prorrogação: novo fim (sempre depois do atual) + motivo opcional. Usada aqui e na aba Configurações (calendário). */
export function ExtendDialog({
  stage, title, currentEnd, base, onClose, onDone,
}: {
  stage: string;
  title: string;
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
    const r = await run("extend", () => campaignsApi.post(`${base}/stages/${stage}/extend`, { ends_at: iso, reason: reason.trim() || null }), "Prazo prorrogado.");
    if (r.ok) onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Prazo atual: {fmtDateTime(currentEnd)} (Brasília). O novo prazo precisa ser depois do atual.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Novo prazo final</Label>
            <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="h-10 rounded-xl" disabled={!!busy} />
            {!valid && <p className="text-[11px] text-destructive">Escolha uma data e hora depois do prazo atual.</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Motivo (opcional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} className="rounded-xl" disabled={!!busy} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={!!busy}>Cancelar</Button>
          <Button className="gap-2 rounded-xl" onClick={submit} disabled={!valid || !!busy}>
            {busy && <Loader2 size={14} className="animate-spin" />} Prorrogar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
