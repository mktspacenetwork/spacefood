import { useState } from "react";
import { Check, Loader2, Megaphone, Minus, ShieldCheck, Square, Trophy, Vote as VoteIcon } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { cn } from "../../../../lib/utils";
import { fmtDateTime, plural } from "../../../../lib/campaigns/format";
import type { PhaseState } from "../../../../lib/campaigns/format";
import type { AdminResults, TallyRow } from "../../../../lib/campaigns/types";
import { Notice, SectionLabel } from "../shared";

/**
 * Do fim da votação ao resultado, em 5 passos visíveis. O passo "atual" fica destacado e traz o botão certo:
 *  1 Encerrar a votação → 2 Apurar → 3 Desempate (só se houver empate) → 4 Confirmar vencedor → 5 Divulgar.
 * Componente apresentacional: quem chama (VotingTab) cuida das chamadas à API, das confirmações e do bloqueio de duplo clique.
 */

type StepState = "done" | "current" | "pending" | "skipped";

export type ResultFlowProps = {
  phase: PhaseState;
  res: Partial<AdminResults>;
  /** null = sem permissão para ver a apuração (não dá para mostrar nomes das receitas) */
  tally: TallyRow[] | null;
  perms: Record<string, boolean>;
  busy: string | null;
  votesValid: number;
  onEndNow: () => void;
  onTally: () => void;
  onTie: (submissionId: string, justification: string) => Promise<boolean>;
  onConfirm: () => void;
  onAnnounce: () => void;
};

const STATE_LABEL: Record<StepState, string> = {
  done: "Concluído",
  current: "Etapa atual",
  pending: "Ainda não",
  skipped: "Não necessário",
};

function Marker({ n, state }: { n: number; state: StepState }) {
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold";
  const cls =
    state === "done"
      ? "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
      : state === "current"
      ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
      : state === "skipped"
      ? "border-border bg-muted text-muted-foreground"
      : "border-border bg-background text-muted-foreground";
  return (
    <span className={cn(base, cls)}>
      {state === "done" ? <Check size={14} aria-hidden="true" /> : state === "skipped" ? <Minus size={14} aria-hidden="true" /> : n}
      <span className="sr-only">{STATE_LABEL[state]}</span>
    </span>
  );
}

function Step({ n, state, title, last, children }: { n: number; state: StepState; title: string; last?: boolean; children?: React.ReactNode }) {
  return (
    <li className="relative flex gap-3" aria-current={state === "current" ? "step" : undefined}>
      {!last && <span className="absolute left-[13px] top-8 bottom-0 w-px bg-border" aria-hidden="true" />}
      <Marker n={n} state={state} />
      <div className={cn("min-w-0 flex-1 space-y-2 pb-6", last && "pb-0")}>
        <p className={cn("text-sm font-bold leading-7", state === "pending" || state === "skipped" ? "text-muted-foreground" : "text-foreground")}>{title}</p>
        {state === "current" ? (
          <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">{children}</div>
        ) : (
          <div className="space-y-1 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
        )}
      </div>
    </li>
  );
}

