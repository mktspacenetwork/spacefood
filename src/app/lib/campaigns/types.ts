// Tipos das respostas da API `campaigns-api` (ver supabase/functions/campaigns-api/index.ts).

export type CampaignStatus = "draft" | "in_review" | "authorized" | "closed" | "archived";
export type StageKey = "registration" | "voting" | "results" | "announcement";
export type SubmissionStatus = "pending_media" | "submitted" | "in_review" | "approved" | "rejected";
export type ResultStatus = "none" | "preliminary" | "tie_pending" | "confirmed" | "announced";
/** Etapa derivada, calculada pelo banco, que o colaborador enxerga. */
export type CollabStage =
  | "upcoming" | "registration" | "registration_paused" | "review" | "open"
  | "voting" | "voting_paused" | "voting_closed" | "results" | "closed";

export type TourConfig = { enabled: boolean; version: number };

export type Features = {
  submission: boolean;
  photos: boolean;
  video: boolean;
  approval: boolean;
  gallery: boolean;
  voting: boolean;
  ranking: boolean;
  results: boolean;
  announcement: boolean;
  tour: TourConfig;
  /** Permite mais de uma receita por colaborador (até MAX_SUBMISSIONS_PER_USER). Ausente = false (uma só). */
  multiple_submissions?: boolean;
};

/** Máximo de fotos por receita (aplicado no banco). `features.photos` desligado = nenhuma foto. */
export const MAX_PHOTOS_PER_RECIPE = 3;
/** Teto técnico de texto (ingredientes e modo de preparo): sem limite prático para uma receita, só proteção. */
export const MAX_RECIPE_TEXT = 20000;
export const MAX_STORY_TEXT = 5000;

/** Teto técnico de receitas por colaborador quando `features.multiple_submissions` está ligado (aplicado no banco). */
export const MAX_SUBMISSIONS_PER_USER = 10;

export type Visibility = {
  /** O administrador pode mostrar o ranking PARCIAL aos colaboradores (padrão: não). Ajustado por `PUT /admin/campaigns/:id/partial-ranking`. */
  show_partial?: boolean;
  ranking_mode: "hidden_until_confirmed" | "after_close" | "live";
  gallery_visibility: "on_approval" | "on_voting_start" | "on_results";
  show_podium: boolean;
  allow_preview: boolean;
};

export type MediaLimits = {
  max_photos: number; // 0–6 (fotos complementares)
  max_photo_mb: number; // 1–5
  allow_video: boolean;
  max_video_mb: number; // 1–50
  require_main_photo: boolean;
};

export type Audience = {
  mode: "all" | "units" | "departments" | "users";
  units?: string[];
  departments?: string[];
};

export const DEFAULT_FEATURES: Features = {
  submission: true, photos: true, video: true, approval: true, gallery: true,
  voting: true, ranking: true, results: true, announcement: true,
  tour: { enabled: true, version: 1 },
};
export const DEFAULT_VISIBILITY: Visibility = {
  ranking_mode: "hidden_until_confirmed", gallery_visibility: "on_approval", show_podium: false, allow_preview: false,
};
export const DEFAULT_MEDIA_LIMITS: MediaLimits = {
  max_photos: 5, max_photo_mb: 5, allow_video: true, max_video_mb: 50, require_main_photo: false,
};

// ───────────────────────────── Colaborador ─────────────────────────────

export type PublicStage = { key: StageKey; starts_at: string | null; ends_at: string | null; paused: boolean };

export type PublicCampaign = {
  id: string;
  slug: string;
  name: string;
  description: string;
  objective: string;
  instructions: string;
  cover_url: string | null;
  features: Features;
  visibility: { show_podium: boolean };
  media_limits: MediaLimits;
  visible_from: string | null;
  stages: PublicStage[];
};

export type CollabState = {
  visible: boolean;
  eligible?: boolean;
  released?: boolean;
  stage?: CollabStage;
  registration?: "unset" | "upcoming" | "open" | "paused" | "closed";
  voting?: "unset" | "upcoming" | "open" | "paused" | "closed";
  locked?: boolean;
  can_submit?: boolean;
  can_edit?: boolean;
  can_vote?: boolean;
  /** Quantas receitas o colaborador já enviou nesta campanha e o máximo permitido (1, ou até 10 com várias). */
  my_submissions_count?: number;
  max_submissions?: number;
  /** O ranking exibido ao colaborador é PARCIAL (o administrador liberou); o oficial só depois da divulgação. */
  ranking_partial?: boolean;
  /**
   * Janela de receita FORA DO PRAZO (rodada 5): campanha com votação, participação já encerrada e resultado ainda não
   * divulgado. Nela o envio continua aceito (`can_submit` = true), mas a receita não concorre à votação. Ausente = não há janela
   * (servidor antigo): a tela se comporta como antes (`can_submit ?? registration === "open"`).
   */
  late_window?: boolean;
  my_submission_id?: string | null;
  my_submission_status?: SubmissionStatus | null;
  has_voted?: boolean;
  voted_at?: string | null;
  voted_submission_id?: string | null;
  gallery_visible?: boolean;
  ranking_visible?: boolean;
  results_visible?: boolean;
  tour?: TourConfig;
};

