import { useState } from "react";
import { BellRing, CalendarPlus, Loader2, Pause, Play, Square, Vote as VoteIcon } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../../../components/ui/dialog";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { fmtDateTime, fromInputValue, plural, toInputValue } from "../../../../lib/campaigns/format";
import type { AdminDashboard, AdminVote } from "../../../../lib/campaigns/types";
import { EmptyBox, ErrorBox, LoadingBox, Notice, ReasonDialog, SectionLabel, Stat, stageState, useBusy, useLoader } from "../shared";
import type { TabProps } from "./types";

const STATE_BADGE: Record<string, { label: string; className: string }> = {
  unset: { label: "Sem datas", className: "bg-muted text-muted-foreground border-border" },
  upcoming: { label: "Ainda não começou", className: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  open: { label: "Aberta", className: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 border-green-200 dark:border-green-800" },
  paused: { label: "Pausada", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800" },
  closed: { label: "Encerrada", className: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-800" },
};

export function VotingTab({ campaignId, results, perms, onChanged }: TabProps) {
  const dash = useLoader<AdminDashboard>(() => campaignsApi.get(`/admin/campaigns/${campaignId}/dashboard`), [campaignId]);
  const votes = useLoader<AdminVote[] | null>(
    () => (perms.campaigns_votes_view ? campaignsApi.get<AdminVote[]>(`/admin/campaigns/${campaignId}/votes`) : Promise.resolve(null)),
    [campaignId, perms.campaigns_votes_view],
  );
  const { busy, run } = useBusy();

  const [pauseOpen, setPauseOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [endNowOpen, setEndNowOpen] = useState(false);
  const [tallyOpen, setTallyOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [invalidateTarget, setInvalidateTarget] = useState<AdminVote | null>(null);

  if (dash.loading && !dash.data) return <LoadingBox />;
  if (dash.error && !dash.data) return <ErrorBox message={dash.error} onRetry={dash.reload} />;
  const d = dash.data;
  if (!d) return null;

  const vs = d.stages.find((s) => s.stage_key === "voting");
  const state = stageState(vs);
  const badge = STATE_BADGE[state];
  const resultsStatus = results?.status ?? d.results?.status ?? "none";
  const finalized = resultsStatus === "confirmed" || resultsStatus === "announced";
  const canSchedule = !!perms.campaigns_schedule;
  const base = `/admin/campaigns/${campaignId}`;
  const refresh = () => { dash.reload(); votes.reload(); onChanged(); };

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
  const invalidate = async (reason: string) => {
    const v = invalidateTarget;
    if (!v) return;
    const r = await run("invalidate", () => campaignsApi.post(`${base}/votes/${v.id}/invalidate`, { reason }), "Voto invalidado.");
    if (r.ok) { setInvalidateTarget(null); refresh(); }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Votos válidos" value={d.votes_valid} />
        <Stat label="Registrados" value={d.votes_registered} />
        <Stat label="Invalidados" value={d.votes_invalidated} />
        <Stat label="Quem votou" value={`${d.voting_pct}%`} hint={`${d.voters} de ${d.eligible} elegíveis`} />
      </div>

      <Card className="rounded-3xl border">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <SectionLabel>Situação da votação</SectionLabel>
              <p className="text-xs text-muted-foreground">{vs?.starts_at || vs?.ends_at ? `${fmtDateTime(vs?.starts_at)} → ${fmtDateTime(vs?.ends_at)}` : "Defina as datas na aba Calendário."}</p>
            </div>
            <Badge className={cn("border text-[10px]", badge.className)}>{badge.label}</Badge>
          </div>

          {finalized && <Notice tone="info">O vencedor já foi confirmado: a votação não pode mais ser alterada.</Notice>}

          {canSchedule && !finalized && (
            <div className="flex flex-wrap gap-2">
              {(state === "open" || state === "upcoming") && (
                <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setPauseOpen(true)} disabled={busy !== null}>
                  <Pause size={13} /> Pausar votação
                </Button>
              )}
              {state === "paused" && (
                <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setPauseOpen(true)} disabled={busy !== null}>
                  <Play size={13} /> Reabrir votação
                </Button>
              )}
              {(state === "open" || state === "paused" || state === "closed") && vs?.ends_at && (
                <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setExtendOpen(true)} disabled={busy !== null}>
                  <CalendarPlus size={13} /> Prorrogar
                </Button>
              )}
              {(state === "open" || state === "paused") && (
                <Button variant="destructive" size="sm" className="gap-2 rounded-xl" onClick={() => setEndNowOpen(true)} disabled={busy !== null}>
                  {busy === "end" ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />} Encerrar votação agora
                </Button>
              )}
              {state === "closed" && (
                <Button size="sm" className="gap-2 rounded-xl" onClick={() => setTallyOpen(true)} disabled={busy !== null}>
                  {busy === "tally" ? <Loader2 size={13} className="animate-spin" /> : <VoteIcon size={13} />}
                  {resultsStatus === "none" ? "Apurar votação" : "Apurar novamente"}
                </Button>
              )}
              {state === "open" && (
                <Button variant="ghost" size="sm" className="gap-2 rounded-xl" onClick={() => setNotifyOpen(true)} disabled={busy !== null}>
                  <BellRing size={13} /> Avisar que a votação começou
                </Button>
              )}
            </div>
          )}
          {!canSchedule && <p className="text-xs text-muted-foreground">Você não tem permissão para pausar, prorrogar ou encerrar a votação.</p>}
          {canSchedule && state === "paused" && (
            <p className="text-[11px] text-muted-foreground">Pausar não apaga votos nem libera a edição das receitas.</p>
          )}
        </CardContent>
      </Card>

      {/* Votos individuais — só com permissão sensível */}
      {perms.campaigns_votes_view ? (
        <div className="space-y-3">
          <SectionLabel>Votos individuais</SectionLabel>
          {votes.loading && !votes.data ? (
            <LoadingBox />
          ) : votes.error && !votes.data ? (
            <ErrorBox message={votes.error} onRetry={votes.reload} />
          ) : (votes.data ?? []).length === 0 ? (
            <EmptyBox icon={<VoteIcon size={36} />} title="Nenhum voto registrado ainda." />
          ) : (
            <Card className="rounded-3xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Quem votou</TableHead>
                    <TableHead>Receita</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right pr-4"><span className="sr-only">Ações</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(votes.data ?? []).map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="px-4 font-medium">{v.voter_name}</TableCell>
                      <TableCell className="max-w-[14rem] truncate">{v.dish_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDateTime(v.created_at)}</TableCell>
                      <TableCell className="text-xs">
                        {v.invalidated_at ? (
                          <span className="text-destructive" title={v.invalidation_reason ?? undefined}>
                            Invalidado{v.invalidated_by_name ? ` por ${v.invalidated_by_name}` : ""}
                          </span>
                        ) : "Válido"}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        {perms.campaigns_votes_invalidate && !v.invalidated_at && !finalized && (
                          <Button size="sm" variant="ghost" className="rounded-xl text-destructive hover:text-destructive" onClick={() => setInvalidateTarget(v)} disabled={busy !== null}>
                            Invalidar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          <p className="text-[11px] text-muted-foreground">Invalidar preserva o registro e não devolve o direito de votar à pessoa.</p>
        </div>
      ) : (
        <Notice tone="info">Quem votou em qual receita é um dado sensível e só aparece para quem tem a permissão "Ver votos individuais".</Notice>
      )}

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
      <ReasonDialog
        open={!!invalidateTarget}
        onOpenChange={(o) => !o && setInvalidateTarget(null)}
        title="Invalidar voto"
        description={invalidateTarget ? `Voto de ${invalidateTarget.voter_name} em "${invalidateTarget.dish_name}". O registro é preservado no histórico.` : undefined}
        label="Justificativa"
        placeholder="Explique por que o voto é inválido (mínimo de 10 caracteres)"
        minLength={10}
        confirmLabel="Invalidar voto"
        destructive
        pending={busy === "invalidate"}
        onConfirm={invalidate}
      />
    </div>
  );
}

/** Prorrogação: novo fim (sempre depois do atual) + motivo opcional. Usada também na aba Calendário. */
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
          <Button className="rounded-xl gap-2" onClick={submit} disabled={!valid || !!busy}>
            {busy && <Loader2 size={14} className="animate-spin" />} Prorrogar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
