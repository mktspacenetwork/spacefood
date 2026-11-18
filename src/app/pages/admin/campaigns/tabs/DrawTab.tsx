import { useState } from "react";
import {
  CalendarClock, Dices, Loader2, Megaphone, RefreshCw, ShieldCheck, Trash2, Trophy, Users,
} from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { fmtDateTime, fmtDayTime, plural } from "../../../../lib/campaigns/format";
import type { AdminDraw, DrawStatus } from "../../../../lib/campaigns/types";
import { EmptyBox, ErrorBox, LoadingBox, Notice, ReasonDialog, SectionLabel, useBusy, useLoader } from "../shared";
import { Fold } from "./ui";
import { EligibleList, Requirement, ScheduleDialog, WinnersList } from "./DrawParts";
import type { TabProps } from "./types";

const STATUS_META: Record<DrawStatus, { label: string; className: string }> = {
  none: { label: "Ainda não sorteado", className: "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" },
  drawn: { label: "Sorteado — falta confirmar", className: "border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200" },
  confirmed: { label: "Confirmado", className: "border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200" },
  announced: { label: "Divulgado", className: "border-purple-200 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200" },
};

/**
 * SORTEIO da campanha (aparece só quando a campanha tem sorteio).
 *   Antes: pré-requisitos (participação encerrada, sem receitas pendentes, elegíveis) → [Sortear] (uma única vez).
 *   Depois: ganhadores → [Confirmar] ou [Descartar com justificativa] → [Divulgar agora] ou [Programar divulgação].
 * Cada ação irreversível pede confirmação e não dá duplo clique. O banco faz o sorteio, registra tudo e, no horário
 * programado, divulga e avisa quem participou, uma única vez; esta tela só pede, agenda, altera, cancela e mostra o estado.
 */