export type CollabCampaignListItem = PublicCampaign & {
  state: {
    stage: CollabStage; released: boolean; my_submission_status: SubmissionStatus | null;
    /** Opcionais: se o servidor enviar, o botão do cartão usa; senão a lista deduz pelas datas. */
    can_submit?: boolean; can_vote?: boolean; has_voted?: boolean; results_visible?: boolean;
    my_submissions_count?: number; max_submissions?: number;
  };
  /** true quando o período da campanha já acabou (último fim entre inscrições e votação): o slide some da Home. */
  ended: boolean;
};

/**
 * Crédito de uma foto que veio da INTERNET (busca no cadastro da receita). Hoje só Wikimedia Commons (licenças livres: o crédito é a
 * condição de uso). Aparece como "Foto da internet" discreta, com autor, licença e link da fonte.
 */
export type WebPhotoCredit = {
  provider: "wikimedia";
  title: string;
  creator: string;
  /** Nome curto da licença (ex.: "CC BY-SA 4.0", "CC0", "Public domain"). */
  license: string;
  license_url: string | null;
  /** Página da imagem na fonte (para o crédito). */
  source_url: string;
};
export type MediaItem = {
  id: string; kind: "main_photo" | "photo" | "video"; mime: string; size: number; url: string;
  /** Presente só quando a foto veio da internet. */
  web?: WebPhotoCredit | null;
};

/** `GET /campaigns/:slug/image-search?q=` — resultados da busca (miniaturas); nada é copiado até o colaborador escolher uma. */
export type WebImageResult = {
  id: string; thumb_url: string; width: number; height: number;
  title: string; creator: string; license: string; license_url: string | null; source_url: string;
};
export type WebImageSearch = { provider: "wikimedia"; query: string; items: WebImageResult[]; note: string };
/**
 * `POST /campaigns/:slug/media/from-web { id, kind }` — o servidor busca a imagem escolhida na fonte, confere o formato e o tamanho,
 * guarda uma cópia no armazenamento da campanha e devolve o mesmo formato de mídia já enviada, com o crédito. O front inclui esse item
 * na lista `media` do envio/edição da receita, exatamente como uma foto enviada do aparelho.
 */
export type WebImportedMedia = {
  id: string; kind: "main_photo" | "photo"; path: string; mime: string; size: number; web: WebPhotoCredit;
};

export type RecipeListItem = {
  id: string; dish_name: string; author: string; description: string; photo_url: string | null;
  /** Enviada fora do prazo: aparece normalmente, mas não concorre à votação (só o autor vê o aviso). */
  is_late?: boolean;
};
export type RecipeDetail = {
  id: string; dish_name: string; author: string; description: string; ingredients: string; preparation: string;
  media: MediaItem[]; can_vote: boolean; mine: boolean; is_late?: boolean;
};

export type MySubmission = {
  id: string; dish_name: string; description: string; ingredients: string; preparation: string;
  status: SubmissionStatus; rejection_reason: string | null;
  submitted_at: string | null; updated_at: string | null; reviewed_at: string | null; media: MediaItem[];
  /** Enviada fora do prazo (não concorre à votação, ranking nem resultado). Gravado uma vez, no primeiro envio. */
  is_late?: boolean;
};

/** `GET /campaigns/:slug/my-submissions` — todas as receitas do colaborador na campanha (1, ou várias). */
export type MySubmissions = {
  items: MySubmission[];
  count: number;
  max: number;
  can_submit_more: boolean;
  state: CollabState;
  my_vote: { dish_name: string; author: string; at: string | null } | null;
};

export type UploadTicket = {
  id: string; kind: "main_photo" | "photo" | "video"; path: string; mime: string; max_bytes: number; token: string; signedUrl: string;
};

export type VoteCandidate = {
  id: string; dish_name: string; author: string; description: string; mine: boolean; photo_url: string | null; voted: boolean;
};

/** `position` é posição de COMPETIÇÃO (empate divide o lugar: 1º, 1º, 3º). Com zero votos para todos não há posição ("sem votos"). */
export type RankingItem = { position: number; submission_id: string; dish_name: string; author: string; votes: number };

