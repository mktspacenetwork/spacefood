import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { Archive, CalendarClock, FileDown, History as HistoryIcon, IdCard, Pencil, ShieldAlert, Trash2, Undo2, XCircle } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { cn } from "../../../../lib/utils";
import { DISPLAY_STATE, plural } from "../../../../lib/campaigns/format";
import type { DisplayState } from "../../../../lib/campaigns/format";
import type { AdminCampaign, AdminDashboard } from "../../../../lib/campaigns/types";
import { ScheduleTab } from "./ScheduleTab";
import { ReportsTab } from "./ReportsTab";
import { HistoryTab } from "./HistoryTab";
import type { TabProps } from "./types";

export type RiskKind = "draft" | "close" | "archive" | "delete";

export type SettingsTabProps = TabProps & {
  /** Seção para rolar até ela ao abrir (info | schedule | reports | history | danger). */
  section?: string | null;
  /** Abre o diálogo de confirmação correspondente no painel. */
  onAction: (kind: RiskKind) => void;
  display: DisplayState;
  dashboard: AdminDashboard | null;
};

const FEATURE_LABEL: [keyof AdminCampaign["features"], string][] = [
  ["submission", "Formulário"], ["photos", "Fotos"], ["video", "Vídeo"], ["approval", "Aprovação"],
  ["gallery", "Galeria"], ["voting", "Votação"], ["ranking", "Ranking"], ["results", "Resultado"], ["announcement", "Divulgação"],
];
const RANKING_MODE: Record<string, string> = {
  hidden_until_confirmed: "só depois de confirmar o vencedor", after_close: "ao encerrar a votação", live: "em tempo real",
};
const GALLERY_MODE: Record<string, string> = {
  on_approval: "assim que a receita é aprovada", on_voting_start: "quando a votação começa", on_results: "na divulgação do resultado",
};

function audienceText(c: AdminCampaign, eligible: number | undefined): string {
  const a = c.audience;
  const n = eligible !== undefined ? ` · ${plural(eligible, "pessoa elegível", "pessoas elegíveis")}` : "";
  if (a.mode === "units") return `Unidades: ${(a.units ?? []).join(", ") || "—"}${n}`;
  if (a.mode === "departments") return `Departamentos: ${(a.departments ?? []).join(", ") || "—"}${n}`;
  if (a.mode === "users") return `Pessoas específicas${n}`;
  return `Todos os colaboradores${n}`;
}

