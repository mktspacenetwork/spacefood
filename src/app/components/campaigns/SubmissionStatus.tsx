import { Check, X, Clock, Loader2, MessageSquareWarning } from "lucide-react";
import { Badge } from "../ui/Badge";
import { cn } from "../../lib/utils";
import { fmtDateTime, SUBMISSION_STATUS } from "../../lib/campaigns/format";
import type { SubmissionStatus as Status } from "../../lib/campaigns/types";

type StepState = "done" | "active" | "upcoming" | "rejected";

/** Linha do tempo da receita (Enviada → Em análise → Aprovada/Reprovada) + justificativa da reprovação. */
export function SubmissionStatus({
  status,
  submittedAt,
  reviewedAt,
  reason,
}: {
  status: Status;
  submittedAt: string | null;
  reviewedAt: string | null;
  reason: string | null;
}) {
  const cfg = SUBMISSION_STATUS[status];
  const decided = status === "approved" || status === "rejected";

  const steps: { label: string; detail: string; state: StepState }[] = [
    {
      label: status === "pending_media" ? "Enviando mídia" : "Enviada",
      detail: status === "pending_media" ? "Falta concluir o envio das fotos e do vídeo." : submittedAt ? fmtDateTime(submittedAt) : "—",
      state: status === "pending_media" ? "active" : "done",
    },
    {
      label: "Em análise",
      detail: decided ? "Análise concluída" : status === "pending_media" ? "Começa depois do envio" : "A equipe está avaliando a sua receita",
      state: decided ? "done" : status === "pending_media" ? "upcoming" : "active",
    },
    status === "approved"
      ? { label: "Aprovada", detail: reviewedAt ? fmtDateTime(reviewedAt) : "—", state: "done" }
      : status === "rejected"
        ? { label: "Reprovada", detail: reviewedAt ? fmtDateTime(reviewedAt) : "—", state: "rejected" }
        : { label: "Aprovada ou reprovada", detail: "Você será avisado(a) da decisão", state: "upcoming" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status da receita</p>
        <Badge className={cn("border text-[11px] font-semibold", cfg.className)}>{cfg.label}</Badge>
      </div>

      <ol className="space-y-0" data-tutorial="camp-status" aria-label="Andamento da análise">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0" aria-current={s.state === "active" ? "step" : undefined}>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className={cn("absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5", s.state === "done" ? "bg-primary/40" : "bg-border")} />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
                s.state === "done" && "border-green-500 bg-green-500 text-white",
                s.state === "active" && "border-primary bg-primary/10 text-primary ring-4 ring-primary/15",
                s.state === "rejected" && "border-red-500 bg-red-500 text-white",
                s.state === "upcoming" && "border-border bg-card text-muted-foreground",
              )}
            >
              {s.state === "done" && <Check size={14} strokeWidth={3} />}
              {s.state === "rejected" && <X size={14} strokeWidth={3} />}
              {s.state === "active" && (status === "pending_media" ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />)}
              {s.state === "upcoming" && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={cn("text-sm font-bold", s.state === "upcoming" ? "text-muted-foreground" : "text-foreground")}>{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {status === "rejected" && (
        <div
          data-tutorial="camp-reason"
          role="note"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20"
        >
          <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
            <MessageSquareWarning size={14} aria-hidden="true" />
            Motivo da reprovação
          </p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-red-900 dark:text-red-100">
            {reason?.trim() || "A equipe não informou um motivo."}
          </p>
        </div>
      )}
    </div>
  );
}
