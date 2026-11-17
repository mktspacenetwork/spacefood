import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { TIMEZONE } from "../date-utils";
import type { CampaignStatus, CollabStage, SubmissionStatus, ResultStatus } from "./types";

/** Todas as datas do módulo são exibidas e digitadas no horário de Brasília. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatInTimeZone(new Date(iso), TIMEZONE, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatInTimeZone(new Date(iso), TIMEZONE, "dd/MM/yyyy", { locale: ptBR });
}
export function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatInTimeZone(new Date(iso), TIMEZONE, "dd 'de' MMM", { locale: ptBR });
}
/** ISO (UTC) → valor para <input type="datetime-local"> em Brasília. */
export function toInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return formatInTimeZone(new Date(iso), TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}
/** Valor do <input type="datetime-local"> (Brasília) → ISO (UTC); vazio → null. */
export function fromInputValue(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = fromZonedTime(v, TIMEZONE);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ─────────────────────────── Rótulos e cores ───────────────────────────
// Mesmo padrão de badges do site (amarelo / azul / verde, com variantes dark).
const YELLOW = "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800";
const BLUE = "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800";
const GREEN = "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 border-green-200 dark:border-green-800";
const RED = "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-800";
const GRAY = "bg-muted text-muted-foreground border-border";
const ORANGE = "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-800";
const PURPLE = "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800";

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: GRAY },
  in_review: { label: "Em revisão", className: YELLOW },
  authorized: { label: "Publicada", className: GREEN },
  closed: { label: "Encerrada", className: BLUE },
  archived: { label: "Arquivada", className: GRAY },
};

export const SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; className: string }> = {
  pending_media: { label: "Enviando mídia", className: GRAY },
  submitted: { label: "Enviada", className: BLUE },
  in_review: { label: "Em análise", className: YELLOW },
  approved: { label: "Aprovada", className: GREEN },
  rejected: { label: "Reprovada", className: RED },
};

export const RESULT_STATUS: Record<ResultStatus, { label: string; className: string }> = {
  none: { label: "Sem apuração", className: GRAY },
  preliminary: { label: "Apuração preliminar", className: YELLOW },
  tie_pending: { label: "Empate — decisão pendente", className: ORANGE },
  confirmed: { label: "Vencedor confirmado", className: GREEN },
  announced: { label: "Resultado divulgado", className: PURPLE },
};

/** Etapa que o colaborador enxerga (calculada no banco com o relógio do servidor). */
export const COLLAB_STAGE: Record<CollabStage, { label: string; className: string }> = {
  upcoming: { label: "Em breve", className: GRAY },
  registration: { label: "Inscrições abertas", className: GREEN },
  registration_paused: { label: "Inscrições pausadas", className: ORANGE },
  review: { label: "Em análise", className: YELLOW },
  voting: { label: "Em votação", className: ORANGE },
  voting_paused: { label: "Votação em pausa", className: YELLOW },
  voting_closed: { label: "Votação encerrada", className: BLUE },
  results: { label: "Resultado disponível", className: PURPLE },
  closed: { label: "Encerrada", className: BLUE },
};

export const STAGE_LABEL: Record<string, string> = {
  registration: "Inscrições",
  voting: "Votação",
  results: "Apuração",
  announcement: "Divulgação",
};

/** Ações do histórico, em português. */
export const AUDIT_ACTION: Record<string, string> = {
  CREATE_CAMPAIGN: "Campanha criada", UPDATE_CAMPAIGN: "Campanha editada", SUBMIT_FOR_REVIEW: "Enviada para revisão",
  PUBLISH_CAMPAIGN: "Campanha publicada", SUSPEND_CAMPAIGN: "Campanha suspensa", RESUME_CAMPAIGN: "Campanha retomada",
  BACK_TO_DRAFT: "Voltou a rascunho", CLOSE_CAMPAIGN: "Campanha encerrada", ARCHIVE_CAMPAIGN: "Campanha arquivada",
  DELETE_EMPTY_DRAFT: "Rascunho excluído", DUPLICATE_CAMPAIGN: "Campanha duplicada",
  SET_ELIGIBLE_USERS: "Público (lista de pessoas) alterado", SET_STAGE: "Datas da etapa alteradas",
  EXTEND_STAGE: "Etapa prorrogada", PAUSE_STAGE: "Etapa pausada", REOPEN_STAGE: "Etapa reaberta",
  SUBMIT_RECIPE: "Receita enviada", FINALIZE_SUBMISSION: "Envio da receita concluído", UPDATE_SUBMISSION: "Receita editada",
  ADMIN_EDIT_SUBMISSION: "Receita corrigida pela administração", APPROVE_SUBMISSION: "Receita aprovada",
  REJECT_SUBMISSION: "Receita reprovada", CAST_VOTE: "Voto registrado", INVALIDATE_VOTE: "Voto invalidado",
  END_VOTING_NOW: "Votação encerrada manualmente", CLOSE_VOTING: "Votação apurada", DECIDE_TIE: "Desempate decidido",
  CONFIRM_WINNER: "Vencedor confirmado", ANNOUNCE_RESULTS: "Resultado divulgado", EXPORT_REPORT: "Relatório exportado",
  MODULE_ENABLED: "Módulo ligado", MODULE_DISABLED: "Módulo desligado",
  SET_CAMPAIGN_ADMIN: "Acesso ao módulo alterado", REMOVE_CAMPAIGN_ADMIN: "Acesso ao módulo removido",
};

export const PERMISSION_LABEL: Record<string, { label: string; hint: string; sensitive?: boolean }> = {
  campaigns: { label: "Acessar o módulo", hint: "Ver o menu Campanhas e as campanhas" },
  campaigns_create: { label: "Criar campanhas", hint: "Criar novas campanhas (rascunho)" },
  campaigns_edit: { label: "Editar campanhas", hint: "Alterar dados, público e funcionalidades; arquivar; excluir rascunho vazio" },
  campaigns_duplicate: { label: "Duplicar campanhas", hint: "Criar uma nova campanha a partir de outra" },
  campaigns_publish: { label: "Publicar e suspender", hint: "Publicar, suspender, retomar, encerrar e ligar/desligar o módulo", sensitive: true },
  campaigns_schedule: { label: "Gerir datas e etapas", hint: "Datas, prorrogar, pausar, reabrir e encerrar a votação" },
  campaigns_participants: { label: "Ver participantes", hint: "Lista de participantes e quem enviou receita" },
  campaigns_review: { label: "Analisar receitas", hint: "Aprovar, reprovar e corrigir receitas" },
  campaigns_results: { label: "Ver apuração", hint: "Contagem de votos por receita e ranking" },
  campaigns_export: { label: "Exportar relatórios", hint: "Baixar relatórios sem votos individuais" },
  campaigns_votes_view: { label: "Ver votos individuais", hint: "Quem votou em quem — dado sensível", sensitive: true },
  campaigns_votes_invalidate: { label: "Invalidar votos", hint: "Invalidar um voto com justificativa", sensitive: true },
  campaigns_tiebreak: { label: "Decidir empate", hint: "Registrar o desempate com justificativa", sensitive: true },
  campaigns_winner_confirm: { label: "Confirmar vencedor", hint: "Confirmar oficialmente a receita vencedora", sensitive: true },
  campaigns_announce: { label: "Divulgar resultado", hint: "Divulgar o resultado aos colaboradores", sensitive: true },
  campaigns_export_votes: { label: "Exportar votos individuais", hint: "Baixar a lista de votos por pessoa", sensitive: true },
  campaigns_access: { label: "Gerir acessos ao módulo", hint: "Dar e remover permissões das campanhas", sensitive: true },
};
