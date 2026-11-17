import { CheckCircle2, Clock, Loader2, MessageSquareWarning, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { fmtDateTime } from "../../lib/campaigns/format";
import type { SubmissionStatus as Status } from "../../lib/campaigns/types";

const TONES = {
  wait: "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/20 dark:text-yellow-100",
  ok: "border-green-200 bg-green-50 text-green-900 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-100",
  bad: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100",
} as const;

/** Situação da receita em palavras simples (uma caixa): Em análise · Aprovada · Reprovada (com o motivo). */
export function SubmissionStatus({
  status,
  submittedAt,
  reviewedAt,
  reason,
  canEdit,
}: {
  status: Status;
  submittedAt: string | null;
  reviewedAt: string | null;
  reason: string | null;
  canEdit?: boolean;
}) {
  const view =
    status === "approved"
      ? { tone: "ok" as const, Icon: CheckCircle2, title: "Aprovada", text: reviewedAt ? `Em ${fmtDateTime(reviewedAt)}` : "A equipe aprovou a sua receita." }
      : status === "rejected"
        ? { tone: "bad" as const, Icon: XCircle, title: "Não aprovada", text: reviewedAt ? `Em ${fmtDateTime(reviewedAt)}` : "" }
        : status === "pending_media"
          ? { tone: "wait" as const, Icon: Loader2, title: "Falta enviar a foto", text: "Termine o envio para a receita entrar na análise." }
          : { tone: "wait" as const, Icon: Clock, title: "Em análise", text: submittedAt ? `Enviada em ${fmtDateTime(submittedAt)}` : "A equipe vai avaliar a sua receita." };

  return (
    <div className="space-y-3" data-tutorial="camp-status">
      <div className={cn("flex items-start gap-3 rounded-2xl border p-4", TONES[view.tone])} role="status">
        <view.Icon size={20} className={cn("mt-0.5 shrink-0", status === "pending_media" && "animate-spin")} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-bold">{view.title}</p>
          {view.text && <p className="text-xs opacity-90">{view.text}</p>}
        </div>
      </div>

      {status === "rejected" && (
        <div data-tutorial="camp-reason" role="note" className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
          <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
            <MessageSquareWarning size={14} aria-hidden="true" /> Motivo
          </p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-red-900 dark:text-red-100">{reason?.trim() || "A equipe não informou um motivo."}</p>
          {canEdit && <p className="mt-2 text-xs text-red-800/80 dark:text-red-200/80">Você pode corrigir e enviar de novo.</p>}
        </div>
      )}
    </div>
  );
}