function Section({
  id, icon, title, hint, action, children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={`camp-sec-${id}`} data-tutorial={`camp-sec-${id}`} className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground"><span className="text-primary">{icon}</span>{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function SettingsTab(props: SettingsTabProps) {
  const { section, onAction, display, dashboard, ...tabProps } = props;
  const { campaign: c, campaignId, perms } = tabProps;
  const navigate = useNavigate();

  const finished = c.status === "closed" || c.status === "archived";
  const hasSubmissions = (dashboard?.submissions ?? 0) > 0;

  // Ações de risco: só aparecem quando valem para o estado atual e para a permissão da pessoa.
  const risk = useMemo(() => {
    const items: { kind: RiskKind; title: string; text: string; label: string; icon: React.ReactNode; destructive?: boolean; disabled?: boolean; note?: string }[] = [];
    if ((c.status === "in_review" || c.status === "authorized") && perms.campaigns_edit) {
      items.push({
        kind: "draft", title: "Voltar a rascunho", icon: <Undo2 size={14} />, label: "Voltar a rascunho",
        text: "A campanha sai de exibição e volta a ser só da gestão, para ser reeditada do zero.",
        disabled: hasSubmissions, note: hasSubmissions ? "Indisponível: já existem receitas enviadas. Use Despublicar para tirar a campanha de exibição." : undefined,
      });
    }
    if (c.status === "authorized" && perms.campaigns_publish) {
      items.push({
        kind: "close", title: "Encerrar campanha", icon: <XCircle size={14} />, label: "Encerrar", destructive: true,
        text: "Finaliza a campanha: ninguém mais envia receitas nem vota, e ela não pode ser reaberta (dá para duplicá-la). Dados e histórico são preservados.",
      });
    }
    if ((c.status === "draft" || c.status === "closed") && perms.campaigns_edit) {
      items.push({
        kind: "archive", title: "Arquivar", icon: <Archive size={14} />, label: "Arquivar",
        text: "Tira a campanha da lista principal. Dados e histórico continuam guardados.",
      });
    }
    if (c.status === "draft" && perms.campaigns_edit) {
      items.push({
        kind: "delete", title: "Excluir rascunho", icon: <Trash2 size={14} />, label: "Excluir", destructive: true,
        text: "Exclusão definitiva. Só é possível para rascunhos que nunca receberam nenhuma receita.",
      });
    }
    return items;
  }, [c.status, perms.campaigns_edit, perms.campaigns_publish, hasSubmissions]);

  const sections = [
    { id: "info", label: "Informações", show: true },
    { id: "schedule", label: "Calendário", show: !!perms.campaigns_schedule },
    { id: "reports", label: "Relatórios", show: !!perms.campaigns_export },
    { id: "history", label: "Histórico", show: true },
    { id: "danger", label: "Zona de risco", show: risk.length > 0 },
  ].filter((s) => s.show);

  const scrollTo = (id: string) => document.getElementById(`camp-sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Abre já na seção pedida (ex.: "Definir datas" no próximo passo).
  useEffect(() => {
    if (!section) return;
    const t = setTimeout(() => scrollTo(section), 200);
    return () => clearTimeout(t);
  }, [section]);

  const enabledFeatures = FEATURE_LABEL.filter(([k]) => !!c.features[k]).map(([, l]) => l);
  const lines = c.instructions.split("\n").filter((l) => l.trim()).length;

  return (
    <div className="space-y-8">
      <nav aria-label="Seções de configurações" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollTo(s.id)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-4 text-xs font-semibold transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring",
              s.id === "danger" ? "border-destructive/30 text-destructive" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <Section
        id="info"
        icon={<IdCard size={18} />}
        title="Informações"
        hint="O que os colaboradores leem sobre a campanha."
        action={perms.campaigns_edit && !finished ? (
          <Button size="sm" variant="outline" className="gap-2 rounded-xl" onClick={() => navigate(`/admin/campaigns/${campaignId}/edit`)}>
            <Pencil size={13} /> Editar informações
          </Button>
        ) : undefined}
      >
        <Card className="rounded-3xl border">
          <CardContent className="p-5">
            <dl className="divide-y divide-border">
              <Row label="Nome">{c.name}</Row>
              <Row label="Endereço"><span className="font-mono text-xs">/campanhas/{c.slug}</span></Row>
              <Row label="Situação">{DISPLAY_STATE[display].label} — {DISPLAY_STATE[display].hint}</Row>
              <Row label="Descrição"><span className="line-clamp-4 whitespace-pre-line">{c.description || "—"}</span></Row>
              <Row label="Objetivo">{c.objective || "—"}</Row>
              <Row label="Orientações">{lines > 0 ? `${plural(lines, "linha", "linhas")} de orientação` : "—"}</Row>
              <Row label="Público">{audienceText(c, dashboard?.eligible)}</Row>
              <Row label="Funcionalidades">
                <span className="flex flex-wrap gap-1.5">
                  {enabledFeatures.map((l) => (
                    <span key={l} className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] font-medium">{l}</span>
                  ))}
                </span>
              </Row>
              {(c.features.photos || c.features.video) && (
                <Row label="Mídia">
                  {c.features.photos && <>Até {c.media_limits.max_photos} foto(s) extra(s) de {c.media_limits.max_photo_mb} MB{c.media_limits.require_main_photo ? " · foto principal obrigatória" : ""}</>}
                  {c.features.photos && c.features.video && c.media_limits.allow_video && " · "}
                  {c.features.video && c.media_limits.allow_video && <>vídeo de até {c.media_limits.max_video_mb} MB</>}
                </Row>
              )}
              {(c.features.gallery || c.features.ranking) && (
                <Row label="Visibilidade">
                  {c.features.gallery && <>Galeria: {GALLERY_MODE[c.visibility.gallery_visibility]}. </>}
                  {c.features.ranking && <>Ranking: {RANKING_MODE[c.visibility.ranking_mode]}.</>}
                </Row>
              )}
            </dl>
          </CardContent>
        </Card>
      </Section>

      {perms.campaigns_schedule && (
        <Section id="schedule" icon={<CalendarClock size={18} />} title="Calendário" hint="Quando cada etapa começa e termina.">
          <ScheduleTab {...tabProps} />
        </Section>
      )}

      {perms.campaigns_export && (
        <Section id="reports" icon={<FileDown size={18} />} title="Relatórios" hint="Baixe os dados da campanha em planilha.">
          <ReportsTab {...tabProps} />
        </Section>
      )}

      <Section id="history" icon={<HistoryIcon size={18} />} title="Histórico" hint="Tudo o que foi feito na campanha: quem, quando e por quê.">
        <HistoryTab {...tabProps} />
      </Section>

      {risk.length > 0 && (
        <Section id="danger" icon={<ShieldAlert size={18} />} title="Zona de risco" hint="Ações que mudam o destino da campanha. Cada uma pede confirmação.">
          <Card className="rounded-3xl border border-destructive/30">
            <CardContent className="divide-y divide-border p-0">
              {risk.map((r) => (
                <div key={r.kind} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{r.text}</p>
                    {r.note && <p className="mt-1 text-[12px] font-medium text-orange-600 dark:text-orange-300">{r.note}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant={r.destructive ? "destructive" : "outline"}
                    className="gap-2 rounded-xl"
                    disabled={r.disabled}
                    onClick={() => onAction(r.kind)}
                  >
                    {r.icon} {r.label}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>
      )}
    </div>
  );
}
