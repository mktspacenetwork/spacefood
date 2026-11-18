import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { TIMEZONE } from "../../lib/date-utils";
import {
  MAX_SUBMISSIONS_PER_USER,
  type CollabCampaignListItem, type CollabState, type PublicCampaign, type PublicStage,
} from "../../lib/campaigns/types";

/**
 * Mesmas proporções do carrossel de banners da Home (BannerCarousel): 2:1 no celular, 3:1 e 3,5:1 em telas maiores.
 * A capa da campanha é o banner — por isso a tela da campanha e os cartões usam exatamente estas classes.
 */
export const BANNER_ASPECT = "aspect-[2/1] md:aspect-[3/1] lg:aspect-[3.5/1]";

type Phase = "unset" | "upcoming" | "open" | "paused" | "closed";

const fmt = (iso: string, f: string) => formatInTimeZone(new Date(iso), TIMEZONE, f, { locale: ptBR });

/** Situação de uma etapa a partir das datas (a lista não traz o estado calculado pelo servidor). */
function phaseOf(s?: Pick<PublicStage, "starts_at" | "ends_at" | "paused">): Phase {
  if (!s || !s.starts_at) return "unset";
  const now = Date.now();
  if (new Date(s.starts_at).getTime() > now) return "upcoming";
  if (s.ends_at && new Date(s.ends_at).getTime() <= now) return "closed";
  return s.paused ? "paused" : "open";
}

/** Faixa de datas curta. Ex.: "5 a 15 nov", "28 out a 3 nov", "A partir de 5 nov". */
function rangeText(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start && !end) return null;
  if (start && end) {
    if (fmt(start, "d/M/yyyy") === fmt(end, "d/M/yyyy")) return `${fmt(start, "d")} ${fmt(start, "MMM")}`;
    return fmt(start, "M/yyyy") === fmt(end, "M/yyyy")
      ? `${fmt(start, "d")} a ${fmt(end, "d")} ${fmt(end, "MMM")}`
      : `${fmt(start, "d")} ${fmt(start, "MMM")} a ${fmt(end, "d")} ${fmt(end, "MMM")}`;
  }
  if (start) return `A partir de ${fmt(start, "d")} ${fmt(start, "MMM")}`;
  return `Até ${fmt(end!, "d")} ${fmt(end!, "MMM")}`;
}

const stageOf = (c: Pick<PublicCampaign, "stages">, key: "registration" | "voting") => c.stages.find((s) => s.key === key);
const sameInstant = (a: string | null, b: string | null) =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

/** A campanha tem votação? (sem votação nenhuma tela ou texto fala de voto, ranking ou resultado) */
export const hasVoting = (c: Pick<PublicCampaign, "features">): boolean => !!c.features?.voting;

/** Campanha que aceita mais de uma receita por pessoa. */
export const allowsMultiple = (c: Pick<PublicCampaign, "features">, maxFromServer?: number): boolean =>
  c.features?.multiple_submissions === true || (maxFromServer ?? 1) > 1;

/** Período de participação (inscrições). Ex.: "5 a 15 nov". */
export function periodText(c: Pick<PublicCampaign, "stages">): string | null {
  const reg = stageOf(c, "registration");
  return rangeText(reg?.starts_at, reg?.ends_at);
}

export type PeriodRow = {
  key: "registration" | "voting" | "both";
  /** "Participação", "Votação" ou "Participação e votação" (janelas idênticas ficam numa linha só) */
  label: string;
  text: string;
  startsAt: string | null;
  endsAt: string | null;
};

/**
 * Períodos da campanha, do jeito mais curto possível:
 *  - sem votação: 1 linha (participação);
 *  - com votação na MESMA janela: 1 linha "Participação e votação";
 *  - com votação em janela própria: 2 linhas, cada uma com o seu período.
 */
export function periodRows(c: Pick<PublicCampaign, "stages" | "features">): PeriodRow[] {
  const reg = stageOf(c, "registration");
  const vot = hasVoting(c) ? stageOf(c, "voting") : undefined;
  const regText = rangeText(reg?.starts_at, reg?.ends_at);
  const votText = vot ? rangeText(vot.starts_at, vot.ends_at) : null;
  const regRow: PeriodRow | null = regText ? { key: "registration", label: "Participação", text: regText, startsAt: reg?.starts_at ?? null, endsAt: reg?.ends_at ?? null } : null;
  const votRow: PeriodRow | null = votText ? { key: "voting", label: "Votação", text: votText, startsAt: vot?.starts_at ?? null, endsAt: vot?.ends_at ?? null } : null;
  if (regRow && votRow) {
    if (sameInstant(regRow.startsAt, votRow.startsAt) && sameInstant(regRow.endsAt, votRow.endsAt)) {
      return [{ ...regRow, key: "both", label: "Participação e votação" }];
    }
    return [regRow, votRow];
  }
  return [regRow ?? votRow].filter(Boolean) as PeriodRow[];
}

/** Fim da campanha (ISO) = o maior encerramento entre inscrições e votação; null se não há data. */
export function campaignEnd(c: Pick<PublicCampaign, "stages" | "features">): string | null {
  const ends = c.stages
    .filter((s) => s.key === "registration" || (s.key === "voting" && hasVoting(c)))
    .map((s) => s.ends_at)
    .filter((x): x is string => !!x)
    .sort();
  return ends.length ? ends[ends.length - 1] : null;
}

export type StatusTone = "open" | "soon" | "closed" | "paused" | "done";
export type CampaignStatusInfo = { text: string; tone: StatusTone };

/**
 * Situação em palavras simples a partir da fase das inscrições e da votação.
 * Sem votação a fase de votação é ignorada por completo ("unset").
 */
