import {
  CheckCircle2, Copy, Eye, EyeOff, History as HistoryIcon, MoreHorizontal, Pencil, Rocket, Settings2,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";
import { DISPLAY_STATE, PHASE_STATE, campaignDisplayState, fmtDateTime, fmtShort, plural } from "../../../lib/campaigns/format";
import type { AdminCampaignListItem, AdminStageRow, PublishCheck } from "../../../lib/campaigns/types";
import { stageState } from "./shared";

/**
 * Grade do cartão em telas largas (xl): uma linha por campanha, com colunas fixas e o menu "⋯" (todas as ações)
 * na lateral direita, na mesma linha do status. Abaixo disso o cartão empilha: cabeçalho (nome + status + ⋯) → detalhes.
 * Exportada para o cabeçalho de colunas da página usar exatamente as mesmas larguras.
 */
export const LIST_ROW_GRID =
  "xl:grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_4.5rem_3rem] xl:items-center xl:gap-x-6";

// ──────────────────────────── "O que falta" (rascunho) ────────────────────────────

const MISSING_WORDS: Record<string, string> = {
  basics: "nome e descrição",
  features: "formulário de participação",
  dependencies: "funcionalidades compatíveis",
  registration_dates: "datas das inscrições",
  voting_dates: "datas da votação",
  audience: "público",
};

/** Resume os itens pendentes do checklist de publicação em uma frase curta. */
function missingText(check: PublishCheck): string {
  const words = check.items.filter((i) => !i.ok).map((i) => MISSING_WORDS[i.key] ?? i.message);
  if (words.length === 0) return "";
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} e ${words[words.length - 1]}`;
  return `Faltam: ${list}`;
}

// ─────────────────────────────────── Peças ───────────────────────────────────

function PhaseLine({ label, stage }: { label: string; stage?: AdminStageRow }) {
  const p = PHASE_STATE[stageState(stage)];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <b className="text-foreground/80">{label}</b>
      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", p.className)}>{p.label}</span>
      {stage?.starts_at && <span>{fmtShort(stage.starts_at)} → {fmtShort(stage.ends_at)}</span>}
    </span>
  );
}

type Hint = { tone: "ok" | "warn" | "muted"; text: React.ReactNode };

function CardHint({ hint, moduleOff }: { hint: Hint; moduleOff: boolean }) {
  return (
    <div className="space-y-1">
      <p
        className={cn(
          "flex items-start gap-1.5 text-sm",
          hint.tone === "ok" && "font-medium text-green-700 dark:text-green-300",
          hint.tone === "warn" && "font-medium text-amber-700 dark:text-amber-300",
          hint.tone === "muted" && "text-muted-foreground",
        )}
      >
        {hint.tone === "ok" && <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
        <span>{hint.text}</span>
      </p>
      {moduleOff && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          O módulo de campanhas está desligado: ninguém vê esta campanha até você ligá-lo.
        </p>
      )}
    </div>
  );
}

/** Cor e explicação de cada ação de publicação (item do menu "⋯") — cada uma com cara própria, para ninguém confundir. */
const MAIN_ACTION = {
  publish: {
    menuClass: "text-primary focus:text-primary",
    Icon: Rocket,
    title: "Tornar a campanha visível aos colaboradores elegíveis. Você confere o checklist antes de confirmar.",
  },
  unpublish: {
    menuClass: "text-amber-700 focus:text-amber-700 dark:text-amber-300 dark:focus:text-amber-300",
    Icon: EyeOff,
    title: "Retirar a campanha de exibição, sem apagar nada.",
  },
  republish: {
    menuClass: "text-green-700 focus:text-green-700 dark:text-green-300 dark:focus:text-green-300",
    Icon: Eye,
    title: "Voltar a exibir a campanha aos colaboradores.",
  },
};

// ─────────────────────────────────── Cartão ───────────────────────────────────

export type CampaignListCardProps = {
  c: AdminCampaignListItem;
  moduleEnabled: boolean | null;
  /** undefined = ainda verificando; null = indisponível (sem permissão/erro) */
  check: PublishCheck | null | undefined;
  canEdit: boolean;
  canPublish: boolean;
  canDuplicate: boolean;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onHistory: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onRepublish: () => void;
  onDuplicate: () => void;
};

export function CampaignListCard(p: CampaignListCardProps) {
  const { c } = p;
  const state = campaignDisplayState(c);
  const st = DISPLAY_STATE[state];
  const editable = state !== "closed" && state !== "archived";
  const quiet = !editable;
  const stage = (k: "registration" | "voting") => c.stages.find((s) => s.stage_key === k);

  // Frase única de "situação / o que falta"
  let hint: Hint = { tone: "muted", text: st.hint };
  if (state === "draft") {
    if (p.check === undefined && p.canEdit) hint = { tone: "muted", text: "Verificando o que falta para publicar…" };
    else if (p.check && p.check.ok) hint = { tone: "ok", text: "Pronta para publicar" };
    else if (p.check) hint = { tone: "warn", text: missingText(p.check) };
  } else if (state === "scheduled") {
    hint = { tone: "muted", text: `Vai aparecer para os colaboradores em ${fmtDateTime(c.visible_from)}.` };
  } else if (state === "unpublished") {
    hint = { tone: "warn", text: "Retirada de exibição. Tudo continua salvo — republique quando quiser." };
  }
  const moduleOff = (state === "published" || state === "scheduled") && p.moduleEnabled === false;

  // A UMA ação de publicação que cabe ao estado atual (só para quem pode publicar).
  const main: { kind: keyof typeof MAIN_ACTION; label: string; onClick: () => void } | null = !p.canPublish
    ? null
    : state === "draft" ? { kind: "publish", label: "Publicar", onClick: p.onPublish }
    : state === "published" || state === "scheduled" ? { kind: "unpublish", label: "Despublicar", onClick: p.onUnpublish }
    : state === "unpublished" ? { kind: "republish", label: "Republicar", onClick: p.onRepublish }
    : null;
  const ms = main ? MAIN_ACTION[main.kind] : null;

  const hintBlock = <CardHint hint={hint} moduleOff={moduleOff} />;

  return (
    <Card className={cn("rounded-2xl border hover:shadow-sm", quiet && "border-border/60 bg-muted/30", state === "archived" && "opacity-75")}>
      <CardContent className="p-4 sm:p-5">
        <div className={cn("relative flex flex-col gap-3", LIST_ROW_GRID)}>
          {/* Cabeçalho: campanha + status (em tela larga, cada um vira uma coluna da linha) */}
          <div className="flex items-start justify-between gap-3 xl:contents">
            <div className="min-w-0 xl:col-start-1 xl:row-start-1">
              <button
                type="button"
                className="break-words text-left text-base font-bold text-foreground transition-colors hover:text-primary"
                onClick={p.onOpen}
              >
                {c.name}
              </button>
              <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">/campanhas/{c.slug}</p>
              <div className="mt-1.5 hidden xl:block">{hintBlock}</div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5 pr-12 xl:col-start-2 xl:row-start-1 xl:items-start xl:pr-0">
              <Badge className={cn("gap-2 border px-3.5 py-1 text-sm font-bold", st.className)}>
                <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                {st.label}
              </Badge>
              <div className="hidden xl:flex xl:flex-col xl:gap-1">
                <PhaseLine label="Inscrições" stage={stage("registration")} />
                <PhaseLine label="Votação" stage={stage("voting")} />
              </div>
            </div>
          </div>

          {/* Receitas (só em tela larga; nas outras vai junto dos detalhes) */}
          <div className="hidden text-center xl:col-start-3 xl:row-start-1 xl:block">
            <p className="text-xl font-bold leading-none tabular-nums text-foreground">{c.submissions}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {c.submissions === 1 ? "receita" : "receitas"}
            </p>
          </div>

          {/* AÇÕES: todas dentro do menu "⋯" (canto superior direito; em tela larga, última coluna da linha) */}
          <div className="absolute right-0 top-0 xl:static xl:col-start-4 xl:row-start-1 xl:justify-self-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="h-10 w-10 rounded-xl"
                  size="icon"
                  variant="outline"
                  aria-label={`Ações de ${c.name}`}
                  title="Publicar, gerenciar, editar e outras ações"
                  disabled={p.busy}
                >
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {main && ms && (
                  <DropdownMenuItem
                    onSelect={main.onClick}
                    disabled={p.busy}
                    title={ms.title}
                    className={cn("cursor-pointer gap-2 font-semibold", ms.menuClass)}
                  >
                    <ms.Icon size={14} /> {main.label}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={p.onOpen} title="Abrir o painel da campanha: resumo, receitas, participantes e votação" className="cursor-pointer gap-2">
                  <Settings2 size={14} /> Gerenciar
                </DropdownMenuItem>
                {p.canEdit && editable && (
                  <DropdownMenuItem onSelect={p.onEdit} title="Editar as informações da campanha" className="cursor-pointer gap-2">
                    <Pencil size={14} /> Editar
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {p.canDuplicate && (
                  <DropdownMenuItem onSelect={p.onDuplicate} className="cursor-pointer gap-2">
                    <Copy size={14} /> Duplicar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={p.onHistory} className="cursor-pointer gap-2">
                  <HistoryIcon size={14} /> Histórico
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Detalhes (telas estreitas e médias) */}
          <div className="space-y-2 xl:hidden">
            {hintBlock}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <PhaseLine label="Inscrições" stage={stage("registration")} />
              <PhaseLine label="Votação" stage={stage("voting")} />
              <span className="text-xs text-muted-foreground">
                <b className="text-foreground/80">Receitas</b> {plural(c.submissions, "enviada", "enviadas")}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
