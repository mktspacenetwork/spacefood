import { useMemo, useState } from "react";
import { ChevronRight, Loader2, Search, Trophy, Users } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/input";
import { Progress } from "../../../../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../../../components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { SUBMISSION_STATUS, fmtDateTime, plural } from "../../../../lib/campaigns/format";
import type { AdminParticipant, AdminResults, AdminSubmissionRow, AdminVote, TallyRow } from "../../../../lib/campaigns/types";
import { EmptyBox, ErrorBox, LoadingBox, Notice, ReasonDialog, SectionLabel, useBusy, useLoader } from "../shared";
import type { TabProps } from "./types";

/**
 * PARTICIPANTES — o único lugar para ver pessoas, votos recebidos e de quem vieram.
 *  - Uma linha por pessoa: receita, situação, votos recebidos, posição e se já votou.
 *  - Clique na linha: abre o detalhe com "de quem vieram os votos" (e a ação de invalidar).
 * Cada informação sensível só aparece com a permissão correspondente; sem ela a coluna some.
 */

type PartPayload = { with_votes: boolean; items: AdminParticipant[] };
type ResPayload = { results: AdminResults | null; tally: TallyRow[] };
type Seg = "all" | "sent" | "not_sent" | "approved" | "voted" | "not_voted";
type SortKey = "auto" | "votes" | "name";

type Row = {
  p: AdminParticipant;
  dish: string | null;
  approved: boolean;
  votes: number | null;
  rank: number | null;
};

const byName = (a: Row, b: Row) => a.p.user_name.localeCompare(b.p.user_name, "pt-BR");

