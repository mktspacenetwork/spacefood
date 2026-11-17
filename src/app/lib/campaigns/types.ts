// Tipos das respostas da API `campaigns-api` (ver supabase/functions/campaigns-api/index.ts).

export type CampaignStatus = "draft" | "in_review" | "authorized" | "closed" | "archived";
export type StageKey = "registration" | "voting" | "results" | "announcement";
export type SubmissionStatus = "pending_media" | "submitted" | "in_review" | "approved" | "rejected";
export type ResultStatus = "none" | "preliminary" | "tie_pending" | "confirmed" | "announced";
/** Etapa derivada, calculada pelo banco, que o colaborador enxerga. */
export type CollabStage =
  | "upcoming" | "registration" | "registration_paused" | "review"
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
};

export type Visibility = {
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
  state: { stage: CollabStage; released: boolean; my_submission_status: SubmissionStatus | null };
};

export type MediaItem = { id: string; kind: "main_photo" | "photo" | "video"; mime: string; size: number; url: string };

export type RecipeListItem = { id: string; dish_name: string; author: string; description: string; photo_url: string | null };
export type RecipeDetail = {
  id: string; dish_name: string; author: string; description: string; ingredients: string; preparation: string;
  media: MediaItem[]; can_vote: boolean; mine: boolean;
};

export type MySubmission = {
  id: string; dish_name: string; description: string; ingredients: string; preparation: string;
  status: SubmissionStatus; rejection_reason: string | null;
  submitted_at: string | null; updated_at: string | null; reviewed_at: string | null; media: MediaItem[];
};

export type UploadTicket = {
  id: string; kind: "main_photo" | "photo" | "video"; path: string; mime: string; max_bytes: number; token: string; signedUrl: string;
};

export type VoteCandidate = {
  id: string; dish_name: string; author: string; description: string; mine: boolean; photo_url: string | null; voted: boolean;
};

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
};

export type AdminCampaign = {
  id: string; slug: string; type: string; name: string; description: string; objective: string; instructions: string;
  cover_path: string | null; cover_url: string | null; status: CampaignStatus;
  audience: Audience; features: Features; visibility: Visibility; media_limits: MediaLimits;
  visible_from: string | null; authorized_at: string | null; suspended_at: string | null;
  edit_locked_at: string | null; closed_at: string | null; archived_at: string | null;
  created_at: string; version: number;
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
};

export type TallyRow = { submission_id: string; dish_name: string; author: string; votes: number };

export type PublishCheck = {
  ok: boolean;
  eligible_count: number;
  items: { key: string; ok: boolean; message: string }[];
};

export type AdminOverview = {
  counts: { total: number; draft: number; scheduled: number; active: number; closed: number; with_results: number };
  enabled: boolean;
  recent: { occurred_at: string; actor_name: string; action: string; entity_type: string; campaign_id: string | null }[];
};

export type AdminDashboard = {
  eligible: number; submissions: number; pending: number; approved: number; rejected: number; participants: number;
  votes_registered: number; votes_valid: number; votes_invalidated: number; voters: number;
  participation_pct: number; voting_pct: number;
  results: Partial<AdminResults> | null; stages: AdminStageRow[]; locked: boolean; tally?: TallyRow[];
  /** true enquanto a votação não encerrou: o servidor não envia contagem por receita. */
  results_locked?: boolean; voting_ends_at?: string | null;
};

export type AdminSubmissionRow = {
  id: string; user_id: string; user_name: string; user_department: string; dish_name: string; status: SubmissionStatus;
  submitted_at: string | null; reviewed_at: string | null; rejection_reason: string | null; content_version: number;
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

export type ExportPayload = { kind: string; columns: string[]; rows: unknown[][] };

/** Votos individuais: `locked` enquanto a votação não encerrou (nesse caso `items` vem vazio). */
export type AdminVotesPayload = { locked: boolean; items: AdminVote[] };
/** Resultado/apuração: `tally_locked` enquanto a votação não encerrou (nesse caso `tally` vem vazio). */
export type AdminResultsPayload = { results: AdminResults | null; tally: TallyRow[]; tally_locked?: boolean };
