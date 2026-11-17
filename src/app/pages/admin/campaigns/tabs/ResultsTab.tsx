import { useState } from "react";
import { Loader2, Megaphone, ShieldCheck, Trophy } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { Label } from "../../../../components/ui/label";
import { Progress } from "../../../../components/ui/progress";
import { Textarea } from "../../../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { RESULT_STATUS, fmtDateTime } from "../../../../lib/campaigns/format";
import type { AdminResults, TallyRow } from "../../../../lib/campaigns/types";
import { ErrorBox, LoadingBox, Notice, SectionLabel, Stat, useBusy, useLoader } from "../shared";
import type { TabProps } from "./types";

type Payload = { results: AdminResults | null; tally: TallyRow[] };

export function ResultsTab({ campaignId, perms, onChanged }: TabProps) {
  const { data, loading, error, reload } = useLoader<Payload>(
    () => campaignsApi.get(`/admin/campaigns/${campaignId}/results`),
    [campaignId],
  );
  const { busy, run } = useBusy();
  const [tieChoice, setTieChoice] = useState("");
  const [tieReason, setTieReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);

  if (loading && !data) return <LoadingBox />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const res = data.results;
  const status = res?.status ?? "none";
  const meta = RESULT_STATUS[status];
  const tally = data.tally;
  const maxVotes = Math.max(1, ...tally.map((t) => t.votes));
  const byId = new Map(tally.map((t) => [t.submission_id, t]));
  const winner = res?.winner_submission_id ? byId.get(res.winner_submission_id) : undefined;
  const base = `/admin/campaigns/${campaignId}/results`;
  const refresh = () => { reload(); onChanged(); };

  const tieCandidates = (res?.tie_candidates ?? []).map((id) => byId.get(id)).filter((x): x is TallyRow => !!x);

  const decideTie = async () => {
    const r = await run("tie", () => campaignsApi.post(`${base}/tiebreak`, { submission_id: tieChoice, justification: tieReason.trim() }), "Desempate registrado.");
    if (r.ok) { setTieChoice(""); setTieReason(""); refresh(); }
  };
  const confirm = async () => {
    setConfirmOpen(false);
    const r = await run("confirm", () => campaignsApi.post(`${base}/confirm`), "Vencedor confirmado.");
    if (r.ok) refresh();
  };
  const announce = async () => {
    setAnnounceOpen(false);
    const r = await run("announce", () => campaignsApi.post(`${base}/announce`), "Resultado divulgado aos colaboradores.");
    if (r.ok) refresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Situação do resultado</SectionLabel>
        <Badge className={cn("border text-[10px]", meta.className)}>{meta.label}</Badge>
      </div>

      {status === "none" ? (
        <Notice tone="info" title="A votação ainda não foi apurada">
          Encerre a votação e clique em "Apurar" na aba Votação para gerar o resultado preliminar.
        </Notice>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Votos válidos" value={res?.total_valid_votes ?? 0} />
            <Stat label="Quem votou" value={res?.voters_count ?? 0} hint={`de ${res?.eligible_count ?? 0} elegíveis`} />
            <Stat label="Apurado em" value={<span className="text-sm">{fmtDateTime(res?.computed_at)}</span>} />
          </div>

          <Card className="rounded-3xl border">
            <CardContent className="p-5 space-y-4">
              <SectionLabel>Votos por receita</SectionLabel>
              {tally.length === 0 ? (
                <p className="text-sm text-muted-foreground">Não há receitas aprovadas.</p>
              ) : (
                <ol className="space-y-3">
                  {tally.map((t, i) => (
                    <li key={t.submission_id} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          <b className="text-muted-foreground mr-2">{i + 1}º</b>{t.dish_name} <span className="text-muted-foreground">— {t.author}</span>
                          {res?.winner_submission_id === t.submission_id && <Trophy size={13} className="inline ml-2 text-amber-500" aria-label="Vencedora" />}
                        </span>
                        <b className="tabular-nums shrink-0">{t.votes}</b>
                      </div>
                      <Progress value={(t.votes / maxVotes) * 100} />
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {status === "tie_pending" && (
            <Card className="rounded-3xl border border-orange-300 dark:border-orange-800">
              <CardContent className="p-5 space-y-4">
                <div>
                  <SectionLabel>Empate: decisão pendente</SectionLabel>
                  <p className="text-sm text-muted-foreground mt-1">
                    Duas ou mais receitas empataram em primeiro lugar. Não há sorteio automático: a decisão é da gestão e fica registrada com justificativa.
                  </p>
                </div>
                {perms.campaigns_tiebreak ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Receita vencedora</Label>
                      <Select value={tieChoice} onValueChange={setTieChoice}>
                        <SelectTrigger className="rounded-xl h-10" aria-label="Escolha a receita vencedora"><SelectValue placeholder="Escolha entre as empatadas" /></SelectTrigger>
                        <SelectContent>
                          {tieCandidates.map((t) => <SelectItem key={t.submission_id} value={t.submission_id}>{t.dish_name} — {t.author} ({t.votes} votos)</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Justificativa do desempate</Label>
                      <Textarea value={tieReason} onChange={(e) => setTieReason(e.target.value)} rows={3} maxLength={1000} className="rounded-xl" placeholder="Explique o critério usado (mínimo de 10 caracteres)" />
                      <p className={cn("text-[11px]", tieReason.trim().length >= 10 ? "text-muted-foreground" : "text-destructive")}>{tieReason.trim().length}/10 caracteres mínimos</p>
                    </div>
                    <Button className="gap-2 rounded-xl" onClick={decideTie} disabled={!tieChoice || tieReason.trim().length < 10 || busy !== null}>
                      {busy === "tie" && <Loader2 size={14} className="animate-spin" />} Registrar desempate
                    </Button>
                  </div>
                ) : (
                  <Notice tone="info">Você não tem permissão para decidir o empate.</Notice>
                )}
              </CardContent>
            </Card>
          )}

          {(status === "preliminary" || status === "confirmed" || status === "announced") && winner && (
            <Card className="rounded-3xl border">
              <CardContent className="p-5 space-y-3">
                <SectionLabel>{status === "preliminary" ? "Vencedora (preliminar)" : "Vencedora"}</SectionLabel>
                <p className="flex items-center gap-2 text-base font-bold"><Trophy size={18} className="text-amber-500" /> {winner.dish_name}</p>
                <p className="text-sm text-muted-foreground">{winner.author} · {winner.votes} voto(s)</p>
                {res?.tie_justification && <p className="text-xs text-muted-foreground italic">Desempate: “{res.tie_justification}”</p>}
                {res?.confirmed_at && <p className="text-xs text-muted-foreground">Confirmada em {fmtDateTime(res.confirmed_at)}{res.confirmed_by_name ? ` por ${res.confirmed_by_name}` : ""}.</p>}
                {res?.announced_at && <p className="text-xs text-muted-foreground">Divulgada em {fmtDateTime(res.announced_at)}.</p>}

                <div className="flex flex-wrap gap-2 pt-1">
                  {status === "preliminary" && perms.campaigns_winner_confirm && (
                    <Button className="gap-2 rounded-xl" onClick={() => setConfirmOpen(true)} disabled={busy !== null}>
                      {busy === "confirm" ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Confirmar vencedor
                    </Button>
                  )}
                  {status === "confirmed" && perms.campaigns_announce && (
                    <Button className="gap-2 rounded-xl" onClick={() => setAnnounceOpen(true)} disabled={busy !== null}>
                      {busy === "announce" ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />} Divulgar resultado
                    </Button>
                  )}
                </div>
                {status === "preliminary" && !perms.campaigns_winner_confirm && <p className="text-xs text-muted-foreground">Você não tem permissão para confirmar o vencedor.</p>}
                {status === "confirmed" && !perms.campaigns_announce && <p className="text-xs text-muted-foreground">Você não tem permissão para divulgar o resultado.</p>}
              </CardContent>
            </Card>
          )}

          {status === "preliminary" && !winner && (
            <Notice tone="warn" title="Nenhum voto válido">Sem votos válidos não há vencedor para confirmar.</Notice>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar o vencedor?"
        description={`${winner?.dish_name ?? "A receita"} será registrada como vencedora. Depois disso, votos e datas da votação não podem mais ser alterados.`}
        confirmLabel="Confirmar vencedor"
        onConfirm={confirm}
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
