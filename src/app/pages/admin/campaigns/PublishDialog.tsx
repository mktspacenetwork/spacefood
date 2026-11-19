import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Loader2, Rocket, XCircle } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Switch } from "../../../components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { cn } from "../../../lib/utils";
import { campaignsApi, errMsg } from "../../../lib/campaigns/api";
import { fmtRange, plural } from "../../../lib/campaigns/format";
import type { AdminCampaignDetail, PublishCheck } from "../../../lib/campaigns/types";
import { ErrorBox, LoadingBox, Notice, useBusy, visibleCheckItems } from "./shared";

type PublishResult = { visible_from: string; module_enabled_now: boolean; eligible_count: number };

/**
 * Publicar: resumo curto, checklist de prontidão e UMA opção (avisar os colaboradores).
 * A campanha aparece na hora para quem é elegível; quem controla o período é a data de início/encerramento.
 */
export function PublishDialog({
  campaignId,
  campaignName,
  open,
  onOpenChange,
  onPublished,
}: {
  campaignId: string;
  campaignName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: (result: PublishResult) => void;
}) {
  const [check, setCheck] = useState<PublishCheck | null>(null);
  const [detail, setDetail] = useState<AdminCampaignDetail | null>(null);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ligado por padrão: o colaborador precisa saber que a campanha abriu. O admin pode desligar para publicar sem avisar.
  const [notify, setNotify] = useState(true);
  const { busy, run } = useBusy();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, d, m] = await Promise.all([
        campaignsApi.get<PublishCheck>(`/admin/campaigns/${campaignId}/publish-check`),
        campaignsApi.get<AdminCampaignDetail>(`/admin/campaigns/${campaignId}`),
        campaignsApi.get<{ enabled: boolean }>("/admin/module"),
      ]);
      setCheck(c);
      setDetail(d);
      setModuleEnabled(m.enabled);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (!open) return;
    setNotify(true); // padrão ligado a cada abertura (o reset antigo para false anulava o useState(true))
    load();
  }, [open, load]);

  const ready = !!check?.ok;

  const publish = async () => {
    if (!ready) return;
    const r = await run(
      "publish",
      () => campaignsApi.post<PublishResult>(`/admin/campaigns/${campaignId}/publish`, { tour_enabled: true, notify }),
      "Campanha publicada.",
    );
    if (r.ok) {
      onOpenChange(false);
      onPublished(r.value);
    }
  };

  const eligible = check?.eligible_count ?? 0;
  const reg = detail?.stages.find((s) => s.stage_key === "registration");
  const vot = detail?.stages.find((s) => s.stage_key === "voting");
  const hasVoting = !!detail?.campaign.features.voting;
  // Campanha antiga (votação na mesma janela da participação) fica numa linha só; com datas próprias, uma linha por etapa.
  const t = (v: string | null | undefined) => (v ? new Date(v).getTime() : null);
  const sameWindow = hasVoting && t(vot?.starts_at) === t(reg?.starts_at) && t(vot?.ends_at) === t(reg?.ends_at);

  return (
    <Dialog open={open} onOpenChange={(v) => busy !== "publish" && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket size={18} className="text-primary" /> Publicar campanha
          </DialogTitle>
          <DialogDescription>Os colaboradores elegíveis passam a ver a campanha agora.</DialogDescription>
        </DialogHeader>

        {loading && !check ? (
          <LoadingBox label="Verificando a campanha..." />
        ) : error && !check ? (
          <ErrorBox message={error} onRetry={load} />
        ) : check ? (
          <div className="space-y-4">
            {/* Resumo */}
            <div className="space-y-1 rounded-2xl border p-3 text-sm">
              <p className="font-semibold">{campaignName}</p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={13} aria-hidden="true" />
                  {hasVoting ? (sameWindow ? "Participação e votação " : "Participação ") : ""}{fmtRange(reg?.starts_at, reg?.ends_at)}
                </span>
                {hasVoting && !sameWindow && <span>Votação {fmtRange(vot?.starts_at, vot?.ends_at)}</span>}
                <span>{plural(eligible, "pessoa elegível", "pessoas elegíveis")}</span>
              </p>
            </div>

            {/* Checklist */}
            <ul className="divide-y divide-border rounded-2xl border" data-tutorial="camp-publish-checklist">
              {visibleCheckItems(check.items).map((it) => (
                <li key={it.key} className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
                  {it.ok ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600 dark:text-green-400" aria-label="Ok" />
                  ) : (
                    <XCircle size={16} className="mt-0.5 shrink-0 text-destructive" aria-label="Pendente" />
                  )}
                  <span className={cn(!it.ok && "text-destructive")}>{it.message}</span>
                </li>
              ))}
            </ul>
            {!check.ok && (
              <p className="text-[12px] text-destructive">Resolva os itens pendentes (em Editar ou Configurações) para liberar o botão de publicar.</p>
            )}

            {/* Única opção */}
            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border p-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">Avisar os colaboradores agora</span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  Envia uma notificação dentro do app para {plural(eligible, "pessoa elegível", "pessoas elegíveis")}. Não dá para desfazer o envio. Desligue para publicar sem avisar.
                </span>
              </span>
              <Switch checked={notify} onCheckedChange={setNotify} aria-label="Avisar os colaboradores agora" className="mt-0.5" />
            </label>

            {moduleEnabled === false && (
              <Notice tone="info" title="As campanhas estão desligadas para todos">
                Ao publicar, elas são ligadas automaticamente. O menu Campanhas aparece só para os colaboradores elegíveis.
              </Notice>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={busy === "publish"}>
            Cancelar
          </Button>
          <Button className="gap-2 rounded-xl" onClick={publish} disabled={!ready || busy === "publish"}>
            {busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            Publicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
