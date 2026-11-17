import { useState } from "react";
import { Loader2, Megaphone, ShieldCheck, Trophy, Users } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { Label } from "../../../../components/ui/label";
import { Progress } from "../../../../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { Textarea } from "../../../../components/ui/textarea";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { RESULT_STATUS, fmtDateTime, plural } from "../../../../lib/campaigns/format";
import type { AdminResultsPayload, AdminSubmissionDetail, TallyRow } from "../../../../lib/campaigns/types";
import { ErrorBox, LoadingBox, Notice, SectionLabel, useBusy, useLoader } from "../shared";
import type { TabProps } from "./types";

/**
 * RESULTADO da votação, numa tela só (aparece depois do encerramento):
 *   vencedor → conferência (totais e ranking) → [Confirmar vencedor] → [Divulgar para os colaboradores].
 * Em caso de empate, a decisão (com justificativa) vem antes. Cada ação pede confirmação e não dá duplo clique.
 */
export function ResultView({
  campaignId, campaign, perms, goTab, onChanged, totals,
}: Pick<TabProps, "campaignId" | "campaign" | "perms" | "goTab" | "onChanged"> & {
  totals: { votesValid: number; voters: number; eligible: number; invalidated: number };
}) {
  const base = `/admin/campaigns/${campaignId}`;
  const res = useLoader<AdminResultsPayload>(() => campaignsApi.get(`${base}/results`), [campaignId]);
  const { busy, run } = useBusy();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [tieChoice, setTieChoice] = useState("");
  const [tieReason, setTieReason] = useState("");

  const r = res.data?.results ?? null;
  const tally: TallyRow[] = res.data?.tally ?? [];
  const status = r?.status ?? "none";
  const winnerId = r?.winner_submission_id ?? null;

  // Foto do vencedor (só para quem pode analisar receitas; sem a permissão, o cartão fica sem foto).
  const winnerSub = useLoader<AdminSubmissionDetail | null>(
    () => (winnerId && perms.campaigns_review ? campaignsApi.get<AdminSubmissionDetail>(`${base}/submissions/${winnerId}`) : Promise.resolve(null)),
    [campaignId, winnerId, perms.campaigns_review],
  );

  if (res.loading && !res.data) return <LoadingBox label="Carregando o resultado..." />;
  if (res.error && !res.data) return <ErrorBox message={res.error} onRetry={res.reload} />;
  if (!r) return null;

  const meta = RESULT_STATUS[status];
  const confirmed = status === "confirmed" || status === "announced";
  const announced = status === "announced";
  const tiePending = status === "tie_pending";
  const winner = winnerId ? tally.find((t) => t.submission_id === winnerId) : undefined;
  const photo = winnerSub.data?.media.find((m) => m.kind === "main_photo") ?? winnerSub.data?.media.find((m) => m.kind !== "video");
  const maxVotes = Math.max(1, ...tally.map((t) => t.votes));
  const rankOf = (t: TallyRow) => 1 + tally.filter((x) => x.votes > t.votes).length;
  const byId = new Map(tally.map((t) => [t.submission_id, t]));
  const tieCandidates = (r.tie_candidates ?? []).map((id) => byId.get(id)).filter((x): x is TallyRow => !!x);
  const noVotes = totals.votesValid === 0;
  const isBusy = busy !== null;
  const reasonLen = tieReason.trim().length;

  const refresh = () => { res.reload(); onChanged(); };

  const decideTie = async () => {
    const out = await run("tie", () => campaignsApi.post(`${base}/results/tiebreak`, { submission_id: tieChoice, justification: tieReason.trim() }), "Desempate registrado.");
    if (out.ok) { setTieChoice(""); setTieReason(""); refresh(); }
  };
  const confirmWinner = async () => {
    setConfirmOpen(false);
    const out = await run("confirm", () => campaignsApi.post(`${base}/results/confirm`), "Vencedor confirmado.");
    if (out.ok) refresh();
  };
  const announce = async () => {
    setAnnounceOpen(false);
    const out = await run("announce", () => campaignsApi.post(`${base}/results/announce`), "Resultado divulgado aos colaboradores.");
    if (out.ok) refresh();
  };

  return (
    <div className="space-y-4" data-tutorial="camp-result-view">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("border text-[11px]", meta.className)}>{meta.label}</Badge>
        {r.computed_at && <span className="text-[11px] text-muted-foreground">Apurado em {fmtDateTime(r.computed_at)}</span>}
      </div>

      {noVotes ? (
        <Notice tone="warn" title="Nenhum voto válido">Sem votos válidos não há vencedor para confirmar.</Notice>
      ) : tiePending ? (
        /* Empate: decisão com justificativa */
        <Card className="rounded-3xl border border-orange-200 bg-orange-50/60 hover:shadow-none dark:border-orange-800 dark:bg-orange-950/20">
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-base font-bold text-foreground">Empate em 1º lugar</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {plural(tieCandidates.length, "receita tem", "receitas têm")} o mesmo número de votos. Escolha o vencedor e explique o critério — a decisão fica registrada no histórico. Não há sorteio automático.
              </p>
            </div>
            {!perms.campaigns_tiebreak ? (
              <p className="text-xs text-muted-foreground">Você não tem permissão para decidir o empate.</p>
            ) : tieCandidates.length === 0 ? (
              <Notice tone="info">Para escolher entre as receitas empatadas é preciso a permissão “Ver apuração”.</Notice>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Receita vencedora</Label>
                  <Select value={tieChoice} onValueChange={setTieChoice}>
                    <SelectTrigger className="h-11 rounded-xl bg-background" aria-label="Escolha a receita vencedora"><SelectValue placeholder="Escolha entre as empatadas" /></SelectTrigger>
                    <SelectContent>
                      {tieCandidates.map((t) => (
                        <SelectItem key={t.submission_id} value={t.submission_id}>{t.dish_name} — {t.author} ({t.votes} votos)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Justificativa</Label>
                  <Textarea value={tieReason} onChange={(e) => setTieReason(e.target.value)} rows={3} maxLength={1000} className="rounded-xl bg-background" placeholder="Explique o critério usado (mínimo de 10 caracteres)" />
                  <p className={cn("text-[11px]", reasonLen >= 10 ? "text-muted-foreground" : "text-destructive")}>{reasonLen}/10 caracteres mínimos</p>
                </div>
                <Button className="gap-2 rounded-xl" onClick={decideTie} disabled={!tieChoice || reasonLen < 10 || isBusy}>
                  {busy === "tie" && <Loader2 size={14} className="animate-spin" />} Registrar desempate
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Vencedor */
        <Card className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 hover:shadow-none dark:border-amber-800 dark:from-amber-950/30 dark:to-orange-950/20" data-tutorial="camp-result-winner">
          {photo && <img src={photo.url} alt={`Foto de ${winner?.dish_name ?? "receita vencedora"}`} className="aspect-[2/1] w-full object-cover" loading="lazy" />}
          <CardContent className="space-y-1 p-5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              <Trophy size={13} aria-hidden="true" /> {confirmed ? "Vencedor" : "Vencedor (preliminar)"}
            </p>
            <p className="text-xl font-bold text-foreground">{winner?.dish_name ?? "Receita mais votada"}</p>
            <p className="text-sm text-muted-foreground">
              {winner ? `por ${winner.author}` : ""}
              {r.winner_votes != null ? `${winner ? " · " : ""}${plural(r.winner_votes, "voto", "votos")}` : ""}
            </p>
            {r.tie_justification && <p className="pt-1 text-[12px] italic text-muted-foreground">Desempate: “{r.tie_justification}”</p>}
            {confirmed && (
              <p className="pt-1 text-[11px] text-muted-foreground">
                Confirmado{r.confirmed_at ? ` em ${fmtDateTime(r.confirmed_at)}` : ""}{r.confirmed_by_name ? ` por ${r.confirmed_by_name}` : ""}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Para conferir */}
      <Card className="rounded-3xl border hover:shadow-none" data-tutorial="camp-result-check">
        <CardContent className="space-y-4 p-5">
          <SectionLabel>Para conferir</SectionLabel>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Votos válidos</dt><dd className="text-xl font-bold tabular-nums">{totals.votesValid}</dd></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quem votou</dt><dd className="text-xl font-bold tabular-nums">{totals.voters} <span className="text-xs font-medium text-muted-foreground">de {totals.eligible}</span></dd></div>
            {totals.invalidated > 0 && (
              <div><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Invalidados</dt><dd className="text-xl font-bold tabular-nums">{totals.invalidated}</dd></div>
            )}
          </dl>

          {tally.length > 0 && (
            <ol className="space-y-3">
              {tally.map((t) => (
                <li key={t.submission_id} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <b className="mr-2 text-muted-foreground">{noVotes ? "—" : `${rankOf(t)}º`}</b>
                      {t.dish_name} <span className="text-muted-foreground">— {t.author}</span>
                      {winnerId === t.submission_id && <Trophy size={13} className="ml-2 inline text-amber-500" aria-label="Vencedora" />}
                    </span>
                    <b className="shrink-0 tabular-nums">{t.votes}</b>
                  </div>
                  <Progress value={(t.votes / maxVotes) * 100} aria-label={`${t.dish_name}: ${t.votes} votos`} />
                </li>
              ))}
            </ol>
          )}

          {goTab && perms.campaigns_participants && (
            <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => goTab("participants")}>
              <Users size={13} /> Ver quem votou em cada receita
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Ações, em ordem: confirmar → divulgar */}
      {!noVotes && !tiePending && (
        <Card className="rounded-3xl border hover:shadow-none" data-tutorial="camp-result-actions">
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="gap-2 rounded-xl"
                variant={confirmed ? "outline" : "primary"}
                onClick={() => setConfirmOpen(true)}
                disabled={confirmed || !perms.campaigns_winner_confirm || isBusy}
              >
                {busy === "confirm" ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                {confirmed ? "Vencedor confirmado" : "Confirmar vencedor"}
              </Button>
              {campaign.features.announcement && (
                <Button
                  className="gap-2 rounded-xl"
                  variant={confirmed && !announced ? "primary" : "outline"}
                  onClick={() => setAnnounceOpen(true)}
                  disabled={!confirmed || announced || !perms.campaigns_announce || isBusy}
                >
                  {busy === "announce" ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
                  {announced ? "Resultado divulgado" : "Divulgar para os colaboradores"}
                </Button>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground">
              {!confirmed
                ? "Confira o resultado acima e confirme o vencedor. Depois de confirmado, os votos não podem mais ser alterados."
                : campaign.features.announcement && !announced
                ? "Quando quiser, divulgue: os colaboradores passam a ver o vencedor e recebem um aviso. Não dá para desfazer."
                : announced
                ? `Divulgado${r.announced_at ? ` em ${fmtDateTime(r.announced_at)}` : ""}. A campanha cumpriu o ciclo.`
                : "O resultado fica só com a gestão."}
            </p>
            {!confirmed && !perms.campaigns_winner_confirm && <p className="text-[11px] text-muted-foreground">Você não tem permissão para confirmar o vencedor.</p>}
            {confirmed && !announced && campaign.features.announcement && !perms.campaigns_announce && <p className="text-[11px] text-muted-foreground">Você não tem permissão para divulgar o resultado.</p>}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar o vencedor?"
        description={`${winner?.dish_name ?? "A receita mais votada"} será registrada como vencedora. Depois disso, os votos não podem mais ser alterados.`}
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