export function ResultFlow({ phase, res, tally, perms, busy, votesValid, onEndNow, onTally, onTie, onConfirm, onAnnounce }: ResultFlowProps) {
  const [tieChoice, setTieChoice] = useState("");
  const [tieReason, setTieReason] = useState("");

  const status = res.status ?? "none";
  const hasResult = status !== "none";
  const tiePending = status === "tie_pending";
  const tieDecided = !!res.tie_decision_submission_id;
  const confirmed = status === "confirmed" || status === "announced";
  const announced = status === "announced";
  const finalized = confirmed;
  const votingEnded = phase === "closed" || hasResult;
  const canSchedule = !!perms.campaigns_schedule;
  const isBusy = busy !== null;

  const byId = new Map((tally ?? []).map((t) => [t.submission_id, t]));
  const winner = res.winner_submission_id ? byId.get(res.winner_submission_id) : undefined;
  const tieWinner = res.tie_decision_submission_id ? byId.get(res.tie_decision_submission_id) : undefined;
  const tieCandidates = (res.tie_candidates ?? []).map((id) => byId.get(id)).filter((x): x is TallyRow => !!x);

  const s1: StepState = votingEnded ? "done" : phase === "open" || phase === "paused" ? "current" : "pending";
  const s2: StepState = hasResult ? "done" : phase === "closed" ? "current" : "pending";
  const s3: StepState = tiePending ? "current" : tieDecided ? "done" : hasResult ? "skipped" : "pending";
  const s4: StepState = confirmed ? "done" : status === "preliminary" ? "current" : "pending";
  const s5: StepState = announced ? "done" : status === "confirmed" ? "current" : "pending";

  const submitTie = async () => {
    const ok = await onTie(tieChoice, tieReason.trim());
    if (ok) { setTieChoice(""); setTieReason(""); }
  };
  const reasonLen = tieReason.trim().length;

  return (
    <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-vote-flow">
      <CardContent className="space-y-4 p-5">
        <div className="space-y-1">
          <SectionLabel>Do fim da votação ao resultado</SectionLabel>
          <p className="text-xs text-muted-foreground">Siga os passos em ordem: o que você pode fazer agora está destacado.</p>
        </div>

        <ol className="space-y-0">
          {/* 1 — Encerrar */}
          <Step n={1} state={s1} title="Encerrar a votação">
            {s1 === "done" && <p>Votação encerrada.</p>}
            {s1 === "current" && (
              <>
                <p className="text-[13px] text-foreground">
                  A votação está {phase === "paused" ? "pausada" : "aberta"}. Ela encerra sozinha no fim do prazo; se quiser, encerre agora.
                </p>
                {canSchedule && !finalized ? (
                  <Button variant="destructive" size="sm" className="gap-2 rounded-xl" onClick={onEndNow} disabled={isBusy}>
                    {busy === "end" ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />} Encerrar votação agora
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Você não tem permissão para encerrar a votação.</p>
                )}
              </>
            )}
            {s1 === "pending" && <p>{phase === "upcoming" ? "A votação ainda não começou." : "Defina as datas da votação na aba Configurações para liberar este passo."}</p>}
          </Step>

          {/* 2 — Apurar */}
          <Step n={2} state={s2} title="Apurar os votos">
            {s2 === "done" && (
              <>
                <p>
                  Apurado{res.computed_at ? ` em ${fmtDateTime(res.computed_at)}` : ""}
                  {typeof res.total_valid_votes === "number" ? ` · ${plural(res.total_valid_votes, "voto válido", "votos válidos")}` : ""}.
                </p>
                {canSchedule && phase === "closed" && !finalized && (
                  <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-2 rounded-xl text-xs" onClick={onTally} disabled={isBusy}>
                    {busy === "tally" ? <Loader2 size={12} className="animate-spin" /> : <VoteIcon size={12} />} Apurar novamente
                  </Button>
                )}
              </>
            )}
            {s2 === "current" && (
              <>
                <p className="text-[13px] text-foreground">
                  Conta os votos válidos ({votesValid}) e gera o resultado preliminar. Só a gestão vê até você confirmar o vencedor.
                </p>
                {canSchedule ? (
                  <Button size="sm" className="gap-2 rounded-xl" onClick={onTally} disabled={isBusy}>
                    {busy === "tally" ? <Loader2 size={13} className="animate-spin" /> : <VoteIcon size={13} />} Apurar votação
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Você não tem permissão para apurar a votação.</p>
                )}
              </>
            )}
            {s2 === "pending" && <p>Conta os votos válidos e gera o resultado preliminar (só a gestão vê).</p>}
          </Step>

          {/* 3 — Desempate */}
          <Step n={3} state={s3} title="Desempate (só se houver empate)">
            {s3 === "pending" && <p>Necessário apenas se duas ou mais receitas empatarem em 1º lugar. Não há sorteio automático.</p>}
            {s3 === "skipped" && <p>Não houve empate.</p>}
            {s3 === "done" && (
              <p>
                Decidido{tieWinner ? `: ${tieWinner.dish_name} — ${tieWinner.author}` : ""}.
                {res.tie_justification ? <> Justificativa: “{res.tie_justification}”.</> : null}
              </p>
            )}
            {s3 === "current" && (
              <>
                <p className="text-[13px] text-foreground">
                  Duas ou mais receitas empataram em primeiro lugar. A decisão é da gestão e fica registrada com justificativa.
                </p>
                {!perms.campaigns_tiebreak ? (
                  <p className="text-xs text-muted-foreground">Você não tem permissão para decidir o empate.</p>
                ) : tieCandidates.length === 0 ? (
                  <Notice tone="info">Para escolher entre as receitas empatadas é preciso também a permissão “Ver apuração”.</Notice>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Receita vencedora</Label>
                      <Select value={tieChoice} onValueChange={setTieChoice}>
                        <SelectTrigger className="h-10 rounded-xl bg-background" aria-label="Escolha a receita vencedora"><SelectValue placeholder="Escolha entre as empatadas" /></SelectTrigger>
                        <SelectContent>
                          {tieCandidates.map((t) => (
                            <SelectItem key={t.submission_id} value={t.submission_id}>{t.dish_name} — {t.author} ({t.votes} votos)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Justificativa do desempate</Label>
                      <Textarea
                        value={tieReason}
                        onChange={(e) => setTieReason(e.target.value)}
                        rows={3}
                        maxLength={1000}
                        className="rounded-xl bg-background"
                        placeholder="Explique o critério usado (mínimo de 10 caracteres)"
                      />
                      <p className={cn("text-[11px]", reasonLen >= 10 ? "text-muted-foreground" : "text-destructive")}>{reasonLen}/10 caracteres mínimos</p>
                    </div>
                    <Button size="sm" className="gap-2 rounded-xl" onClick={submitTie} disabled={!tieChoice || reasonLen < 10 || isBusy}>
                      {busy === "tie" && <Loader2 size={13} className="animate-spin" />} Registrar desempate
                    </Button>
                  </div>
                )}
              </>
            )}
          </Step>

          {/* 4 — Confirmar */}
          <Step n={4} state={s4} title="Confirmar o vencedor">
            {s4 === "pending" && <p>Registra oficialmente a receita vencedora. Depois disso, votos e datas da votação não podem mais ser alterados.</p>}
            {s4 === "done" && (
              <p>
                {winner ? <><Trophy size={13} className="mr-1 inline text-amber-500" aria-hidden="true" /><b className="text-foreground">{winner.dish_name}</b> — {winner.author} · {plural(res.winner_votes ?? winner.votes, "voto", "votos")}. </> : null}
                Confirmado{res.confirmed_at ? ` em ${fmtDateTime(res.confirmed_at)}` : ""}{res.confirmed_by_name ? ` por ${res.confirmed_by_name}` : ""}.
              </p>
            )}
            {s4 === "current" && (
              <>
                {res.winner_submission_id ? (
                  <>
                    <p className="flex flex-wrap items-center gap-1 text-[13px] text-foreground">
                      <Trophy size={14} className="text-amber-500" aria-hidden="true" />
                      Vencedora (preliminar):{" "}
                      <b>{winner ? `${winner.dish_name} — ${winner.author}` : "receita com mais votos"}</b>
                      {res.winner_votes != null && <span className="text-muted-foreground">· {plural(res.winner_votes, "voto", "votos")}</span>}
                    </p>
                    {perms.campaigns_winner_confirm ? (
                      <Button size="sm" className="gap-2 rounded-xl" onClick={onConfirm} disabled={isBusy}>
                        {busy === "confirm" ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Confirmar vencedor
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">Você não tem permissão para confirmar o vencedor.</p>
                    )}
                  </>
                ) : (
                  <Notice tone="warn" title="Nenhum voto válido">Sem votos válidos não há vencedor para confirmar.</Notice>
                )}
              </>
            )}
          </Step>

          {/* 5 — Divulgar */}
          <Step n={5} state={s5} title="Divulgar o resultado" last>
            {s5 === "pending" && <p>Os colaboradores passam a ver o vencedor e recebem uma notificação. A divulgação não pode ser desfeita.</p>}
            {s5 === "done" && <p>Resultado divulgado{res.announced_at ? ` em ${fmtDateTime(res.announced_at)}` : ""}. A campanha cumpriu o ciclo.</p>}
            {s5 === "current" && (
              <>
                <p className="text-[13px] text-foreground">Tudo pronto. Ao divulgar, os colaboradores elegíveis veem o vencedor e recebem uma notificação.</p>
                {perms.campaigns_announce ? (
                  <Button size="sm" className="gap-2 rounded-xl" onClick={onAnnounce} disabled={isBusy}>
                    {busy === "announce" ? <Loader2 size={13} className="animate-spin" /> : <Megaphone size={13} />} Divulgar resultado
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Você não tem permissão para divulgar o resultado.</p>
                )}
              </>
            )}
          </Step>
        </ol>
      </CardContent>
    </Card>
  );
}
