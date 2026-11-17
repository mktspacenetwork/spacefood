import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { downloadCsv } from "../../../../lib/campaigns/export";
import type { ExportPayload } from "../../../../lib/campaigns/types";
import { Notice, stageState, useBusy } from "../shared";
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

export function ReportsTab({ campaignId, campaign, perms }: TabProps) {
  const { busy, run } = useBusy();

  const download = async (kind: string) => {
    const r = await run(kind, async () => {
      const p = await campaignsApi.get<ExportPayload>(`/admin/campaigns/${campaignId}/export/${kind}`);
      downloadCsv(`${campaign.slug}-${kind}`, p.columns, p.rows);
      return p.rows.length;
    });
    if (r.ok) {
      toast.success(r.value === 0 ? "Relatório gerado (sem linhas ainda)." : `Relatório gerado com ${r.value} linha(s).`);
    }
  };

  if (!perms.campaigns_export) {
    return <Notice tone="info">Você não tem permissão para exportar relatórios desta campanha.</Notice>;
  }

  const visible = REPORTS.filter((r) => r.show(perms, campaign));

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Arquivos CSV para Excel">
        Os relatórios são baixados em CSV (separador ponto e vírgula, acentos preservados) e abrem direto no Excel ou no Google Planilhas.
        Cada download fica registrado no histórico da campanha.
      </Notice>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible.map((r) => (
          <Card key={r.kind} className="rounded-3xl border">
            <CardContent className="p-5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm">{r.title}</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">{r.hint}</p>
              </div>
              <Button size="sm" variant="outline" className="gap-2 rounded-xl shrink-0" disabled={busy !== null} onClick={() => download(r.kind)}>
                {busy === r.kind ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} Baixar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
