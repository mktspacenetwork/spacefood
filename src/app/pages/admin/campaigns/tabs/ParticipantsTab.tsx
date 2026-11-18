import { useMemo, useState } from "react";
import { ChevronRight, Loader2, Search, Trophy, Users } from "lucide-react";
import { ParticipantDetail } from "./ParticipantDetail";
import type { PersonRow } from "./ParticipantDetail";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/input";
import { Progress } from "../../../../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { Sheet, SheetContent } from "../../../../components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { SUBMISSION_STATUS, fmtDate, fmtDateTime, plural } from "../../../../lib/campaigns/format";
import type { AdminParticipant, AdminResults, AdminSubmissionRow, AdminVote, AdminVotesPayload, TallyRow } from "../../../../lib/campaigns/types";
import { CampaignTour } from "../../../../components/campaigns/CampaignTour";
import { ADMIN_TOUR_TABS } from "../../../../lib/campaigns/tours-admin";
import { EmptyBox, ErrorBox, LoadingBox, Notice, ReasonDialog, useBusy, useLoader } from "../shared";
import type { TabProps } from "./types";
import { useTabTour } from "./useTabTour";

/**
 * PARTICIPANTES — o único lugar para ver pessoas, votos recebidos e de quem vieram.
 *  - Uma linha por pessoa (com várias receitas por colaborador, as receitas ficam todas na mesma linha):
 *    receitas, situação, votos recebidos, posição e se já votou.
 *  - Clique na linha: abre o detalhe com "de quem vieram os votos" (e a ação de invalidar).
 *  - Um único filtro: Com receita · Todos os elegíveis · (só com votação) Já votaram · Ainda não votaram.
 * Cada informação sensível só aparece com a permissão correspondente; sem ela a coluna some.
 */

type PartPayload = { with_votes: boolean; items: AdminParticipant[] };
type ResPayload = { results: AdminResults | null; tally: TallyRow[]; tally_locked?: boolean };
type Seg = "all" | "sent" | "voted" | "not_voted";
type SortKey = "auto" | "votes" | "name";

type Row = PersonRow;

const byName = (a: Row, b: Row) => a.p.user_name.localeCompare(b.p.user_name, "pt-BR");