export function ParticipantsTab({ campaignId, campaign, results, perms, onChanged }: TabProps) {
  const hasVoting = !!campaign.features.voting;
  const canResults = hasVoting && !!perms.campaigns_results;
  const canVotes = hasVoting && !!perms.campaigns_votes_view;
  const canInvalidate = canVotes && !!perms.campaigns_votes_invalidate;
  const canSubs = !!perms.campaigns_review;
  const base = `/admin/campaigns/${campaignId}`;

  const people = useLoader<PartPayload>(() => campaignsApi.get(`${base}/participants`), [campaignId]);
  const res = useLoader<ResPayload | null>(
    () => (canResults ? campaignsApi.get<ResPayload>(`${base}/results`) : Promise.resolve(null)),
    [campaignId, canResults],
  );
  const votes = useLoader<AdminVote[] | null>(
    () => (canVotes ? campaignsApi.get<AdminVote[]>(`${base}/votes`) : Promise.resolve(null)),
    [campaignId, canVotes],
  );
  // Só para mostrar o nome do prato também de receitas ainda não aprovadas.
  const subs = useLoader<AdminSubmissionRow[] | null>(
    () => (canSubs ? campaignsApi.get<AdminSubmissionRow[]>(`${base}/submissions`) : Promise.resolve(null)),
    [campaignId, canSubs],
  );
  const { busy, run } = useBusy();

  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<Seg>("all");
  const [sort, setSort] = useState<SortKey>("auto");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invalidateTarget, setInvalidateTarget] = useState<AdminVote | null>(null);

  const items = people.data?.items ?? [];
  const withVotes = !!people.data?.with_votes;
  const tally = res.data?.tally ?? [];
  const totalVotes = tally.reduce((acc, t) => acc + t.votes, 0);
  const maxVotes = Math.max(1, ...tally.map((t) => t.votes));
  const resultsStatus = results?.status ?? res.data?.results?.status ?? "none";
  const finalized = resultsStatus === "confirmed" || resultsStatus === "announced";

  const tallyBySub = useMemo(() => new Map(tally.map((t) => [t.submission_id, t])), [tally]);
  const dishBySub = useMemo(() => new Map((subs.data ?? []).map((s) => [s.id, s.dish_name])), [subs.data]);
  // Posição "de competição": receitas com o mesmo número de votos dividem a posição.
  const rankBySub = useMemo(() => {
    const m = new Map<string, number>();
    if (totalVotes > 0) for (const t of tally) m.set(t.submission_id, 1 + tally.filter((x) => x.votes > t.votes).length);
    return m;
  }, [tally, totalVotes]);
  const votesBySub = useMemo(() => {
    const m = new Map<string, AdminVote[]>();
    for (const v of votes.data ?? []) {
      const list = m.get(v.submission_id);
      if (list) list.push(v);
      else m.set(v.submission_id, [v]);
    }
    return m;
  }, [votes.data]);

  const allRows = useMemo<Row[]>(
    () =>
      items.map((p) => {
        const t = p.submission_id ? tallyBySub.get(p.submission_id) : undefined;
        return {
          p,
          dish: (p.submission_id ? dishBySub.get(p.submission_id) : undefined) ?? t?.dish_name ?? null,
          approved: p.submission_status === "approved",
          votes: t ? t.votes : null,
          rank: p.submission_id ? rankBySub.get(p.submission_id) ?? null : null,
        };
      }),
    [items, tallyBySub, dishBySub, rankBySub],
  );

  const effectiveSort: Exclude<SortKey, "auto"> = sort === "auto" ? (canResults && totalVotes > 0 ? "votes" : "name") : sort;

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = allRows.filter((r) => {
      if (t) {
        const hay = `${r.p.user_name} ${r.p.department ?? ""} ${r.p.unit ?? ""} ${r.dish ?? ""}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      if (seg === "sent") return !!r.p.submission_id;
      if (seg === "not_sent") return !r.p.submission_id;
      if (seg === "approved") return r.approved;
      if (seg === "voted") return r.p.voted === true;
      if (seg === "not_voted") return r.p.voted === false;
      return true;
    });
    if (effectiveSort === "votes") {
      list.sort((a, b) => {
        if (a.votes === null && b.votes === null) return byName(a, b);
        if (a.votes === null) return 1;
        if (b.votes === null) return -1;
        return b.votes - a.votes || byName(a, b);
      });
    } else {
      list.sort(byName);
    }
    return list;
  }, [allRows, q, seg, effectiveSort]);

  const counts = useMemo(() => ({
    all: allRows.length,
    sent: allRows.filter((r) => r.p.submission_id).length,
    not_sent: allRows.filter((r) => !r.p.submission_id).length,
    approved: allRows.filter((r) => r.approved).length,
    voted: allRows.filter((r) => r.p.voted === true).length,
    not_voted: allRows.filter((r) => r.p.voted === false).length,
  }), [allRows]);

  if (people.loading && !people.data) return <LoadingBox />;
  if (people.error && !people.data) return <ErrorBox message={people.error} onRetry={people.reload} />;

  const total = allRows.length;
  const sent = counts.sent;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const showVoted = withVotes && hasVoting;
  const selectedRow = selectedId ? allRows.find((r) => r.p.user_id === selectedId) ?? null : null;
  const approvedCount = allRows.filter((r) => r.approved).length;

  const chips: { value: Seg; label: string; show: boolean }[] = [
    { value: "all", label: "Todos", show: true },
    { value: "sent", label: "Com receita", show: true },
    { value: "not_sent", label: "Sem receita", show: true },
    { value: "approved", label: "Aprovadas", show: hasVoting },
    { value: "voted", label: "Já votaram", show: showVoted },
    { value: "not_voted", label: "Ainda não votaram", show: showVoted },
  ];

  const invalidate = async (reason: string) => {
    const v = invalidateTarget;
    if (!v) return;
    const r = await run("invalidate", () => campaignsApi.post(`${base}/votes/${v.id}/invalidate`, { reason }), "Voto invalidado.");
    if (r.ok) {
      setInvalidateTarget(null);
      votes.reload();
      res.reload();
      onChanged();
    }
  };

  const missing: string[] = [];
  if (hasVoting && !canResults) missing.push("a contagem de votos por pessoa precisa da permissão “Ver apuração”");
  if (hasVoting && !withVotes) missing.push("saber quem votou (e em quem) precisa da permissão “Ver votos individuais”");

  return (
    <div className="space-y-4">
      {/* Faixa-resumo: poucos números, os que importam para a participação */}
      <Card className="rounded-3xl border hover:shadow-sm">
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <StripItem label="Pessoas na campanha" value={total} />
          <StripItem label="Enviaram receita" value={sent} hint={`${pct(sent)}% de participação`} />
          <StripItem label="Sem receita" value={counts.not_sent} />
          {showVoted && <StripItem label="Já votaram" value={counts.voted} hint={`${counts.voted} de ${total} (${pct(counts.voted)}%)`} />}
          {hasVoting && !showVoted && <StripItem label="Receitas aprovadas" value={approvedCount} />}
        </div>
      </Card>

      {/* Busca, filtros e ordenação */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={cn("relative", canResults ? "sm:col-span-2" : "sm:col-span-3")}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, departamento, unidade ou prato"
              className="h-10 rounded-xl pl-9"
              aria-label="Buscar participante"
            />
          </div>
          {canResults && (
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-10 rounded-xl" aria-label="Ordenar participantes"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Ordem sugerida</SelectItem>
                <SelectItem value="votes">Mais votos primeiro</SelectItem>
                <SelectItem value="name">Nome (A–Z)</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar participantes">
          {chips.filter((c) => c.show).map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setSeg(c.value)}
              aria-pressed={seg === c.value}
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                seg === c.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {c.label} <span className="tabular-nums opacity-80">({counts[c.value]})</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Clique em uma pessoa para ver a receita dela{hasVoting ? ", quantos votos recebeu e de quem vieram" : ""}.
        </p>
        {missing.length > 0 && <Notice tone="info">Nesta tela, {missing.join("; ")}.</Notice>}
        {(res.error && !res.data) && <Notice tone="warn" title="Não foi possível carregar os votos recebidos">{res.error} <button type="button" className="underline" onClick={res.reload}>Tentar de novo</button></Notice>}
      </div>

      {total === 0 ? (
        <EmptyBox icon={<Users size={36} />} title="Ainda não há pessoas para mostrar." hint="Quando a campanha tiver colaboradores elegíveis e receitas, elas aparecem aqui." />
      ) : rows.length === 0 ? (
        <Card className="rounded-3xl border-dashed p-8 text-center hover:shadow-none">
          <p className="font-medium text-muted-foreground">Nenhuma pessoa encontrada com esse filtro.</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={() => { setQ(""); setSeg("all"); }}>Limpar filtros</Button>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{plural(rows.length, "pessoa", "pessoas")}</p>
          <Card className="overflow-hidden rounded-3xl border hover:shadow-sm">
            <div className="overflow-x-auto">
              <Table className="min-w-[40rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Participante</TableHead>
                    <TableHead>Receita</TableHead>
                    {canResults && <TableHead>Votos recebidos</TableHead>}
                    {canResults && <TableHead>Posição</TableHead>}
                    {showVoted && <TableHead>Votou?</TableHead>}
                    <TableHead className="w-8"><span className="sr-only">Detalhes</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const st = r.p.submission_status ? SUBMISSION_STATUS[r.p.submission_status] : null;
                    const open = () => setSelectedId(r.p.user_id);
                    return (
                      <TableRow
                        key={r.p.user_id}
                        tabIndex={0}
                        onClick={open}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
                        aria-label={`Ver detalhes de ${r.p.user_name}`}
                        className="cursor-pointer hover:bg-accent/40 focus:bg-accent/40 focus:outline-none"
                      >
                        <TableCell className="px-4">
                          <p className="font-medium text-foreground">{r.p.user_name}</p>
                          <p className="text-[11px] text-muted-foreground">{[r.p.department, r.p.unit].filter(Boolean).join(" · ") || "—"}</p>
                        </TableCell>
                        <TableCell>
                          {r.p.submission_id ? (
                            <div className="max-w-[16rem] space-y-1">
                              <p className="truncate text-sm">{r.dish ?? "Receita enviada"}</p>
                              {st && <Badge className={cn("border text-[10px]", st.className)}>{st.label}</Badge>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Não enviou</span>
                          )}
                        </TableCell>
                        {canResults && (
                          <TableCell>
                            {r.votes !== null ? (
                              <div className="flex min-w-[7rem] items-center gap-2">
                                <b className="w-6 text-right tabular-nums">{r.votes}</b>
                                <Progress value={(r.votes / maxVotes) * 100} className="h-1.5 w-16" aria-label={`${r.votes} votos`} />
                              </div>
                            ) : r.p.submission_id && res.loading && !res.data ? (
                              <Loader2 size={14} className="animate-spin text-muted-foreground" aria-label="Carregando" />
                            ) : (
                              <span className="text-muted-foreground" title={r.p.submission_id ? "Só receitas aprovadas recebem votos" : undefined}>—</span>
                            )}
                          </TableCell>
                        )}
                        {canResults && (
                          <TableCell className="text-sm tabular-nums">
                            {r.rank ? <span className="inline-flex items-center gap-1">{r.rank === 1 && <Trophy size={12} className="text-amber-500" aria-hidden="true" />}{r.rank}º</span> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        )}
                        {showVoted && (
                          <TableCell className="text-xs">
                            {r.p.voted ? <span title={fmtDateTime(r.p.voted_at)}>Sim</span> : <span className="text-muted-foreground">Não</span>}
                          </TableCell>
                        )}
                        <TableCell className="w-8 pr-3 text-muted-foreground"><ChevronRight size={16} aria-hidden="true" /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      <Sheet open={!!selectedRow} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
          {selectedRow && (
            <ParticipantDetail
              row={selectedRow}
              hasVoting={hasVoting}
              canResults={canResults}
              canVotes={canVotes}
              canInvalidate={canInvalidate}
              showVoted={showVoted}
              finalized={finalized}
              totalApproved={tally.length}
              maxVotes={maxVotes}
              voters={selectedRow.p.submission_id ? votesBySub.get(selectedRow.p.submission_id) ?? [] : []}
              votesState={{ loading: votes.loading && !votes.data, error: votes.data ? null : votes.error, reload: votes.reload }}
              busy={busy !== null}
              onInvalidate={setInvalidateTarget}
            />
          )}
        </SheetContent>
      </Sheet>

      <ReasonDialog
        open={!!invalidateTarget}
        onOpenChange={(o) => !o && setInvalidateTarget(null)}
        title="Invalidar voto"
        description={
          invalidateTarget
            ? `Voto de ${invalidateTarget.voter_name} em “${invalidateTarget.dish_name}”. O registro é preservado no histórico e a pessoa NÃO ganha de volta o direito de votar.`
            : undefined
        }
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

function StripItem({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums text-foreground">{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

// ─────────────────────────────── Detalhe da pessoa ───────────────────────────────

function ParticipantDetail({
  row, hasVoting, canResults, canVotes, canInvalidate, showVoted, finalized, totalApproved, maxVotes, voters, votesState, busy, onInvalidate,
}: {
  row: Row;
  hasVoting: boolean;
  canResults: boolean;
  canVotes: boolean;
  canInvalidate: boolean;
  showVoted: boolean;
  finalized: boolean;
  totalApproved: number;
  maxVotes: number;
  voters: AdminVote[];
  votesState: { loading: boolean; error: string | null; reload: () => void };
  busy: boolean;
  onInvalidate: (v: AdminVote) => void;
}) {
  const { p } = row;
  const st = p.submission_status ? SUBMISSION_STATUS[p.submission_status] : null;
  const validVotes = voters.filter((v) => !v.invalidated_at).length;

  return (
    <div className="flex flex-col gap-5 p-5">
      <SheetHeader className="p-0 pr-6">
        <SheetTitle className="text-lg">{p.user_name}</SheetTitle>
        <SheetDescription>{[p.department, p.unit].filter(Boolean).join(" · ") || "Sem departamento informado"}</SheetDescription>
      </SheetHeader>

      {/* Receita */}
      <section className="space-y-2">
        <SectionLabel>Receita</SectionLabel>
        {p.submission_id ? (
          <div className="space-y-1.5">
            <p className="text-base font-bold text-foreground">{row.dish ?? "Receita enviada"}</p>
            <div className="flex flex-wrap items-center gap-2">
              {st && <Badge className={cn("border text-[10px]", st.className)}>{st.label}</Badge>}
              <span className="text-[11px] text-muted-foreground">Enviada em {fmtDateTime(p.submitted_at)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Esta pessoa ainda não enviou receita.</p>
        )}
      </section>

      {/* Votos recebidos */}
      {hasVoting && p.submission_id && (
        <section className="space-y-3">
          <SectionLabel>Votos recebidos</SectionLabel>
          {!row.approved ? (
            <p className="text-sm text-muted-foreground">Só receitas aprovadas entram na votação e recebem votos.</p>
          ) : canResults ? (
            <div className="space-y-2 rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-end justify-between gap-3">
                <p className="text-3xl font-bold tabular-nums text-foreground">
                  {row.votes ?? 0} <span className="text-sm font-medium text-muted-foreground">{(row.votes ?? 0) === 1 ? "voto" : "votos"}</span>
                </p>
                {row.rank && (
                  <p className="flex items-center gap-1 text-sm font-semibold text-foreground">
                    {row.rank === 1 && <Trophy size={14} className="text-amber-500" aria-hidden="true" />}
                    {row.rank}º lugar <span className="font-normal text-muted-foreground">de {totalApproved}</span>
                  </p>
                )}
              </div>
              <Progress value={((row.votes ?? 0) / maxVotes) * 100} className="h-2" aria-label="Votos recebidos" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">A contagem de votos precisa da permissão “Ver apuração”.</p>
          )}
        </section>
      )}

      {/* De quem vieram os votos */}
      {hasVoting && p.submission_id && row.approved && (
        <section className="space-y-3">
          <SectionLabel>De quem vieram os votos</SectionLabel>
          {!canVotes ? (
            <Notice tone="info">
              Quem votou em cada receita é um dado sensível e só aparece para quem tem a permissão “Ver votos individuais”. A contagem de votos continua visível.
            </Notice>
          ) : votesState.loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Carregando votos...</p>
          ) : votesState.error ? (
            <Notice tone="warn" title="Não foi possível carregar os votos">
              {votesState.error} <button type="button" className="underline" onClick={votesState.reload}>Tentar de novo</button>
            </Notice>
          ) : voters.length === 0 ? (
            <p className="text-sm text-muted-foreground">Esta receita ainda não recebeu votos.</p>
          ) : (
            <>
              <ul className="divide-y rounded-2xl border">
                {voters.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{v.voter_name}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtDateTime(v.created_at)}</p>
                      {v.invalidated_at && (
                        <p className="text-[11px] text-destructive">
                          Invalidado{v.invalidated_by_name ? ` por ${v.invalidated_by_name}` : ""}
                          {v.invalidation_reason ? ` — “${v.invalidation_reason}”` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge className={cn("border text-[10px]", v.invalidated_at
                        ? "border-red-200 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                        : "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300")}>
                        {v.invalidated_at ? "Invalidado" : "Válido"}
                      </Badge>
                      {canInvalidate && !v.invalidated_at && !finalized && (
                        <Button size="sm" variant="ghost" className="h-7 rounded-xl px-2 text-xs text-destructive hover:text-destructive" onClick={() => onInvalidate(v)} disabled={busy}>
                          Invalidar
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                {plural(validVotes, "voto válido", "votos válidos")}. Invalidar preserva o registro e não devolve o direito de votar à pessoa.
                {finalized ? " O vencedor já foi confirmado: não é mais possível invalidar votos." : ""}
              </p>
            </>
          )}
        </section>
      )}

      {/* Voto desta pessoa como eleitora */}
      {showVoted && (
        <section className="space-y-2">
          <SectionLabel>Participação como eleitor(a)</SectionLabel>
          <p className="text-sm text-foreground">
            {p.voted ? <>Já votou em {fmtDateTime(p.voted_at)}.</> : <span className="text-muted-foreground">Ainda não votou.</span>}
          </p>
        </section>
      )}
    </div>
  );
}
