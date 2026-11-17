import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, Rocket, XCircle } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
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
import { fmtDateTime, fromInputValue, plural, STAGE_LABEL } from "../../../lib/campaigns/format";
import type { AdminCampaignDetail, PublishCheck } from "../../../lib/campaigns/types";
import { ErrorBox, LoadingBox, Notice, SectionLabel, useBusy } from "./shared";

type PublishResult = { visible_from: string; module_enabled_now: boolean; eligible_count: number };

function OptionRow({
  title,
  hint,
  checked,
  onChange,
  disabled,
  tutorial,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  tutorial?: string;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border p-3 cursor-pointer" data-tutorial={tutorial}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[12px] text-muted-foreground mt-0.5">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={title} className="mt-0.5" />
    </label>
  );
}

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

  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [allowPreview, setAllowPreview] = useState(false);
  const [tourEnabled, setTourEnabled] = useState(true);
  const [tourReshow, setTourReshow] = useState(false);
  const [notify, setNotify] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
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
      setTourEnabled(d.campaign.features?.tour?.enabled !== false);
      setAllowPreview(!!d.campaign.visibility?.allow_preview);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (!open) return;
    setWhen("now");
    setScheduleAt("");
    setTourReshow(false);
    setNotify(false);
    setConfirmed(false);
    load();
  }, [open, load]);

  const scheduleIso = when === "schedule" ? fromInputValue(scheduleAt) : null;
  const scheduleInvalid = when === "schedule" && !scheduleIso;
  const schedulePast = !!scheduleIso && new Date(scheduleIso).getTime() < Date.now();
  const ready = !!check?.ok && !scheduleInvalid && confirmed;

  const publish = async () => {
    if (!ready) return;
    const r = await run(
      "publish",
      () =>
        campaignsApi.post<PublishResult>(`/admin/campaigns/${campaignId}/publish`, {
          visible_from: scheduleIso,
          allow_preview: allowPreview,
          tour_enabled: tourEnabled,
          tour_reshow: tourReshow,
          notify,
        }),
      when === "schedule" ? "Campanha publicada e agendada." : "Campanha publicada.",
    );
    if (r.ok) {
      onOpenChange(false);
      onPublished(r.value);
    }
  };

  const eligible = check?.eligible_count ?? 0;
  const stages = (detail?.stages ?? []).filter((s) => s.starts_at || s.ends_at);

  return (
    <Dialog open={open} onOpenChange={(v) => busy !== "publish" && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket size={18} className="text-primary" /> Publicar campanha
          </DialogTitle>
          <DialogDescription>
            Publicar torna a campanha visível para os colaboradores elegíveis. Até lá, ela fica restrita à gestão.
          </DialogDescription>
        </DialogHeader>

        {loading && !check ? (
          <LoadingBox label="Verificando a campanha..." />
        ) : error && !check ? (
          <ErrorBox message={error} onRetry={load} />
        ) : check ? (
          <div className="space-y-5">
            {/* 1. Resumo */}
            <section className="space-y-2">
              <SectionLabel>Resumo</SectionLabel>
              <div className="rounded-2xl border p-3 text-sm space-y-1.5">
                <p className="font-semibold">{campaignName}</p>
                <p className="text-muted-foreground text-[13px]">
                  {plural(eligible, "colaborador elegível", "colaboradores elegíveis")}
                </p>
                {stages.length > 0 ? (
                  <ul className="text-[12px] text-muted-foreground space-y-0.5 pt-1">
                    {stages.map((s) => (
                      <li key={s.stage_key}>
                        <b className="text-foreground/80">{STAGE_LABEL[s.stage_key] ?? s.stage_key}:</b> {fmtDateTime(s.starts_at)} → {fmtDateTime(s.ends_at)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-muted-foreground pt-1">Nenhuma data de etapa definida.</p>
                )}
              </div>
            </section>

            {/* 2. Checklist */}
            <section className="space-y-2">
              <SectionLabel>Prontidão</SectionLabel>
              <ul className="rounded-2xl border divide-y divide-border">
                {check.items.map((it) => (
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
                <p className="text-[12px] text-destructive">
                  Resolva os itens pendentes (use "Editar" na campanha) para liberar o botão de publicar.
                </p>
              )}
            </section>

            {/* 3. Opções */}
            <section className="space-y-2">
              <SectionLabel>Opções de publicação</SectionLabel>

              <div className="rounded-2xl border p-3 space-y-3">
                <p className="text-sm font-medium">Quando liberar</p>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Quando liberar">
                  {([
                    ["now", "Agora"],
                    ["schedule", "Agendar"],
                  ] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={when === v}
                      onClick={() => setWhen(v)}
                      className={cn(
                        "h-10 rounded-xl border text-sm font-medium transition-colors",
                        when === v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {when === "schedule" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <CalendarClock size={16} className="text-muted-foreground shrink-0" />
                      <Input
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="rounded-xl h-10"
                        aria-label="Data e hora de liberação (horário de Brasília)"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Horário de Brasília.</p>
                    {scheduleInvalid && <p className="text-[11px] text-destructive">Informe a data e a hora da liberação.</p>}
                    {schedulePast && <p className="text-[11px] text-yellow-700 dark:text-yellow-300">Essa data já passou: a campanha será liberada agora.</p>}
                  </div>
                )}
              </div>

              <OptionRow
                title="Consulta antecipada"
                hint='Antes do início, os colaboradores veem a campanha como "Em breve", sem poder participar.'
                checked={allowPreview}
                onChange={setAllowPreview}
              />
              <OptionRow
                title="Tour de boas-vindas aos colaboradores"
                hint="Mostra uma tour curta na primeira vez que cada pessoa abrir a campanha."
                checked={tourEnabled}
                onChange={(v) => { setTourEnabled(v); if (!v) setTourReshow(false); }}
              />
              <OptionRow
                title="Mostrar a tour de novo para quem já viu"
                hint="Reexibe a tour para todos, mesmo para quem já a concluiu."
                checked={tourReshow}
                onChange={setTourReshow}
                disabled={!tourEnabled}
              />
              <OptionRow
                title="Avisar colaboradores agora"
                hint={`Envia uma notificação para ${plural(eligible, "pessoa elegível", "pessoas elegíveis")}. Não dá para desfazer o envio.`}
                checked={notify}
                onChange={setNotify}
              />
            </section>

            {moduleEnabled === false && (
              <Notice tone="info" title="O módulo de campanhas está desligado">
                Ao publicar, o módulo será ligado automaticamente. Só então o menu Campanhas passa a aparecer — e apenas para
                os colaboradores elegíveis.
              </Notice>
            )}

            {/* 4. Confirmação */}
            <section className="space-y-3">
              <Notice tone="warn" title="Colaboradores elegíveis passarão a ver esta campanha">
                {when === "schedule" ? "A partir da data agendada." : "Imediatamente após a publicação."} Você poderá suspender ou
                encerrar depois, mas notificações enviadas não podem ser desfeitas.
              </Notice>
              <label className="flex items-start gap-3 cursor-pointer text-sm">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" aria-label="Confirmo a publicação" />
                <span>Entendo que esta campanha ficará visível para os colaboradores elegíveis.</span>
              </label>
            </section>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={busy === "publish"}>
            Cancelar
          </Button>
          <Button className="rounded-xl gap-2" onClick={publish} disabled={!ready || busy === "publish"}>
            {busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            Publicar campanha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