// ─────────────────────────────── Admin ────────────────────────────────

export type AdminPermissionKey =
  | "campaigns" | "campaigns_create" | "campaigns_edit" | "campaigns_duplicate" | "campaigns_publish"
  | "campaigns_schedule" | "campaigns_participants" | "campaigns_review" | "campaigns_results"
  | "campaigns_export" | "campaigns_votes_view" | "campaigns_votes_invalidate" | "campaigns_tiebreak"
  | "campaigns_winner_confirm" | "campaigns_announce" | "campaigns_export_votes" | "campaigns_access";

export type AdminStageRow = { stage_key: StageKey; starts_at: string | null; ends_at: string | null; paused: boolean; campaign_id?: string };

export type AdminCampaignListItem = {
  id: string; slug: string; name: string; status: CampaignStatus;
  visible_from: string | null; authorized_at: string | null; suspended_at: string | null;
  created_at: string; source_campaign_id: string | null; version: number;
  submissions: number; stages: AdminStageRow[];
  /** Campanha EXCLUÍDA (oculta; dados, votos e auditoria ficam guardados e dá para restaurar). Só vem em `GET /admin/campaigns?deleted=1`. */
  deleted_at?: string | null;
};

/**
 * HISTÓRICO DE CAMPANHAS (`GET /admin/campaigns/history`). Campanhas que NÃO aparecem mais na lista principal:
 *  - completed = Concluídas: encerradas pelo admin (`closed`), arquivadas (`archived`) ou que chegaram ao fim normalmente
 *    (`ended`: período acabou e, havendo votação, o resultado já foi DIVULGADO);
 *  - disabled = Desativadas (`suspended`): retiradas de exibição pelo admin (nada é apagado; dá para reativar);
 *  - deleted = Excluídas (`deleted`): ocultas por decisão do admin (exclusão LÓGICA; dá para restaurar).
 * A lista principal (`GET /admin/campaigns?scope=active`) traz só as que não estão aqui (rascunhos, agendadas, publicadas e
 * as já encerradas pelo período mas com resultado ainda por divulgar).
 */
export type HistoryCategory = "completed" | "disabled" | "deleted";
export type HistoryKind = "closed" | "archived" | "ended" | "suspended" | "deleted";
export type AdminHistoryItem = {
  id: string; slug: string; name: string; status: CampaignStatus;
  category: HistoryCategory; kind: HistoryKind;
  /** Só para excluídas: como a campanha estava antes de ser excluída. */
  prior: "closed" | "archived" | "ended" | "suspended" | "draft" | "active" | null;
  /** Quando entrou nessa situação (ISO): encerramento, arquivamento, desativação, exclusão ou fim do período. */
  since: string | null;
  /** Administrador responsável pela ação; null quando foi automático (fim do período). */
  by_name: string | null;
  /** Justificativa gravada na ação, quando houve. */
  reason: string | null;
  created_at: string;
  authorized_at: string | null;
  stages: AdminStageRow[];
  has_voting: boolean;
  /** Receitas enviadas (sem as que ficaram incompletas) e votos válidos: os registros ficam guardados em qualquer situação. */
  submissions: number;
  votes: number;
  result_status: ResultStatus;
  deleted_at: string | null;
  /** reactivate = Reativar (desativada; não reabre períodos já encerrados); restore = Restaurar (excluída); null = não se aplica. */
  restorable: "reactivate" | "restore" | null;
};

export type AdminCampaign = {
  id: string; slug: string; type: string; name: string; description: string; objective: string; instructions: string;
  cover_path: string | null; cover_url: string | null; status: CampaignStatus;
  audience: Audience; features: Features; visibility: Visibility; media_limits: MediaLimits;
  visible_from: string | null; authorized_at: string | null; suspended_at: string | null;
  edit_locked_at: string | null; closed_at: string | null; archived_at: string | null;
  created_at: string; version: number;
  /** Campanha EXCLUÍDA (oculta): o painel mostra o aviso e o botão Restaurar; nada nela pode ser alterado até restaurar. */
  deleted_at?: string | null;
};

export type AdminCampaignDetail = {
  campaign: AdminCampaign;
  stages: AdminStageRow[];
  results: AdminResults | null;
  eligible_user_ids: string[];
};

