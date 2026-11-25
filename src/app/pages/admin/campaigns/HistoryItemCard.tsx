import { ArchiveRestore, BarChart3, CalendarDays, ChefHat, Copy, Eye, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { cn } from "../../../lib/utils";
import { fmtDateTime, fmtRange, plural } from "../../../lib/campaigns/format";
import type { AdminHistoryItem, HistoryCategory, HistoryKind, ResultStatus } from "../../../lib/campaigns/types";

// ─────────────────────────────── Rótulos e cores ───────────────────────────────

const GREEN = "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 border-green-200 dark:border-green-800";
const ORANGE = "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-800";
const RED = "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-800";
const PURPLE = "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800";
const YELLOW = "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800";
const GRAY = "bg-muted text-muted-foreground border-border";

/** Cor do selo = categoria (Concluídas verde · Desativadas laranja · Excluídas vermelho); o texto diz o tipo exato. */
const CATEGORY_CLASS: Record<HistoryCategory, string> = { completed: GREEN, disabled: ORANGE, deleted: RED };

export const KIND_LABEL: Record<HistoryKind, string> = {
  closed: "Encerrada", archived: "Arquivada", ended: "Fim do período", suspended: "Desativada", deleted: "Excluída",
};
/** Início da frase "… em 12/11/2026 às 10:30 · por Fulano". */
const KIND_SINCE: Record<HistoryKind, string> = {
  closed: "Encerrada", archived: "Arquivada", ended: "Período encerrado", suspended: "Desativada", deleted: "Excluída",
};
const PRIOR_LABEL: Record<NonNullable<AdminHistoryItem["prior"]>, string> = {
  closed: "Encerrada", archived: "Arquivada", ended: "Fim do período", suspended: "Desativada", draft: "Rascunho", active: "No ar",
};

/** Só para campanhas com votação. "Sem resultado divulgado" cobre apuração em andamento e votação encerrada sem divulgar. */
const RESULT_CHIP: Record<ResultStatus, { label: string; className: string }> = {
  none: { label: "Sem resultado divulgado", className: GRAY },
  preliminary: { label: "Sem resultado divulgado", className: GRAY },
  tie_pending: { label: "Empate pendente", className: ORANGE },
  confirmed: { label: "Ganhador definido", className: YELLOW },
  announced: { label: "Resultado divulgado", className: PURPLE },
};

/** Datas da campanha em uma ou duas linhas curtas ("Participação e votação: 17 nov → 20 nov"). */
function periodLines(it: AdminHistoryItem): string[] {
  const reg = it.stages.find((s) => s.stage_key === "registration");
  const vot = it.has_voting ? it.stages.find((s) => s.stage_key === "voting") : undefined;
  const r = reg && (reg.starts_at || reg.ends_at) ? fmtRange(reg.starts_at, reg.ends_at) : null;
  const v = vot && (vot.starts_at || vot.ends_at) ? fmtRange(vot.starts_at, vot.ends_at) : null;
  if (!r && !v) return ["Sem datas"];
  if (r && v && r === v) return [`Participação e votação: ${r}`];
  const out: string[] = [];
  if (r) out.push(`Participação: ${r}`);
  if (v) out.push(`Votação: ${v}`);
  return out;
}

/** "Encerrada em 12/11/2026 às 10:30 · por Fulano" (ou "· automático" quando não houve administrador). */
function sinceLine(it: AdminHistoryItem): string {
  const when = it.since ? `${KIND_SINCE[it.kind]} em ${fmtDateTime(it.since)}` : `${KIND_SINCE[it.kind]} (data não registrada)`;
  return `${when} · ${it.by_name ? `por ${it.by_name}` : "automático"}`;
}

// ─────────────────────────────────────── Cartão ───────────────────────────────────────

export type HistoryItemCardProps = {
  item: AdminHistoryItem;
  canReactivate: boolean;
  canRestore: boolean;
  canDuplicate: boolean;
  /**
   * Pode excluir (permissão `campaigns_edit`; o servidor confere de novo). O botão aparece em TODAS as situações do Histórico:
   * Concluída e Desativada = "Excluir" (a campanha vai para Excluídas); Excluída = "Remover do histórico" (deixa de aparecer; nada é apagado).
   */
  canDelete: boolean;
  /** Alguma ação está em andamento: trava os botões para não repetir. */
  busy: boolean;
  /** Ação em andamento deste cartão ("reactivate" | "restore"), para o botão mostrar o spinner. */
  busyKey: string | null;
  onOpen: () => void;
  onReports: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRestorable: () => void;
  /** Primeiro cartão da lista: leva os alvos (`data-tutorial`) da tour da tela. */
  tutorial?: boolean;
};

export function HistoryItemCard(p: HistoryItemCardProps) {
  const { item: it } = p;
  const result = it.has_voting ? RESULT_CHIP[it.result_status] : null;
  const lines = periodLines(it);
  const counts = it.has_voting
    ? `${plural(it.submissions, "receita", "receitas")} · ${plural(it.votes, "voto", "votos")}`
    : plural(it.submissions, "receita", "receitas");
  const showRestore = (it.restorable === "reactivate" && p.canReactivate) || (it.restorable === "restore" && p.canRestore);
  const restoreLabel = it.restorable === "reactivate" ? "Reativar" : "Restaurar";
  const RestoreIcon = it.restorable === "reactivate" ? Eye : ArchiveRestore;
  const spinning = p.busyKey === `${it.restorable}:${it.id}`;

  return (
    <Card className="h-full rounded-3xl border" data-history-card={it.id} data-tutorial={p.tutorial ? "camp-history-card" : undefined}>
      <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn("shrink-0 gap-1.5 border px-2.5 py-0.5 text-xs font-semibold", CATEGORY_CLASS[it.category])}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              {KIND_LABEL[it.kind]}
            </Badge>
            {result && (
              <Badge className={cn("shrink-0 border px-2 py-0.5 text-[11px] font-medium", result.className)}>{result.label}</Badge>
            )}
          </div>
          <button
            type="button"
            onClick={p.onOpen}
            title={it.name}
            className="-my-3 block w-full py-3 text-left text-base font-semibold leading-snug text-foreground transition-colors hover:text-primary focus:outline-none focus-visible:text-primary focus-visible:underline"
          >
            <span className="break-words">{it.name}</span>
          </button>
          <p className="text-[13px] text-muted-foreground">{sinceLine(it)}</p>
          {it.reason && (
            <p className="line-clamp-2 break-words text-[13px] italic text-muted-foreground" title={it.reason}>
              Motivo: {it.reason}
            </p>
          )}
        </div>

        <div className="space-y-1.5 text-[13px] text-foreground/90">
          <p className="flex items-start gap-2">
            <CalendarDays size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0">
              {lines.map((l) => (
                <span key={l} className="block">{l}</span>
              ))}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <ChefHat size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>{counts}</span>
          </p>
          {it.category === "deleted" && it.prior && (
            <p className="text-muted-foreground">Antes: {PRIOR_LABEL[it.prior]}</p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-1" data-tutorial={p.tutorial ? "camp-history-actions" : undefined}>
          {showRestore && (
            <Button className="h-11 gap-2 rounded-xl px-4" onClick={p.onRestorable} disabled={p.busy}>
              {spinning ? <Loader2 size={15} className="animate-spin" /> : <RestoreIcon size={15} aria-hidden="true" />}
              {restoreLabel}
            </Button>
          )}
          <Button variant="outline" className="h-11 gap-2 rounded-xl px-4" onClick={p.onOpen}>
            <FolderOpen size={15} aria-hidden="true" /> Abrir
          </Button>
          <Button variant="outline" className="h-11 gap-2 rounded-xl px-4" onClick={p.onReports}>
            <BarChart3 size={15} aria-hidden="true" /> Relatórios
          </Button>
          {p.canDuplicate && (
            <Button variant="outline" className="h-11 gap-2 rounded-xl px-4" onClick={p.onDuplicate} disabled={p.busy}>
              <Copy size={15} aria-hidden="true" /> Duplicar
            </Button>
          )}
          {p.canDelete && (
            <Button
              variant="outline"
              className="h-11 gap-2 rounded-xl border-destructive/40 px-4 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={p.onDelete}
              disabled={p.busy}
            >
              <Trash2 size={15} aria-hidden="true" /> {it.kind === "deleted" ? "Remover do histórico" : "Excluir"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