export function ParticipantsTab({ campaignId, campaign, results, stages, perms, onChanged, tourUserId, tourSignal }: TabProps) {
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
  // O servidor devolve { locked, items }; versões antigas devolviam só a lista.
  const votes = useLoader<AdminVotesPayload | null>(
    () => (canVotes
      ? campaignsApi.get<AdminVote[] | AdminVotesPayload>(`${base}/votes`).then((p) => (Array.isArray(p) ? { locked: false, items: p } : p))
      : Promise.resolve(null)),
    [campaignId, canVotes],
  );
  // Só para mostrar o nome do prato também de receitas ainda não aprovadas.
  const subs = useLoader<AdminSubmissionRow[] | null>(
    () => (canSubs ? campaignsApi.get<AdminSubmissionRow[]>(`${base}/submissions`) : Promise.resolve(null)),
    [campaignId, canSubs],
  );
  const { busy, run } = useBusy();
  // A tour desta aba abre sozinha (uma vez) quando a lista já carregou.
  const tour = useTabTour("participants", { tourUserId, tourSignal, ready: !!people.data });

  const [q, setQ] = useState("");
  // null = automático: "Com receita" quando já há receitas; senão "Todos os elegíveis".
  const [segChoice, setSeg] = useState<Seg | null>(null);
  const [sort, setSort] = useState<SortKey>("auto");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invalidateTarget, setInvalidateTarget] = useState<AdminVote | null>(null);

  // A gestão acompanha votos ao vivo (parcial até a divulgação); só vale o bloqueio se o servidor ainda o aplicar
  // (versão antiga da API). `tally_locked` só diz "ainda não é o resultado oficial", não esconde a contagem.
  const votingStage = stages.find((s) => s.stage_key === "voting");
  const locked = hasVoting && !!votes.data?.locked;
  const votingEnds = votingStage?.ends_at ?? null;
  const showVotesCols = canResults && !locked;
  const items = people.data?.items ?? [];
  const withVotes = !!people.data?.with_votes;
  const tally = locked ? [] : res.data?.tally ?? [];
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
    for (const v of votes.data?.items ?? []) {
      const list = m.get(v.submission_id);
      if (list) list.push(v);
      else m.set(v.submission_id, [v]);
    }
    return m;
  }, [votes.data]);

  // O servidor manda uma linha por (pessoa, receita): aqui junta tudo por pessoa.
  const allRows = useMemo<Row[]>(() => {
    const byUser = new Map<string, Row>();
    for (const p of items) {
      let row = byUser.get(p.user_id);
      if (!row) {
        row = { p, recipes: [], votes: null, rank: null };
        byUser.set(p.user_id, row);
      }
      if (!p.submission_id) continue;
      const t = tallyBySub.get(p.submission_id);
      const rank = rankBySub.get(p.submission_id) ?? null;
      row.recipes.push({
        id: p.submission_id,
        status: p.submission_status,
        submittedAt: p.submitted_at,
        dish: dishBySub.get(p.submission_id) ?? t?.dish_name ?? null,
        approved: p.submission_status === "approved",
        votes: t ? t.votes : null,
        rank,
      });
      if (t) row.votes = (row.votes ?? 0) + t.votes;
      if (rank !== null) row.rank = row.rank === null ? rank : Math.min(row.rank, rank);
    }
    return [...byUser.values()];
  }, [items, tallyBySub, dishBySub, rankBySub]);

  const effectiveSort: Exclude<SortKey, "auto"> = sort === "auto" ? (showVotesCols && totalVotes > 0 ? "votes" : "name") : sort;

  const sentCount = allRows.filter((r) => r.recipes.length > 0).length;
  // "Votaram" só existe com votação; sem ela a escolha cai no padrão.
  const seg: Seg = segChoice && (hasVoting || (segChoice !== "voted" && segChoice !== "not_voted")) ? segChoice : sentCount > 0 ? "sent" : "all";

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = allRows.filter((r) => {
      if (t) {
        const hay = `${r.p.user_name} ${r.p.department ?? ""} ${r.p.unit ?? ""} ${r.recipes.map((x) => x.dish ?? "").join(" ")}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      if (seg === "sent") return r.recipes.length > 0;
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
    sent: allRows.filter((r) => r.recipes.length > 0).length,
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

  const filterOptions: { value: Seg; label: string; show: boolean }[] = [
    { value: "sent", label: "Com receita", show: true },
    { value: "all", label: "Todos os elegíveis", show: true },
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
  if (hasVoting && !locked && !canResults) missing.push("a contagem de votos por pessoa precisa da permissão “Ver apuração”");
  if (hasVoting && !locked && !withVotes) missing.push("saber quem votou (e em quem) precisa da permissão “Ver votos individuais”");

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <b className="text-foreground">{sent}</b> de {total} enviaram receita ({pct(sent)}%)
        {showVoted && <> · <b className="text-foreground">{counts.voted}</b> já votaram ({pct(counts.voted)}%)</>}
      </p>

      {/* Busca, ordenação e filtros: uma barra só */}
      <div className="space-y-3" data-tutorial="camp-part-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, departamento, unidade ou prato"
              className="h-10 rounded-xl pl-9"
              aria-label="Buscar participante"
            />
          </div>
          <Select value={seg} onValueChange={(v) => setSeg(v as Seg)}>
            <SelectTrigger className="h-10 w-[12.5rem] rounded-xl" aria-label="Filtrar participantes"><SelectValue /></SelectTrigger>
            <SelectContent>
              {filterOptions.filter((o) => o.show).map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label} ({counts[o.value]})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showVotesCols && (
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-10 w-[10.5rem] rounded-xl" aria-label="Ordenar participantes"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Ordem sugerida</SelectItem>
                <SelectItem value="votes">Mais votos primeiro</SelectItem>
                <SelectItem value="name">Nome (A–Z)</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        {locked && (
          <Notice tone="info">
            Os votos por receita e quem votou em quem aparecem depois do encerramento da votação{votingEnds ? ` (${fmtDate(votingEnds)})` : ""}. Até lá, só a participação.
          </Notice>
        )}
        {missing.length > 0 && <Notice tone="info">Nesta tela, {missing.join("; ")}.</Notice>}
        {(res.error && !res.data) && <Notice tone="warn" title="Não foi possível carregar os votos recebidos">{res.error} <button type="button" className="underline" onClick={res.reload}>Tentar de novo</button></Notice>}
      </div>

      {total === 0 ? (
        <EmptyBox icon={<Users size={36} />} title="Ainda não há pessoas para mostrar." hint="Quando a campanha tiver colaboradores elegíveis e receitas, elas aparecem aqui." />
      ) : rows.length === 0 ? (
        <Card className="rounded-3xl border-dashed p-8 text-center hover:shadow-none">
          <p className="font-medium text-muted-foreground">Nenhuma pessoa encontrada com esse filtro.</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={() => { setQ(""); setSeg("all"); }}>Mostrar todos os elegíveis</Button>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {plural(rows.length, "pessoa", "pessoas")}
            {seg === "sent" && counts.all > counts.sent ? ` · para ver quem ainda não enviou, escolha “Todos os elegíveis”` : ""}
          </p>
          <Card className="overflow-hidden rounded-3xl border hover:shadow-sm" data-tutorial="camp-part-table">
            {/* Celular: uma linha por pessoa, sem tabela larga */}
            <ul className="divide-y divide-border md:hidden">
              {rows.map((r, idx) => (
                <li key={r.p.user_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.p.user_id)}
                    data-tutorial={idx === 0 ? "camp-part-row" : undefined}
                    aria-label={`Ver detalhes de ${r.p.user_name}`}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:bg-accent/40"
                  >
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="block truncate text-sm font-semibold text-foreground">{r.p.user_name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{[r.p.department, r.p.unit].filter(Boolean).join(" · ") || "—"}</span>
                      {r.recipes.length > 0 ? (
                        <span className="block space-y-1">
                          {r.recipes.slice(0, 2).map((rc) => {
                            const st = rc.status ? SUBMISSION_STATUS[rc.status] : null;
                            return (
                              <span key={rc.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="min-w-0 truncate text-sm">{rc.dish ?? "Receita enviada"}</span>
                                {st && <Badge className={cn("border text-[10px]", st.className)}>{st.label}</Badge>}
                              </span>
                            );
                          })}
                          {r.recipes.length > 2 && <span className="block text-[11px] text-muted-foreground">+ {plural(r.recipes.length - 2, "receita", "receitas")}</span>}
                        </span>
                      ) : (
                        <span className="block text-xs text-muted-foreground">Não enviou receita</span>
                      )}
                      {(showVotesCols && r.votes !== null) || showVoted ? (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {showVotesCols && r.votes !== null && <span><b className="text-foreground">{r.votes}</b> {r.votes === 1 ? "voto" : "votos"}{r.rank ? ` · ${r.rank}º` : ""}</span>}
                          {showVoted && <span>{r.p.voted ? "Já votou" : "Ainda não votou"}</span>}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight size={16} className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {/* Tablet e computador: tabela */}
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[40rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Participante</TableHead>
                    <TableHead>Receita</TableHead>
                    {showVotesCols && <TableHead>Votos recebidos</TableHead>}
                    {showVotesCols && <TableHead>Posição</TableHead>}
                    {showVoted && <TableHead>Votou?</TableHead>}
                    <TableHead className="w-8"><span className="sr-only">Detalhes</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => {
                    const open = () => setSelectedId(r.p.user_id);
                    return (
                      <TableRow
                        key={r.p.user_id}
                        data-tutorial={idx === 0 ? "camp-part-row" : undefined}
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
                          {r.recipes.length > 0 ? (
                            <div className="max-w-[16rem] space-y-1.5">
                              {r.recipes.slice(0, 2).map((rc) => {
                                const st = rc.status ? SUBMISSION_STATUS[rc.status] : null;
                                return (
                                  <div key={rc.id} className="space-y-0.5">
                                    <p className="truncate text-sm">{rc.dish ?? "Receita enviada"}</p>
                                    {st && <Badge className={cn("border text-[10px]", st.className)}>{st.label}</Badge>}
                                  </div>
                                );
                              })}
                              {r.recipes.length > 2 && <p className="text-[11px] text-muted-foreground">+ {plural(r.recipes.length - 2, "receita", "receitas")}</p>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Não enviou</span>
                          )}
                        </TableCell>
                        {showVotesCols && (
                          <TableCell>
                            {r.votes !== null ? (
                              <div className="flex min-w-[7rem] items-center gap-2">
                                <b className="w-6 text-right tabular-nums">{r.votes}</b>
                                <Progress value={(r.votes / maxVotes) * 100} className="h-1.5 w-16" aria-label={`${r.votes} votos`} />
                              </div>
                            ) : r.recipes.length > 0 && res.loading && !res.data ? (
                              <Loader2 size={14} className="animate-spin text-muted-foreground" aria-label="Carregando" />
                            ) : (
                              <span className="text-muted-foreground" title={r.recipes.length > 0 ? "Só receitas aprovadas recebem votos" : undefined}>—</span>
                            )}
                          </TableCell>
                        )}
                        {showVotesCols && (
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
              locked={locked}
              votingEnds={votingEnds}
              canResults={showVotesCols}
              canVotes={canVotes}
              canInvalidate={canInvalidate}
              showVoted={showVoted}
              finalized={finalized}
              totalApproved={tally.length}
              maxVotes={maxVotes}
              votesBySub={votesBySub}
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

      <CampaignTour steps={ADMIN_TOUR_TABS.participants} tour={tour} />
    </div>
  );
}