export type AdminResults = {
  status: ResultStatus;
  computed_at: string | null;
  tally: any[];
  total_valid_votes: number;
  eligible_count: number;
  voters_count: number;
  tie_candidates: string[];
  tie_decision_submission_id: string | null;
  tie_justification: string | null;
  winner_submission_id: string | null;
  winner_votes: number | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  announced_at: string | null;
  /** Divulgação agendada (null = nenhuma). Ao chegar a hora o banco divulga e notifica sozinho, uma única vez. */
  announce_at?: string | null;
  announce_scheduled_by_name?: string | null;
  announce_scheduled_at?: string | null;
};

/**
 * `PUT /admin/campaigns/:id/period` (rodada 5). Até três datas independentes, em sequência estrita quando há votação:
 * participação (`starts_at`..`ends_at`) → votação (`voting_starts_at`..`voting_ends_at`) → divulgação (`announce_at`).
 * `voting_*` AUSENTE (undefined) = modo legado: a votação acompanha a participação (campanhas antigas de janela única).
 * `null` limpa. Sem votação: `voting_*` e `announce_at` são limpos pelo servidor.
 * Erros 422 `INVALID_DATES` trazem `reason`: `voting_before_registration_end` | `announce_before_voting_end` | `announce_without_voting`.
 */
export type PeriodPayload = {
  starts_at: string | null;
  ends_at: string | null;
  voting_starts_at?: string | null;
  voting_ends_at?: string | null;
  /** ISO. A divulgação automática só acontece se o ganhador já estiver confirmado antes dessa data. */
  announce_at?: string | null;
};

/** `GET /tours` — chaves de tour que o usuário logado já viu (histórico por usuário, guardado no servidor). */
export type ToursSeen = { seen: string[] };

export type TallyRow = { submission_id: string; dish_name: string; author: string; votes: number; position?: number };

export type PublishCheck = {
  ok: boolean;
  eligible_count: number;
  items: { key: string; ok: boolean; message: string }[];
};

export type AdminOverview = {
  counts: { total: number; draft: number; scheduled: number; active: number; closed: number; with_results: number; /** desativadas (não contam como ativas) */ disabled?: number };
  enabled: boolean;
  recent: { occurred_at: string; actor_name: string; action: string; entity_type: string; campaign_id: string | null }[];
};

export type AdminDashboard = {
  eligible: number; submissions: number; pending: number; approved: number; rejected: number; participants: number;
  votes_registered: number; votes_valid: number; votes_invalidated: number; voters: number;
  participation_pct: number; voting_pct: number;
  results: Partial<AdminResults> | null; stages: AdminStageRow[]; locked: boolean; tally?: TallyRow[];
  /** Legado: a contagem por receita agora vem sempre em `tally` (acompanhamento ao vivo da gestão). */
  results_locked?: boolean; voting_ends_at?: string | null;
  /** true enquanto a votação está aberta: o ranking em `tally` é PARCIAL (só a gestão vê). */
  voting_live?: boolean;
};

export type AdminSubmissionRow = {
  id: string; user_id: string; user_name: string; user_department: string; dish_name: string; status: SubmissionStatus;
  submitted_at: string | null; reviewed_at: string | null; rejection_reason: string | null; content_version: number;
  /** Fora do prazo: aceita depois do encerramento da participação; fica fora da votação, do ranking e do resultado. */
  is_late?: boolean;
};

export type AdminSubmissionDetail = {
  submission: AdminSubmissionRow & {
    description: string; ingredients: string; preparation: string; user_unit: string; reviewed_by_name: string | null;
  };
  media: MediaItem[];
  history: { occurred_at: string; actor_name: string; action: string; before: any; after: any; reason: string | null }[];
  locked: boolean;
  can_view_votes: boolean;
};

export type AdminParticipant = {
  user_id: string; user_name: string; department: string; unit: string;
  submission_id: string | null; submission_status: SubmissionStatus | null; submitted_at: string | null;
  voted: boolean | null; voted_at: string | null;
  /** A receita deste participante foi enviada fora do prazo. */
  is_late?: boolean;
};

export type AdminVote = {
  id: string; voter_name: string; submission_id: string; dish_name: string; created_at: string;
  invalidated_at: string | null; invalidated_by_name: string | null; invalidation_reason: string | null;
};

export type AdminAuditRow = {
  id: number; occurred_at: string; actor_name: string; actor_role: string; action: string;
  entity_type: string; entity_id: string; before: any; after: any; reason: string | null;
};

export type AdminAccessRow = { user_id: string; user_name: string; permissions: Record<string, boolean>; added_at: string };

export type ExportPayload = {
  kind: string; columns: string[]; rows: unknown[][];
  /** Período efetivamente aplicado (ISO); ausente/nulo = todo o período. O relatório `result` ignora o período. */
  range?: { from: string | null; to: string | null } | null;
};

