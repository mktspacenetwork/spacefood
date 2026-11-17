import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { TIMEZONE } from "../../lib/date-utils";
import type { CollabCampaignListItem, CollabState, PublicCampaign, PublicStage } from "../../lib/campaigns/types";

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

/** Período da campanha: o das inscrições (com votação, é o mesmo período). Ex.: "5 a 15 nov", "28 out a 3 nov". */
export function periodText(c: Pick<PublicCampaign, "stages">): string | null {
  const reg = c.stages.find((s) => s.key === "registration");
  const start = reg?.starts_at;
  const end = reg?.ends_at;
  if (!start && !end) return null;
  if (start && end) {
    const sameMonth = fmt(start, "M/yyyy") === fmt(end, "M/yyyy");
    if (fmt(start, "d/M/yyyy") === fmt(end, "d/M/yyyy")) return `${fmt(start, "d")} ${fmt(start, "MMM")}`;
    return sameMonth
      ? `${fmt(start, "d")} a ${fmt(end, "d")} ${fmt(end, "MMM")}`
      : `${fmt(start, "d")} ${fmt(start, "MMM")} a ${fmt(end, "d")} ${fmt(end, "MMM")}`;
  }
  if (start) return `A partir de ${fmt(start, "d")} ${fmt(start, "MMM")}`;
  return `Até ${fmt(end!, "d")} ${fmt(end!, "MMM")}`;
}

/** Fim da campanha (ISO) = o maior encerramento entre inscrições e votação; null se não há data. */
export function campaignEnd(c: Pick<PublicCampaign, "stages" | "features">): string | null {
  const ends = c.stages
    .filter((s) => s.key === "registration" || (s.key === "voting" && c.features.voting))
    .map((s) => s.ends_at)
    .filter((x): x is string => !!x)
    .sort();
  return ends.length ? ends[ends.length - 1] : null;
}

export type StatusTone = "open" | "soon" | "closed" | "paused" | "done";
export type CampaignStatusInfo = { text: string; tone: StatusTone };

function combine(reg: Phase, vot: Phase, hasVoting: boolean): CampaignStatusInfo {
  if (reg === "open" && vot === "open") return { text: "Inscrições e votação abertas", tone: "open" };
  if (reg === "open") return { text: "Inscrições abertas", tone: "open" };
  if (vot === "open") return { text: "Votação aberta", tone: "open" };
  if (reg === "paused" || vot === "paused") return { text: "Em pausa", tone: "paused" };
  if (reg === "upcoming" || vot === "upcoming") return { text: "Em breve", tone: "soon" };
  if (reg === "closed" || vot === "closed") return { text: hasVoting ? "Encerrada" : "Inscrições encerradas", tone: "closed" };
  return { text: "Em breve", tone: "soon" };
}

/** Status curto para o cartão da lista (calculado pelas datas). */
export function statusOfListItem(c: CollabCampaignListItem): CampaignStatusInfo {
  if (!c.state.released) return { text: "Em breve", tone: "soon" };
  if (c.state.stage === "results") return { text: "Resultado disponível", tone: "done" };
  const reg = phaseOf(c.stages.find((s) => s.key === "registration"));
  const vot = c.features.voting ? phaseOf(c.stages.find((s) => s.key === "voting")) : "unset";
  return combine(reg, vot, c.features.voting);
}

/** Status curto para a tela da campanha (o servidor já calculou registration/voting). */
export function statusOfDetail(c: PublicCampaign, s: CollabState): CampaignStatusInfo {
  if (!s.released) return { text: "Em breve", tone: "soon" };
  if (s.results_visible) return { text: "Resultado disponível", tone: "done" };
  return combine(s.registration ?? "unset", c.features.voting ? (s.voting ?? "unset") : "unset", c.features.voting);
}

/** Texto curto do status da receita da própria pessoa. */
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
