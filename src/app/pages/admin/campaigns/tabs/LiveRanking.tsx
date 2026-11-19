import { useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Trophy, Vote } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { Progress } from "../../../../components/ui/progress";
import { Switch } from "../../../../components/ui/switch";
import { cn } from "../../../../lib/utils";
import { TIMEZONE } from "../../../../lib/date-utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { fmtDateTime, plural } from "../../../../lib/campaigns/format";
import { positionLabel, rankPositions, totalVotes } from "../../../../lib/campaigns/ranking";
import type { AdminVote, AdminVotesPayload, TallyRow } from "../../../../lib/campaigns/types";
import { ErrorBox, LoadingBox, ReasonDialog, SectionLabel, useBusy, useLoader } from "../shared";
import { Fold } from "./ui";
import { SWITCH_HIT } from "../../../../lib/campaigns/touch";

const TOP = 8;

/**
 * Ranking AO VIVO (só a gestão vê). Enquanto a votação está aberta o selo diz "Parcial" e aparece "Ao vivo"; com o
 * vencedor confirmado, "Oficial". Posição de COMPETIÇÃO (1º, 1º, 3º) pela mesma regra do que o colaborador vê
 * (`lib/campaigns/ranking.ts`). Só receitas aprovadas e no prazo entram (o servidor já filtra).
 */