export function DrawTab({ campaignId, perms, goTab, onChanged }: TabProps) {
  const base = `/admin/campaigns/${campaignId}/draw`;
  const canView = !!perms.campaigns_results;
  const res = useLoader<AdminDraw | null>(
    () => (canView ? campaignsApi.get<AdminDraw>(base) : Promise.resolve(null)),
    [campaignId, canView],
  );
  const { busy, run } = useBusy();
  const [runOpen, setRunOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!canView) {
    return <Notice tone="info" title="Sem acesso ao sorteio">Você não tem a permissão “Ver apuração”, necessária para acompanhar o sorteio.</Notice>;
  }
  if (res.loading && !res.data) return <LoadingBox label="Carregando o sorteio..." />;
  if (res.error && !res.data) return <ErrorBox message={res.error} onRetry={res.reload} />;
  const d = res.data;
  if (!d) return null;
  if (!d.enabled) {
    return <EmptyBox icon={<Dices size={36} />} title="Esta campanha não tem sorteio" hint="Ative o sorteio em Configurações da campanha." />;
  }

  const refresh = () => { res.reload(); onChanged(); };
  const isBusy = busy !== null;
  const meta = STATUS_META[d.status];
  const draw = d.draw;
  const drawn = d.status !== "none" && !!draw;
  const confirmed = d.status === "confirmed" || d.status === "announced";
  const announced = d.status === "announced";
  const announceAt = draw?.announce_at ?? null;
  const scheduled = !!announceAt && !announced;
  const dueNow = scheduled && new Date(announceAt as string).getTime() <= Date.now();
  const canRun = d.can_run && !!perms.campaigns_results;
  const canConfirm = !!perms.campaigns_winner_confirm;
  const canAnnounce = !!perms.campaigns_announce;
  const winners = draw?.winners ?? [];

  const doRun = async () => {
    setRunOpen(false);
    const out = await run("run", () => campaignsApi.post(`${base}/run`), "Sorteio realizado.");
    if (out.ok) refresh();
  };
  const doConfirm = async () => {
    setConfirmOpen(false);
    const out = await run("confirm", () => campaignsApi.post(`${base}/confirm`), "Sorteio confirmado.");
    if (out.ok) refresh();
  };
  const doDiscard = async (reason: string) => {
    const out = await run("discard", () => campaignsApi.post(`${base}/discard`, { reason }), "Sorteio descartado. Você pode sortear de novo.");
    if (out.ok) { setDiscardOpen(false); refresh(); }
  };
  const doAnnounce = async () => {
    setAnnounceOpen(false);
    const out = await run("announce", () => campaignsApi.post(`${base}/announce`), "Ganhadores divulgados aos colaboradores.");
    if (out.ok) refresh();
  };
  const doSchedule = async (iso: string) => {
    const out = await run("schedule", () => campaignsApi.post(`${base}/schedule`, { announce_at: iso }), `Divulgação programada para ${fmtDayTime(iso)}.`);
    if (out.ok) { setSchedOpen(false); refresh(); }
  };
  const doUnschedule = async () => {
    setCancelOpen(false);
    const out = await run("unschedule", () => campaignsApi.del(`${base}/schedule`), "Programação cancelada. O sorteio segue sem divulgação.");
    if (out.ok) refresh();
  };

  const regOk = !d.registration_open;
  const reviewOk = d.pending_review === 0;
  const eligibleOk = d.eligible_count >= 1;
  const allMet = regOk && reviewOk && eligibleOk;

  const eligibleFold = (
    <Fold
      title="Quem entra no sorteio"
      hint="Pessoas com pelo menos uma receita aprovada"
      icon={<Users size={18} />}
      badge={<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">{d.eligible_count}</span>}
      defaultOpen={!drawn}
      tutorial="camp-draw-eligible"
    >
      <EligibleList eligible={d.eligible} />
    </Fold>
  );

  return (
    <div className="space-y-4" data-tutorial="camp-draw">
      {/* Estado */}
      <div className="flex flex-wrap items-center justify-between gap-2" data-tutorial="camp-draw-status">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("border text-[11px]", meta.className)}>{meta.label}</Badge>
          <span className="text-[12px] text-muted-foreground">
            {plural(d.winners_count, "ganhador", "ganhadores")} · {plural(d.eligible_count, "pessoa elegível", "pessoas elegíveis")}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="gap-2 rounded-xl text-muted-foreground" onClick={res.reload} disabled={res.loading || isBusy}>
          <RefreshCw size={14} className={res.loading ? "animate-spin" : ""} /> Atualizar
        </Button>
      </div>

      {/* Antes de sortear */}
      {!drawn && (
        <Card className="rounded-3xl border hover:shadow-none">
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-base font-bold text-foreground">Sortear {plural(d.winners_count, "ganhador", "ganhadores")}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Entre as pessoas com receita aprovada, uma chance por pessoa e no máximo um prêmio por pessoa. O sorteio é feito uma única vez e fica registrado.
              </p>
            </div>
            <ul className="space-y-2" aria-label="O que precisa estar pronto">
              <Requirement ok={regOk}>Participação encerrada</Requirement>
              <Requirement ok={reviewOk}>
                {reviewOk ? "Nenhuma receita aguardando análise" : `${plural(d.pending_review, "receita aguardando análise", "receitas aguardando análise")}`}
              </Requirement>
              <Requirement ok={eligibleOk}>
                {eligibleOk ? plural(d.eligible_count, "pessoa com receita aprovada", "pessoas com receita aprovada") : "Ninguém com receita aprovada"}
              </Requirement>
            </ul>
            {allMet && !d.can_run && d.reason && <Notice tone="warn">{d.reason}</Notice>}
            {d.eligible_count > 0 && d.eligible_count < d.winners_count && (
              <Notice tone="info">Há menos pessoas elegíveis ({d.eligible_count}) do que ganhadores ({d.winners_count}).</Notice>
            )}
            <div className="flex flex-wrap items-center gap-2" data-tutorial="camp-draw-actions">
              {perms.campaigns_results && (
                <Button className="gap-2 rounded-xl" onClick={() => setRunOpen(true)} disabled={!canRun || isBusy}>
                  {busy === "run" ? <Loader2 size={14} className="animate-spin" /> : <Dices size={14} />} Sortear
                </Button>
              )}
              {!reviewOk && goTab && perms.campaigns_review && (
                <Button variant="outline" className="gap-2 rounded-xl" onClick={() => goTab("submissions")}>
                  <Users size={14} /> Analisar receitas
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Elegíveis: antes do sorteio ficam logo abaixo dos pré-requisitos (abertos); depois, recolhidos no fim da tela */}
      {!drawn && eligibleFold}

      {/* Ganhadores */}
      {drawn && draw && (
        <Card className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 hover:shadow-none dark:border-amber-800 dark:from-amber-950/30 dark:to-orange-950/20" data-tutorial="camp-draw-winners">
          <CardContent className="space-y-3 p-5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              <Trophy size={13} aria-hidden="true" /> {plural(winners.length, "Ganhador sorteado", "Ganhadores sorteados")}
            </p>
            <WinnersList winners={winners} />
            <p className="text-[11px] text-muted-foreground">
              Sorteado em {fmtDateTime(draw.drawn_at)}{draw.drawn_by_name ? ` por ${draw.drawn_by_name}` : ""}.
              {confirmed && draw.confirmed_at ? ` Confirmado em ${fmtDateTime(draw.confirmed_at)}${draw.confirmed_by_name ? ` por ${draw.confirmed_by_name}` : ""}.` : ""}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Ações depois do sorteio */}
      {drawn && !announced && (
        <Card className="rounded-3xl border hover:shadow-none" data-tutorial="camp-draw-actions">
          <CardContent className="space-y-3 p-5">
            <SectionLabel>{confirmed ? "Divulgação" : "Conferir e confirmar"}</SectionLabel>

            {!confirmed ? (
              <>
                <p className="text-[13px] text-muted-foreground">
                  Confira os ganhadores. Ao confirmar, o resultado fica oficial e não pode mais ser alterado. Se algo estiver errado, descarte (com justificativa) e sorteie de novo.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {canConfirm && (
                    <>
                      <Button className="gap-2 rounded-xl" onClick={() => setConfirmOpen(true)} disabled={isBusy}>
                        {busy === "confirm" ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Confirmar sorteio
                      </Button>
                      <Button variant="outline" className="gap-2 rounded-xl text-destructive hover:text-destructive" onClick={() => setDiscardOpen(true)} disabled={isBusy}>
                        {busy === "discard" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Descartar sorteio
                      </Button>
                    </>
                  )}
                </div>
                {!canConfirm && <p className="text-[11px] text-muted-foreground">Você não tem permissão para confirmar ou descartar o sorteio.</p>}
              </>
            ) : (
              <>
                {!scheduled && (
                  <p className="text-[13px] text-muted-foreground">
                    Divulgue agora ou programe data e hora: os colaboradores passam a ver os ganhadores e quem participou recebe um aviso. A divulgação não pode ser desfeita.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {canAnnounce && (
                    <>
                      <Button className="gap-2 rounded-xl" variant={scheduled ? "outline" : "primary"} onClick={() => setAnnounceOpen(true)} disabled={isBusy}>
                        {busy === "announce" ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />} Divulgar agora
                      </Button>
                      {!scheduled && (
                        <Button className="gap-2 rounded-xl" variant="outline" onClick={() => setSchedOpen(true)} disabled={isBusy}>
                          <CalendarClock size={14} /> Programar divulgação
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {scheduled && (
                  <div className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5 dark:border-blue-800 dark:bg-blue-950/20" data-tutorial="camp-draw-schedule">
                    <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
                      <CalendarClock size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                      <span>Divulgação programada para {fmtDayTime(announceAt)}{dueNow ? " — em instantes" : ""}</span>
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {draw?.announce_scheduled_by_name ? `Programada por ${draw.announce_scheduled_by_name}. ` : ""}
                      No horário, os ganhadores aparecem para os colaboradores e quem participou recebe um aviso, uma única vez.
                    </p>
                    {canAnnounce && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setSchedOpen(true)} disabled={isBusy || dueNow}>
                          Alterar horário
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-2 rounded-xl text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)} disabled={isBusy || dueNow}>
                          {busy === "unschedule" && <Loader2 size={13} className="animate-spin" />} Cancelar programação
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {!canAnnounce && <p className="text-[11px] text-muted-foreground">Você não tem permissão para divulgar o sorteio.</p>}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {announced && draw && (
        <Notice tone="ok" title="Sorteio divulgado">
          {draw.announced_at ? `Divulgado em ${fmtDateTime(draw.announced_at)}. ` : ""}
          Os colaboradores já veem os ganhadores e quem participou foi avisado. O resultado não pode mais ser alterado.
        </Notice>
      )}

      {drawn && eligibleFold}

      <ConfirmDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        title="Realizar o sorteio agora?"
        description={`Serão sorteados ${plural(d.winners_count, "ganhador", "ganhadores")} entre ${plural(d.eligible_count, "pessoa", "pessoas")}. O sorteio é feito uma única vez e fica registrado no histórico.`}
        confirmLabel="Sortear"
        onConfirm={doRun}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar o sorteio?"
        description="Os ganhadores ficam oficiais e o resultado não pode mais ser alterado nem descartado."
        confirmLabel="Confirmar sorteio"
        onConfirm={doConfirm}
      />
      <ReasonDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Descartar o sorteio?"
        description="Os ganhadores atuais deixam de valer e o sorteio poderá ser refeito. A justificativa fica registrada no histórico."
        placeholder="Explique o motivo (mínimo de 10 caracteres)"
        minLength={10}
        confirmLabel="Descartar sorteio"
        destructive
        pending={busy === "discard"}
        onConfirm={doDiscard}
      />
      <ConfirmDialog
        open={announceOpen}
        onOpenChange={setAnnounceOpen}
        title="Divulgar os ganhadores agora?"
        description={`Os colaboradores passam a ver os ganhadores e quem participou recebe um aviso.${scheduled ? " A divulgação programada deixa de valer." : ""} A divulgação não pode ser desfeita.`}
        confirmLabel="Divulgar agora"
        variant="destructive"
        onConfirm={doAnnounce}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar a divulgação programada?"
        description="Os ganhadores não serão divulgados no horário marcado. Você pode divulgar agora ou programar outro horário quando quiser."
        confirmLabel="Cancelar programação"
        variant="destructive"
        onConfirm={doUnschedule}
      />
      <ScheduleDialog open={schedOpen} onOpenChange={setSchedOpen} current={announceAt} pending={busy === "schedule"} onSave={doSchedule} />
    </div>
  );
}
