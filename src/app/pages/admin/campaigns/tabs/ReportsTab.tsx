import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { DEFAULT_PERIOD, REPORT_DATE_BASIS, downloadCsv, exportFileName, periodQuery } from "../../../../lib/campaigns/export";
import type { PeriodChoice, ResolvedPeriod } from "../../../../lib/campaigns/export";
import type { ExportPayload } from "../../../../lib/campaigns/types";
import { Notice, useBusy } from "../shared";
import { ExportDialog } from "./ExportDialog";
import type { TabProps } from "./types";

type Report = { kind: string; title: string; hint: string; show: (p: Record<string, boolean>, c: TabProps["campaign"]) => boolean };

const REPORTS: Report[] = [
  { kind: "participants", title: "Participantes", hint: "Quem participa, quem enviou receita e a situação dela.", show: () => true },
  { kind: "submissions", title: "Todas as receitas", hint: "Texto completo, situação e quem analisou.", show: (_p, c) => c.features.submission },
  { kind: "approved", title: "Receitas aprovadas", hint: "Somente as receitas aprovadas.", show: (_p, c) => c.features.approval },
  { kind: "rejected", title: "Receitas reprovadas", hint: "Com a justificativa de cada reprovação.", show: (_p, c) => c.features.approval },
  { kind: "voting", title: "Votação por receita", hint: "Votos válidos por receita.", show: (p, c) => c.features.voting && !!p.campaigns_results },
  { kind: "ranking", title: "Ranking", hint: "Classificação por votos válidos.", show: (p, c) => c.features.voting && !!p.campaigns_results },
  { kind: "result", title: "Resultado", hint: "Vencedor, confirmação e divulgação.", show: (p, c) => c.features.results && !!p.campaigns_results },
  { kind: "history", title: "Histórico completo", hint: "Todas as ações da campanha: quem, quando e por quê.", show: () => true },
  { kind: "votes", title: "Votos individuais", hint: "Quem votou em qual receita. Dado sensível.", show: (p, c) => c.features.voting && !!p.campaigns_export_votes && !!p.campaigns_votes_view },
];

/** O relatório de resultado é sempre o oficial da campanha inteira: não usa período. */
const usesPeriod = (kind: string) => kind !== "result";

export function ReportsTab({ campaignId, campaign, perms }: TabProps) {
  const { busy, run } = useBusy();
  const [dialog, setDialog] = useState<Report | null>(null);
  // A escolha fica guardada entre um download e outro (quem baixa vários relatórios do mesmo período não refaz).
  const [choice, setChoice] = useState<PeriodChoice>(DEFAULT_PERIOD);

  const download = async (kind: string, p: Extract<ResolvedPeriod, { ok: true }> | null) => {
    const q = p ? periodQuery(p) : "";
    const r = await run(kind, async () => {
      const payload = await campaignsApi.get<ExportPayload>(`/admin/campaigns/${campaignId}/export/${kind}${q}`);
      downloadCsv(exportFileName(campaign.slug, kind, p?.tag ?? ""), payload.columns, payload.rows);
      return payload;
    });
    if (!r.ok) return;
    setDialog(null);
    const n = r.value.rows.length;
    const where = p && (p.from || p.to) ? ` (${p.label})` : "";
    toast.success(n === 0 ? `Relatório gerado${where}, sem linhas.` : `Relatório gerado com ${n} linha(s)${where}.`);
    // O servidor devolve o período que aplicou; se pedimos um e ele não confirmou, avisamos em vez de enganar.
    if (p && (p.from || p.to) && r.value.range === undefined) {
      toast.warning("O servidor não confirmou o período: o arquivo pode trazer todo o período.");
    }
  };

  if (!perms.campaigns_export) {
    return <Notice tone="info">Você não tem permissão para exportar relatórios desta campanha.</Notice>;
  }

  const visible = REPORTS.filter((r) => r.show(perms, campaign));

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Planilhas CSV que abrem no Excel (separador ponto e vírgula). Você escolhe o período ao baixar. Cada download fica no histórico.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible.map((r) => {
          const basis = REPORT_DATE_BASIS[r.kind];
          return (
            <Card key={r.kind} className="rounded-3xl border">
              <CardContent className="p-5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{r.title}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{r.hint}</p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1">
                    {usesPeriod(r.kind) ? (basis ? `Período pela ${basis}.` : "") : "Sempre completo: não usa período."}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 rounded-xl shrink-0 min-h-11 sm:min-h-9"
                  disabled={busy !== null}
                  aria-label={`Baixar ${r.title}`}
                  onClick={() => (usesPeriod(r.kind) ? setDialog(r) : download(r.kind, null))}
                >
                  {busy === r.kind && !dialog ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} Baixar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {dialog && (
        <ExportDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          kind={dialog.kind}
          title={dialog.title}
          hint={dialog.hint}
          choice={choice}
          onChoiceChange={setChoice}
          busy={busy === dialog.kind}
          onConfirm={(p) => download(dialog.kind, p)}
        />
      )}
    </div>
  );
}
