import { useMemo, useState } from "react";
import { ChevronDown, History as HistoryIcon, Search } from "lucide-react";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/input";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { AUDIT_ACTION, CAMPAIGN_STATUS, RESULT_STATUS, SUBMISSION_STATUS, fmtDateTime } from "../../../../lib/campaigns/format";
import type { AdminAuditRow } from "../../../../lib/campaigns/types";
import { EmptyBox, ErrorBox, LoadingBox, useLoader } from "../shared";
import type { TabProps } from "./types";

// ── Resumo legível do antes/depois (nunca despeja JSON cru) ──
const FIELD: Record<string, string> = {
  status: "Situação", name: "Nome", description: "Descrição", objective: "Objetivo", instructions: "Orientações",
  visible_from: "Visível a partir de", starts_at: "Início", ends_at: "Fim", paused: "Pausada", suspended: "Não publicada",
  dish_name: "Prato", ingredients: "Ingredientes", preparation: "Modo de preparo", rejection_reason: "Justificativa",
  enabled: "Ligado", invalidated: "Invalidado", votes: "Votos", total_valid_votes: "Votos válidos", top_votes: "Votos do mais votado",
  tie: "Empate", count: "Quantidade", media_changed: "Mídia alterada", media: "Mídias", rows: "Linhas", eligible_count: "Elegíveis",
  cover_path: "Capa", audience: "Público", features: "Funcionalidades", visibility: "Visibilidade", media_limits: "Limites de mídia",
  winner: "Receita vencedora", winner_submission_id: "Receita vencedora", candidates: "Receitas empatadas", slug: "Endereço",
  authorized_at: "Publicada em", closed_at: "Encerrada em", archived_at: "Arquivada em", suspended_at: "Despublicada em",
};
// Mesmo vocabulário da tela: "Suspender/Retomar" viraram "Despublicar/Republicar" (o registro antigo continua legível).
const ACTION_LABEL: Record<string, string> = {
  ...AUDIT_ACTION,
  SUSPEND_CAMPAIGN: "Campanha despublicada",
  RESUME_CAMPAIGN: "Campanha republicada",
};
const IGNORE = new Set([
  "id", "version", "updated_at", "updated_by", "created_at", "created_by", "created_by_name", "type", "edit_locked_at",
  "authorized_by", "suspended_by", "source_campaign_id", "content_version", "options",
]);
const STATUS_ALL: Record<string, string> = {
  ...Object.fromEntries(Object.entries(CAMPAIGN_STATUS).map(([k, v]) => [k, v.label])),
  ...Object.fromEntries(Object.entries(SUBMISSION_STATUS).map(([k, v]) => [k, v.label])),
  ...Object.fromEntries(Object.entries(RESULT_STATUS).map(([k, v]) => [k, v.label])),
};
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

function fmtVal(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (ISO.test(v)) return fmtDateTime(v);
    if (key === "status" && STATUS_ALL[v]) return STATUS_ALL[v];
    return v.length > 160 ? `${v.slice(0, 160)}…` : v;
  }
  if (Array.isArray(v)) return `${v.length} item(ns)`;
  return "alterado";
}

function summarize(before: unknown, after: unknown): string[] {
  const b = (before && typeof before === "object" ? before : null) as Record<string, unknown> | null;
  const a = (after && typeof after === "object" ? after : null) as Record<string, unknown> | null;
  const lines: string[] = [];
  const keys = new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})]);
  for (const k of keys) {
    if (IGNORE.has(k)) continue;
    const bv = b?.[k], av = a?.[k];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    const label = FIELD[k] ?? k;
    const isObj = (x: unknown) => x !== null && typeof x === "object";
    if (isObj(bv) || isObj(av)) {
      if (Array.isArray(av) && av.length && av.every((x) => typeof x === "string" && UUID.test(x))) continue;
      lines.push(`${label}: alterado`);
    } else if (typeof av === "string" && UUID.test(av) && !b) {
      continue;
    } else if (b && a) {
      lines.push(`${label}: ${fmtVal(k, bv)} → ${fmtVal(k, av)}`);
    } else if (a) {
      lines.push(`${label}: ${fmtVal(k, av)}`);
    } else if (b) {
      lines.push(`${label}: ${fmtVal(k, bv)} (removido)`);
    }
  }
  return lines.slice(0, 12);
}

export function HistoryTab({ campaignId }: TabProps) {
  const { data, loading, error, reload } = useLoader<AdminAuditRow[]>(
    () => campaignsApi.get(`/admin/campaigns/${campaignId}/audit`),
    [campaignId],
  );
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter(
      (r) => !t || (ACTION_LABEL[r.action] ?? r.action).toLowerCase().includes(t) || (r.actor_name ?? "").toLowerCase().includes(t) || (r.reason ?? "").toLowerCase().includes(t),
    );
  }, [data, q]);

  if (loading && !data) return <LoadingBox />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por ação, pessoa ou justificativa" className="pl-9 rounded-xl h-10" aria-label="Buscar no histórico" />
      </div>
      <p className="text-[11px] text-muted-foreground">O histórico é permanente e não pode ser editado nem apagado. Mostra as 500 ações mais recentes.</p>

      {rows.length === 0 ? (
        <EmptyBox icon={<HistoryIcon size={36} />} title="Nenhum registro encontrado." />
      ) : (
        <Card className="rounded-3xl border overflow-hidden divide-y divide-border">
          {rows.map((r) => {
            const details = summarize(r.before, r.after);
            const isOpen = open === r.id;
            const expandable = details.length > 0;
            return (
              <div key={r.id} className="px-5 py-3">
                <button
                  type="button"
                  disabled={!expandable}
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  aria-expanded={expandable ? isOpen : undefined}
                  className={cn("flex w-full items-start justify-between gap-3 text-left", !expandable && "cursor-default")}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{ACTION_LABEL[r.action] ?? r.action}</span>
                    <span className="block text-[11px] text-muted-foreground">{r.actor_name || "Sistema"} · {fmtDateTime(r.occurred_at)}</span>
                    {r.reason && <span className="block text-[13px] text-muted-foreground italic mt-1">“{r.reason}”</span>}
                  </span>
                  {expandable && <ChevronDown size={16} className={cn("mt-1 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />}
                </button>
                {isOpen && (
                  <ul className="mt-2 space-y-1 rounded-xl bg-muted/50 px-3 py-2 text-[12px]">
                    {details.map((l) => <li key={l} className="break-words">{l}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