/** `GET /admin/campaigns/:id/analytics[?units=1]` — dashboard dos relatórios (dias em horário de Brasília). */
export type AnalyticsDay = { d: string; submitted: number; approved: number; rejected: number; votes: number };
export type AdminAnalytics = {
  /** Instante (ISO) em que o servidor calculou — a tela mostra "Atualizado às HH:mm" a partir daqui. */
  generated_at: string;
  stages: AdminStageRow[];
  /** A campanha tem votação ligada (sem votação não há votos/ranking/funil de voto). */
  has_voting: boolean;
  /** Votação aberta/pausada: o ranking em `tally` é parcial (só a gestão vê). */
  voting_live: boolean;
  totals: {
    eligible: number; participants: number; submissions: number; pending: number; approved: number; rejected: number;
    /** Receitas enviadas fora do prazo. */
    late: number;
    votes_valid: number; votes_invalidated: number; voters: number; participation_pct: number; voting_pct: number;
  };
  series: { from: string | null; to: string | null; days: AnalyticsDay[] };
  /** Só receitas aprovadas e NO PRAZO; `position` de competição. */
  tally?: TallyRow[];
  /** Só com `?units=1` e permissão `campaigns_participants`. */
  by_unit?: { unit: string; eligible: number; sent: number; voted: number }[];
};

/** Votos individuais: `locked` enquanto a votação não encerrou (nesse caso `items` vem vazio). */
export type AdminVotesPayload = { locked: boolean; items: AdminVote[] };
/** Resultado/apuração: `tally_locked` enquanto a votação não encerrou (nesse caso `tally` vem vazio). */
export type AdminResultsPayload = { results: AdminResults | null; tally: TallyRow[]; tally_locked?: boolean };

// ───────────────────────── Livro de Receitas ─────────────────────────

export type BookPhoto = { url: string; kind: "main_photo" | "photo"; /** Foto da internet: crédito obrigatório (Livro e PDF). */ web?: WebPhotoCredit | null };

export type BookRecipe = {
  id: string;
  position: number;
  dish_name: string;
  author: string;
  /** "História e memória afetiva" (pode vir vazia). */
  story: string;
  /** Texto original com quebras de linha; a tela separa em lista. */
  ingredients: string;
  /** Texto original com quebras de linha; a tela separa em etapas. */
  preparation: string;
  photos: BookPhoto[];
};

// ─────────────── Livro de Receitas: UM acervo único e permanente ───────────────

/**
 * Público do Livro de Receitas (rodada 6): todos os colaboradores OU só pessoas específicas. Padrão = todos. Quem não está no público
 * não vê o livro (nem o card nem a rota: resposta idêntica a "livro não publicado").
 */
export type BookAudience = { mode: "all" | "users"; user_ids: string[] };
export type RecipeBookSettings = { published: boolean; auto_include: boolean; audience?: BookAudience };

/** Linha da lista do administrador. `ref` é opaco ("s:<receita>" ou "e:<entrada>") e identifica a receita em todas as ações. */
export type AdminBookItem = {
  ref: string;
  /** campaign = vem de uma receita enviada em campanha (autoria original preservada); manual = cadastrada pela administração. */
  source: "campaign" | "manual";
  /** Só para source=campaign: entrou sozinha (auto) ou foi adicionada pelo administrador (added). */
  via: "auto" | "added" | null;
  status: "in_book" | "removed";
  dish_name: string;
  author: string;
  campaign_name: string | null;
  campaign_id: string | null;
  submission_id: string | null;
  photo_url: string | null;
  /** O administrador editou o texto do livro (o cadastro original da campanha não muda). */
  edited: boolean;
  created_at: string | null;
};

export type AdminRecipeBook = {
  settings: RecipeBookSettings;
  counts: { in_book: number; removed: number; manual: number; from_campaigns: number };
  items: AdminBookItem[];
};

export type AdminBookItemDetail = AdminBookItem & {
  story: string;
  ingredients: string;
  preparation: string;
  photos: BookPhoto[];
  /** Só para source=campaign: o texto original do cadastro, para comparar com a versão do livro. */
  original: null | { dish_name: string; story: string; ingredients: string; preparation: string };
};

/** Receita aprovada de campanha que ainda NÃO está no livro (para "Adicionar da plataforma"). */
export type BookCandidate = { submission_id: string; dish_name: string; author: string; campaign_name: string; photo_url: string | null };

export type RecipeBookRecipe = BookRecipe & { campaign_name: string | null };

/** `GET /recipe-book` (colaborador; 404 BOOK_UNAVAILABLE enquanto não estiver publicado). */
export type RecipeBookView = { title: string; generated_at: string; recipes: RecipeBookRecipe[] };
