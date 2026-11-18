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
import { DISPLAY_STATE, campaignDisplayState, fmtDayTime, fmtRange, stagesSpan } from "../../../lib/campaigns/format";
import type { AdminCampaignListItem, PublishCheck } from "../../../lib/campaigns/types";

export type ListView = "cards" | "list";

/**
 * Grade da linha na visão "Lista" (a partir de md): Campanha · Situação · Período · Ações (menu "⋯").
 * Exportada para o cabeçalho de colunas da página usar exatamente as mesmas larguras.
 */
export const LIST_ROW_GRID =
  "md:grid md:grid-cols-[minmax(0,1.8fr)_minmax(0,9.5rem)_minmax(0,9.5rem)_2.75rem] md:items-center md:gap-x-5";

// ──────────────────────────── "O que falta" (rascunho) ────────────────────────────

const MISSING_WORDS: Record<string, string> = {
  basics: "nome e descrição",
  features: "formulário de participação",
  dependencies: "funcionalidades compatíveis",
  registration_dates: "datas",
  voting_dates: "datas da votação",
  audience: "público",
};

/** Resume os itens pendentes do checklist de publicação em uma frase curta. */
function missingText(check: PublishCheck): string {
  const missing = check.items.filter((i) => !i.ok);
  // Se faltam as datas das duas etapas, basta dizer "datas".
  const bothDates = missing.some((i) => i.key === "registration_dates") && missing.some((i) => i.key === "voting_dates");
  const words = Array.from(new Set(missing.filter((i) => !(bothDates && i.key === "voting_dates")).map((i) => MISSING_WORDS[i.key] ?? i.message)));
  if (words.length === 0) return "";
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} e ${words[words.length - 1]}`;
  return `Faltam: ${list}`;
}

// ─────────────────────────────────── Peças ───────────────────────────────────

type Hint = { tone: "ok" | "warn" | "muted"; text: React.ReactNode };

function CardHint({ hint, moduleOff, clamp }: { hint: Hint | null; moduleOff: boolean; clamp?: boolean }) {
  if (!hint && !moduleOff) return null;
  return (
    <div className="min-w-0 space-y-0.5">
      {hint && (
        <p
          className={cn(
            "flex items-start gap-1.5 text-[13px]",
            clamp && "truncate",
            hint.tone === "ok" && "font-medium text-green-700 dark:text-green-300",
            hint.tone === "warn" && "font-medium text-amber-700 dark:text-amber-300",
            hint.tone === "muted" && "text-muted-foreground",
          )}
        >
          {hint.tone === "ok" && <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
          <span className={cn(clamp && "truncate")}>{hint.text}</span>
        </p>
      )}
      {moduleOff && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          Módulo desligado: ninguém vê esta campanha até você ligá-lo.
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
  /** "cards" = cartão (tela estreita e em grade); "list" = linha compacta (colunas a partir de md). */
  view: ListView;
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
  const span = stagesSpan(c.stages);
  const period = fmtRange(span.starts, span.ends);
  const list = p.view === "list";

  // Só aparece quando há algo útil a dizer (o selo de situação já diz o resto).
  let hint: Hint | null = null;
  if (state === "draft") {
    if (p.check === undefined && p.canEdit) hint = { tone: "muted", text: "Verificando o que falta…" };
    else if (p.check && p.check.ok) hint = { tone: "ok", text: "Pronta para publicar" };
    else if (p.check) hint = { tone: "warn", text: missingText(p.check) };
  } else if (state === "scheduled") {
    hint = { tone: "muted", text: `Aparece em ${fmtDayTime(c.visible_from)}` };
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

  const nameButton = (
    <button
      type="button"
      className={cn(
        "text-left text-base font-semibold leading-snug text-foreground transition-colors hover:text-primary",
        list ? "line-clamp-2 break-words md:truncate" : "break-words",
      )}
      title={c.name}
      onClick={p.onOpen}
    >
      {c.name}
    </button>
  );

  const badge = (
    <Badge className={cn("shrink-0 gap-1.5 border px-2.5 py-0.5 text-xs font-semibold", st.className)} title={st.hint}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {st.label}
    </Badge>
  );

  const periodText = (
    <span className={cn("text-xs tabular-nums", span.starts || span.ends ? "text-muted-foreground" : "text-muted-foreground/70")}>
      {period}
    </span>
  );

  // AÇÕES: todas dentro do menu "⋯"
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-9 w-9 shrink-0 rounded-xl"
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
  );

  return (
    <Card className={cn("h-full rounded-2xl border hover:shadow-sm", quiet && "border-border/60 bg-muted/30", state === "archived" && "opacity-75")}>
      <CardContent className={list ? "p-3.5 sm:px-5" : "p-4 sm:p-5"}>
        {list ? (
          /* Linha: em tela larga vira colunas; em tela estreita empilha nome → situação e período */
          <div className={cn("flex items-start justify-between gap-3", LIST_ROW_GRID)}>
            <div className="min-w-0 space-y-1.5">
              {nameButton}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:hidden">
                {badge}
                {periodText}
              </div>
              <CardHint hint={hint} moduleOff={moduleOff} clamp />
            </div>
            <div className="hidden md:block">{badge}</div>
            <div className="hidden md:block">{periodText}</div>
            <div className="md:justify-self-end">{menu}</div>
          </div>
        ) : (
          /* Cartão */
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">{nameButton}</div>
              {menu}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {badge}
              {periodText}
            </div>
            <CardHint hint={hint} moduleOff={moduleOff} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
