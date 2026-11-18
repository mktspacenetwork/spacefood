import { Loader2, Trophy } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Progress } from "../../../../components/ui/progress";
import { SheetDescription, SheetHeader, SheetTitle } from "../../../../components/ui/sheet";
import { cn } from "../../../../lib/utils";
import { SUBMISSION_STATUS, fmtDate, fmtDateTime, plural } from "../../../../lib/campaigns/format";
import type { AdminParticipant, AdminVote, SubmissionStatus } from "../../../../lib/campaigns/types";
import { Notice, SectionLabel } from "../shared";

/** Uma receita de uma pessoa (com várias receitas por colaborador, cada pessoa tem uma ou mais). */
export type RecipeRow = {
  id: string;
  status: SubmissionStatus | null;
  submittedAt: string | null;
  dish: string | null;
  approved: boolean;
  votes: number | null;
  rank: number | null;
};

/** Uma pessoa: dados dela + todas as receitas que enviou. Votos e posição somam/escolhem entre as receitas. */
export type PersonRow = {
  p: AdminParticipant;
  recipes: RecipeRow[];
  votes: number | null;
  rank: number | null;
};

type Props = {
  row: PersonRow;
  hasVoting: boolean;
  locked: boolean;
  votingEnds: string | null;
  canResults: boolean;
  canVotes: boolean;
  canInvalidate: boolean;
  showVoted: boolean;
  finalized: boolean;
  totalApproved: number;
  maxVotes: number;
  votesBySub: Map<string, AdminVote[]>;
  votesState: { loading: boolean; error: string | null; reload: () => void };
  busy: boolean;
  onInvalidate: (v: AdminVote) => void;
};

/** Detalhe de uma pessoa: cada receita com seus votos e, com permissão, de quem vieram. */
export function ParticipantDetail(props: Props) {
  const { row, hasVoting, showVoted } = props;
  const { p, recipes } = row;
  return (
    <div className="flex flex-col gap-5 p-5">
      <SheetHeader className="p-0 pr-6">
        <SheetTitle className="text-lg">{p.user_name}</SheetTitle>
        <SheetDescription>{[p.department, p.unit].filter(Boolean).join(" · ") || "Sem departamento informado"}</SheetDescription>
      </SheetHeader>

      {recipes.length === 0 ? (
        <section className="space-y-2">
          <SectionLabel>Receita</SectionLabel>
          <p className="text-sm text-muted-foreground">Esta pessoa ainda não enviou receita.</p>
        </section>
      ) : (
        recipes.map((rc, i) => (
          <RecipeBlock key={rc.id} rc={rc} index={i} many={recipes.length > 1} {...props} />
        ))
      )}

      {/* Voto desta pessoa como eleitora */}
      {showVoted && hasVoting && (
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

function RecipeBlock({
  rc, index, many, hasVoting, locked, votingEnds, canResults, canVotes, canInvalidate, finalized, totalApproved, maxVotes,
  votesBySub, votesState, busy, onInvalidate,
}: Props & { rc: RecipeRow; index: number; many: boolean }) {
  const st = rc.status ? SUBMISSION_STATUS[rc.status] : null;
  const voters = votesBySub.get(rc.id) ?? [];
  const validVotes = voters.filter((v) => !v.invalidated_at).length;

  return (
    <div className={cn("space-y-4", many && "rounded-2xl border p-4")}>
      <section className="space-y-2">
        <SectionLabel>{many ? `Receita ${index + 1}` : "Receita"}</SectionLabel>
        <div className="space-y-1.5">
          <p className="text-base font-bold text-foreground">{rc.dish ?? "Receita enviada"}</p>
          <div className="flex flex-wrap items-center gap-2">
            {st && <Badge className={cn("border text-[10px]", st.className)}>{st.label}</Badge>}
            <span className="text-[11px] text-muted-foreground">Enviada em {fmtDateTime(rc.submittedAt)}</span>
          </div>
        </div>
      </section>

      {/* Votos recebidos (só depois do encerramento da votação) */}
      {hasVoting && locked && (
        <section className="space-y-2">
          <SectionLabel>Votos recebidos</SectionLabel>
          <p className="text-sm text-muted-foreground">
            A contagem e quem votou aparecem depois do encerramento da votação{votingEnds ? ` (${fmtDate(votingEnds)})` : ""}.
          </p>
        </section>
      )}
      {hasVoting && !locked && (
        <section className="space-y-3">
          <SectionLabel>Votos recebidos</SectionLabel>
          {!rc.approved ? (
            <p className="text-sm text-muted-foreground">Só receitas aprovadas entram na votação e recebem votos.</p>
          ) : canResults ? (
            <div className="space-y-2 rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-end justify-between gap-3">
                <p className="text-3xl font-bold tabular-nums text-foreground">
                  {rc.votes ?? 0} <span className="text-sm font-medium text-muted-foreground">{(rc.votes ?? 0) === 1 ? "voto" : "votos"}</span>
                </p>
                {rc.rank && (
                  <p className="flex items-center gap-1 text-sm font-semibold text-foreground">
                    {rc.rank === 1 && <Trophy size={14} className="text-amber-500" aria-hidden="true" />}
                    {rc.rank}º lugar <span className="font-normal text-muted-foreground">de {totalApproved}</span>
                  </p>
                )}
              </div>
              <Progress value={((rc.votes ?? 0) / maxVotes) * 100} className="h-2" aria-label="Votos recebidos" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">A contagem de votos precisa da permissão “Ver apuração”.</p>
          )}
        </section>
      )}

      {/* De quem vieram os votos */}
      {hasVoting && !locked && rc.approved && (
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
    </div>
  );
}
