import { useMemo, useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { cn } from "../../../lib/utils";
import { campaignsApi } from "../../../lib/campaigns/api";
import { DISPLAY_STATE, campaignDisplayState, fmtDateTime, plural } from "../../../lib/campaigns/format";
import type { AdminCampaignListItem } from "../../../lib/campaigns/types";
import { ErrorBox, LoadingBox, useBusy, useLoader } from "./shared";

/**
 * Campanhas EXCLUÍDAS (ocultas): só é carregada quando a pessoa abre o filtro "Excluídas". Nada foi apagado: receitas, votos
 * e histórico continuam guardados e "Restaurar" devolve a campanha à lista, na mesma situação em que estava.
 */
export function DeletedCampaigns({
  search, canRestore, onRestored,
}: {
  search: string;
  canRestore: boolean;
  onRestored: () => void;
}) {
  const list = useLoader<AdminCampaignListItem[]>(() => campaignsApi.get("/admin/campaigns?deleted=1"), []);
  const { busy, run } = useBusy();
  const [target, setTarget] = useState<AdminCampaignListItem | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [list.data, search]);

  const restore = async () => {
    const t = target;
    setTarget(null);
    if (!t) return;
    const r = await run("restore", () => campaignsApi.post(`/admin/campaigns/${t.id}/restore`), "Campanha restaurada: ela voltou à lista de campanhas.");
    if (r.ok) { list.reload(); onRestored(); }
  };

  if (list.loading && !list.data) return <LoadingBox />;
  if (list.error && !list.data) return <ErrorBox message={list.error} onRetry={list.reload} />;

  return (
    <div className="space-y-3" data-tutorial="camp-deleted">
      <p className="px-1 text-[13px] text-muted-foreground">
        Campanhas excluídas ficam ocultas aqui. Receitas, votos e histórico continuam guardados e você pode restaurá-las.
      </p>
      {rows.length === 0 ? (
        <Card className="rounded-3xl border-dashed">
          <CardContent className="p-10 text-center">
            <Trash2 size={32} className="mx-auto mb-3 text-muted-foreground opacity-40" aria-hidden="true" />
            <p className="font-medium text-muted-foreground">
              {(list.data ?? []).length === 0 ? "Nenhuma campanha excluída." : "Nenhuma campanha excluída com esse nome."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => {
            const display = campaignDisplayState(c);
            const st = DISPLAY_STATE[display];
            return (
              <li key={c.id}>
                <Card className="rounded-2xl border border-border/60 bg-muted/30 hover:shadow-none">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <p className="break-words text-sm font-semibold text-foreground">{c.name}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge className="border border-border bg-muted text-[10px] text-muted-foreground">Excluída</Badge>
                        <Badge className={cn("border text-[10px]", st.className)} title={st.hint}>Antes: {st.label}</Badge>
                        <span className="text-[12px] text-muted-foreground">
                          {c.deleted_at ? `Excluída em ${fmtDateTime(c.deleted_at)} · ` : ""}{plural(c.submissions, "receita", "receitas")}
                        </span>
                      </div>
                    </div>
                    {canRestore && (
                      <Button
                        variant="outline"
                        className="h-11 w-full shrink-0 gap-2 rounded-xl sm:w-auto"
                        disabled={busy !== null}
                        onClick={() => setTarget(c)}
                      >
                        {busy === "restore" && target?.id === c.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                        Restaurar
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Restaurar a campanha?"
        description={`${target?.name ?? "A campanha"} volta para a lista de campanhas, na mesma situação em que estava. Nada foi perdido.`}
        confirmLabel="Restaurar"
        onConfirm={restore}
      />
    </div>
  );
}