export function RankingCard({
  tally, live, official, winnerId, updatedAt,
}: { tally: TallyRow[]; live: boolean; official: boolean; winnerId?: string | null; updatedAt?: Date | null }) {
  const [all, setAll] = useState(false);
  const anyVotes = totalVotes(tally) > 0;
  const max = Math.max(1, ...tally.map((t) => t.votes));
  const ranked = useMemo(() => rankPositions(tally), [tally]);
  const shown = all ? ranked : ranked.slice(0, TOP);

  return (
    <Card className="rounded-3xl border hover:shadow-sm" data-tutorial="camp-vote-ranking">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>2 · Ranking: receitas mais votadas</SectionLabel>
          <div className="flex flex-wrap items-center gap-2">
            {live && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-green-700 dark:text-green-300">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                Ao vivo
              </span>
            )}
            {updatedAt && (
              <span className="text-[11px] text-muted-foreground" aria-live="off">Atualizado às {formatInTimeZone(updatedAt, TIMEZONE, "HH:mm")}</span>
            )}
            <Badge className={cn("border text-[10px]", official
              ? "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
              : "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300")}>
              {official ? "Oficial" : live ? "Parcial" : "Preliminar"}
            </Badge>
          </div>
        </div>

        {tally.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há receitas aprovadas para receber votos.</p>
        ) : !anyVotes ? (
          <p className="text-sm text-muted-foreground">Sem votos ainda. {plural(tally.length, "receita aprovada concorre", "receitas aprovadas concorrem")}.</p>
        ) : (
          <>
            <ol className="space-y-3">
              {shown.map(({ item: t, position, tied }) => (
                <li key={t.submission_id} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <b className="mr-2 inline-block w-7 text-muted-foreground">{positionLabel(position)}</b>
                      {t.dish_name} <span className="text-muted-foreground">— {t.author}</span>
                      {tied && t.votes > 0 && <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">Empate</span>}
                      {official && winnerId === t.submission_id && <Trophy size={13} className="ml-2 inline text-amber-500" aria-label="Vencedora" />}
                    </span>
                    <b className="shrink-0 tabular-nums">{t.votes}</b>
                  </div>
                  <Progress value={(t.votes / max) * 100} aria-label={`${t.dish_name}: ${t.votes} votos`} />
                </li>
              ))}
            </ol>
            {tally.length > TOP && (
              <Button variant="ghost" size="sm" className="h-11 rounded-xl text-primary" onClick={() => setAll((v) => !v)}>
                {all ? "Mostrar só as mais votadas" : `Ver todas (${tally.length})`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Chave por campanha "Mostrar aos colaboradores" (`visibility.show_partial`, padrão desligado). Ligada, os colaboradores
 * ganham o item "Ranking" e veem posição e votos desde o início da votação; o parcial continua visível depois que a
 * votação encerra, até a divulgação oficial. Desligada, o item some na próxima releitura (até ~1 min). Só quem pode
 * divulgar resultados (`campaigns_announce`) altera. Some depois da divulgação (aí vale o oficial).
 */
export function PartialRankingSwitch({
  campaignId, enabled, canEdit, onChanged,
}: { campaignId: string; enabled: boolean; canEdit: boolean; onChanged: () => void }) {
  const { busy, run } = useBusy();
  const [value, setValue] = useState(enabled);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => { setValue(enabled); }, [enabled]);

  const apply = async (next: boolean) => {
    setConfirmOpen(false);
    const r = await run(
      "partial", () => campaignsApi.put(`/admin/campaigns/${campaignId}/partial-ranking`, { enabled: next }),
      next ? "Os colaboradores agora veem o ranking parcial." : "Ranking parcial escondido dos colaboradores.",
    );
    if (r.ok) { setValue(next); onChanged(); }
  };

  return (
    <>
      <Card className="rounded-3xl border hover:shadow-none" data-tutorial="camp-results-partial">
        <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Mostrar aos colaboradores</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {value
                ? "Ligado: os colaboradores veem o ranking parcial (posição e votos) desde o início da votação e continuam vendo depois que ela encerra, até você divulgar o resultado oficial."
                : "Desligado: só a gestão vê o ranking. O resultado oficial só aparece depois da divulgação."}
            </p>
            {!canEdit && <p className="mt-1 text-[11px] text-muted-foreground">Só quem pode divulgar resultados altera esta opção.</p>}
          </div>
          <Switch
            checked={value}
            onCheckedChange={(v) => (v ? setConfirmOpen(true) : void apply(false))}
            disabled={!canEdit || busy !== null}
            aria-label="Mostrar o ranking parcial aos colaboradores"
            className={SWITCH_HIT}
          />
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Mostrar o ranking aos colaboradores?"
        description="Eles passam a ver a posição e os votos de cada receita, como parcial (ainda pode mudar), até você divulgar o resultado. Você pode desligar quando quiser."
        confirmLabel="Mostrar aos colaboradores"
        onConfirm={() => void apply(true)}
      />
    </>
  );
}

/** Votos registrados (quem votou em qual receita). Só com a permissão "Ver votos individuais"; carrega ao abrir. */
export function VotesList({
  campaignId, canInvalidate, refreshKey, onChanged,
}: { campaignId: string; canInvalidate: boolean; refreshKey: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<AdminVote | null>(null);
  const { busy, run } = useBusy();
  const base = `/admin/campaigns/${campaignId}`;
  const votes = useLoader<AdminVotesPayload>(
    () => (open
      ? campaignsApi.get<AdminVote[] | AdminVotesPayload>(`${base}/votes`).then((p) => (Array.isArray(p) ? { locked: false, items: p } : p))
      : Promise.resolve({ locked: false, items: [] })),
    [campaignId, open, refreshKey],
  );
  const items = votes.data?.items ?? [];
  const valid = useMemo(() => items.filter((v) => !v.invalidated_at).length, [items]);

  const invalidate = async (reason: string) => {
    const v = target;
    if (!v) return;
    const r = await run("invalidate", () => campaignsApi.post(`${base}/votes/${v.id}/invalidate`, { reason }), "Voto invalidado.");
    if (r.ok) { setTarget(null); votes.reload(); onChanged(); }
  };

  return (
    <Fold
      title="Votos registrados"
      hint="Quem votou em qual receita."
      icon={<Vote size={18} />}
      open={open}
      onOpenChange={setOpen}
      tutorial="camp-vote-votes"
    >
      {votes.loading && !votes.data?.items.length ? (
        <LoadingBox />
      ) : votes.error && !votes.data ? (
        <ErrorBox message={votes.error} onRetry={votes.reload} />
      ) : votes.data?.locked ? (
        <p className="text-sm text-muted-foreground">Os votos individuais aparecem depois do encerramento da votação.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum voto registrado ainda.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{plural(valid, "voto válido", "votos válidos")} de {items.length} registrados.</p>
          <ul className="divide-y divide-border">
            {items.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-medium", v.invalidated_at && "line-through opacity-60")}>{v.voter_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">→ {v.dish_name} · {fmtDateTime(v.created_at)}</span>
                  {v.invalidated_at && (
                    <span className="block text-[11px] text-orange-600 dark:text-orange-300">
                      Invalidado{v.invalidated_by_name ? ` por ${v.invalidated_by_name}` : ""}{v.invalidation_reason ? `: “${v.invalidation_reason}”` : ""}
                    </span>
                  )}
                </span>
                {canInvalidate && !v.invalidated_at && (
                  <Button size="sm" variant="outline" className="shrink-0 rounded-xl" disabled={busy !== null} onClick={() => setTarget(v)}>Invalidar</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReasonDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Invalidar voto"
        description={target ? `Voto de ${target.voter_name} em “${target.dish_name}”. O registro é preservado no histórico e a pessoa NÃO ganha de volta o direito de votar.` : undefined}
        label="Justificativa"
        placeholder="Explique por que o voto é inválido (mínimo de 10 caracteres)"
        minLength={10}
        confirmLabel="Invalidar voto"
        destructive
        pending={busy === "invalidate"}
        onConfirm={invalidate}
      />
    </Fold>
  );
}