function combine(reg: Phase, vot: Phase, votingOn: boolean): CampaignStatusInfo {
  if (!votingOn) {
    if (reg === "open") return { text: "Participação aberta", tone: "open" };
    if (reg === "paused") return { text: "Em pausa", tone: "paused" };
    if (reg === "closed") return { text: "Encerrada", tone: "closed" };
    return { text: "Em breve", tone: "soon" };
  }
  if (reg === "open" && vot === "open") return { text: "Participação e votação abertas", tone: "open" };
  if (vot === "open") return { text: "Votação aberta", tone: "open" };
  if (reg === "open") return { text: "Participação aberta", tone: "open" };
  if (reg === "paused" || vot === "paused") return { text: "Em pausa", tone: "paused" };
  if (vot === "closed") return { text: "Aguardando resultado", tone: "closed" };
  if (reg === "closed" && vot === "upcoming") return { text: "Votação em breve", tone: "soon" };
  if (reg === "closed") return { text: "Participação encerrada", tone: "closed" };
  return { text: "Em breve", tone: "soon" };
}

/** Status curto para o cartão da lista (calculado pelas datas). */
export function statusOfListItem(c: CollabCampaignListItem): CampaignStatusInfo {
  if (!c.state.released) return { text: "Em breve", tone: "soon" };
  if (c.state.results_visible || c.state.stage === "results") return { text: "Resultado disponível", tone: "done" };
  if (c.state.stage === "closed") return { text: "Encerrada", tone: "closed" };
  const reg = phaseOf(stageOf(c, "registration"));
  const vot = hasVoting(c) ? phaseOf(stageOf(c, "voting")) : "unset";
  return combine(reg, vot, hasVoting(c));
}

/** Status curto para a tela da campanha (o servidor já calculou registration/voting). */
export function statusOfDetail(c: PublicCampaign, s: CollabState): CampaignStatusInfo {
  if (!s.released) return { text: "Em breve", tone: "soon" };
  if (s.results_visible) return { text: "Resultado disponível", tone: "done" };
  if (s.stage === "closed") return { text: "Encerrada", tone: "closed" };
  return combine(s.registration ?? "unset", hasVoting(c) ? (s.voting ?? "unset") : "unset", hasVoting(c));
}

/** Texto curto do status de UMA receita da própria pessoa. */
export function myRecipeLine(status?: string | null): string | null {
  switch (status) {
    case "pending_media": return "Falta concluir o envio da foto";
    case "submitted":
    case "in_review": return "Sua receita está em análise";
    case "approved": return "Sua receita foi aprovada";
    case "rejected": return "Sua receita não foi aprovada";
    default: return null;
  }
}

/** Quantas receitas a pessoa já enviou (sem o campo novo do servidor, deduz: 1 se há status de receita). */
export function submissionsCount(s: { my_submissions_count?: number; my_submission_status?: string | null; my_submission_id?: string | null }): number {
  if (typeof s.my_submissions_count === "number") return s.my_submissions_count;
  return s.my_submission_status || s.my_submission_id ? 1 : 0;
}

/** Limite de receitas por pessoa: 1, ou até o teto técnico quando a campanha aceita várias. */
export function submissionsMax(c: Pick<PublicCampaign, "features">, s: { max_submissions?: number }): number {
  if (typeof s.max_submissions === "number" && s.max_submissions > 0) return s.max_submissions;
  return c.features?.multiple_submissions ? MAX_SUBMISSIONS_PER_USER : 1;
}

/** "Receitas" do cartão/Início: só aparece para quem já enviou. Ex.: "2 receitas enviadas". */
export function recipesSummary(count: number, status?: string | null): string | null {
  if (count <= 0) return null;
  if (count === 1) return myRecipeLine(status) ?? "1 receita enviada";
  return `${count} receitas enviadas`;
}

/** A campanha aceita uma nova receita desta pessoa agora? (usa o campo do servidor; sem ele, deduz pelas datas e pelo limite) */
export function acceptsSubmission(c: CollabCampaignListItem): boolean {
  const s = c.state;
  if (!s.released) return false;
  if (typeof s.can_submit === "boolean") return s.can_submit;
  const reg = phaseOf(stageOf(c, "registration"));
  return reg === "open" && submissionsCount(s) < submissionsMax(c, s) && s.stage !== "closed";
}

export type CardAction = { label: string; to: "" | "/enviar" | "/participacao" | "/votacao" | "/resultado"; emphasis: "primary" | "outline" };

/**
 * Botão do cartão da lista: a ação que faz sentido agora. Usa os campos do servidor quando existem
 * e, se não vierem, deduz pelas datas (lista leve).
 */
export function cardAction(c: CollabCampaignListItem): CardAction {
  const s = c.state;
  const count = submissionsCount(s);
  const reg = phaseOf(stageOf(c, "registration"));
  const vot = hasVoting(c) ? phaseOf(stageOf(c, "voting")) : "unset";
  const canSubmit = s.can_submit ?? (reg === "open" && count < submissionsMax(c, s) && s.stage !== "closed");
  const canVote = hasVoting(c) && (s.can_vote ?? (vot === "open" && !s.has_voted));
  if (!s.released) return { label: "Ver detalhes", to: "", emphasis: "outline" };
  if (s.results_visible || s.stage === "results") return { label: "Ver resultado", to: "/resultado", emphasis: "primary" };
  if (count === 0 && canSubmit) return { label: "Participar", to: "/enviar", emphasis: "primary" };
  if (canVote) return { label: "Votar", to: "/votacao", emphasis: "primary" };
  if (count > 0) return { label: "Minhas receitas", to: "/participacao", emphasis: "outline" };
  return { label: "Ver detalhes", to: "", emphasis: "outline" };
}
