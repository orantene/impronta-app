/**
 * Pitch feature — shared types.
 *
 * The data shapes mirror the schema in
 * `supabase/migrations/20260908000000_pitches.sql` and the binding spec at
 * `docs/plans/pitch-feature-execution-plan-2026-05-07.md`.
 *
 * Engine functions are tenant-scoped by argument; nothing in this module
 * reads `auth.uid()` or session state. That's the server-action layer's job.
 */

export const PITCH_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "edited",
  "converted",
  "declined",
  "cancelled",
  "expired",
] as const;
export type PitchStatus = (typeof PITCH_STATUSES)[number];

export const PITCH_SHARE_CHANNELS = ["whatsapp", "email", "copy_link"] as const;
export type PitchShareChannel = (typeof PITCH_SHARE_CHANNELS)[number];

export const PITCH_ATTACHMENT_KINDS = ["image", "pdf", "other"] as const;
export type PitchAttachmentKind = (typeof PITCH_ATTACHMENT_KINDS)[number];

export const PITCH_EVENT_ACTOR_ROLES = [
  "staff",
  "recipient",
  "guest",
  "system",
] as const;
export type PitchEventActorRole = (typeof PITCH_EVENT_ACTOR_ROLES)[number];

/**
 * Statuses where the pitch is a live, viewable object.
 * Used for the "this pitch is no longer active" guard on the public landing.
 */
export const VIEWABLE_PITCH_STATUSES: ReadonlyArray<PitchStatus> = [
  "sent",
  "viewed",
  "edited",
];

/** Statuses where the pitch is final — cannot be modified by anyone. */
export const TERMINAL_PITCH_STATUSES: ReadonlyArray<PitchStatus> = [
  "converted",
  "declined",
  "cancelled",
  "expired",
];

export type PitchRecipientContact = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
};

export type PitchBrief = {
  event_date?: string | null; // ISO date
  event_location?: string | null;
  rate_hint?: string | null;
  event_type_id?: string | null;
};

export type PitchRow = {
  id: string;
  tenant_id: string;
  created_by_user_id: string | null;
  parent_pitch_id: string | null;
  share_token_id: string;
  status: PitchStatus;
  recipient_user_id: string | null;
  recipient_contact: PitchRecipientContact;
  share_channel: PitchShareChannel | null;
  personal_note: string | null;
  brief: PitchBrief;
  expires_at: string | null;
  internal_notes: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  converted_inquiry_id: string | null;
  converted_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PitchTalentRow = {
  id: string;
  tenant_id: string;
  pitch_id: string;
  talent_profile_id: string;
  position: number;
  admin_note: string | null;
  removed_by_client_at: string | null;
  created_at: string;
};

/**
 * Result type for engine + server-action functions. Discriminated union
 * keeps callers from forgetting to check `ok` before reading data.
 */
export type PitchResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason: PitchErrorReason;
      message?: string;
    };

export type PitchErrorReason =
  | "not_authenticated"
  | "forbidden"
  | "tenant_not_found"
  | "pitch_not_found"
  | "talent_not_in_tenant"
  | "talent_not_publishable"
  | "invalid_status_transition"
  | "expired"
  | "cancelled"
  | "already_converted"
  | "draft_required"
  | "no_talents"
  | "token_invalid"
  | "token_expired"
  | "token_revoked"
  | "validation_failed"
  | "internal_error";

export type CreatePitchDraftInput = {
  tenantId: string;
  actorUserId: string;
  recipientUserId?: string | null;
  recipientContact?: PitchRecipientContact;
  talentProfileIds: string[];
  personalNote?: string | null;
  brief?: PitchBrief;
  expiresAt?: string | null;
  internalNotes?: string | null;
  parentPitchId?: string | null;
  /** Optional per-talent admin notes, keyed by talent_profile_id. */
  talentNotes?: Record<string, string>;
};

export type UpdatePitchDraftInput = {
  tenantId: string;
  pitchId: string;
  actorUserId: string;
  recipientUserId?: string | null;
  recipientContact?: PitchRecipientContact;
  talentProfileIds?: string[];
  personalNote?: string | null;
  brief?: PitchBrief;
  expiresAt?: string | null;
  internalNotes?: string | null;
  talentNotes?: Record<string, string>;
};

export type SendPitchInput = {
  tenantId: string;
  pitchId: string;
  actorUserId: string;
  channel: PitchShareChannel;
};

export type ConvertPitchInput = {
  token: string;
  /**
   * For guest recipients — the form on the public landing collects these
   * before conversion. Existing-account recipients can leave empty.
   */
  contactInfo?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    message?: string | null;
  };
  /**
   * If the recipient is signed in, the auth user id. The convert action
   * uses this to set inquiry.client_user_id and skip guest contact capture.
   */
  recipientUserId?: string | null;
};

export type SentPitchOutput = {
  pitchId: string;
  shareToken: string;
  shareUrl: string;
  expiresAt: Date;
  whatsappDeepLink: string | null;
  emailDeepLink: string | null;
};

export type ConvertedPitchOutput = {
  inquiryId: string;
  pitchId: string;
};

/** Common pitch-event types written to pitch_events.event_type. */
export const PITCH_EVENT_TYPES = {
  CREATED: "created",
  UPDATED: "updated",
  SENT: "sent",
  VIEWED: "viewed",
  TALENT_REMOVED: "talent_removed",
  DECLINED: "declined",
  CONVERTED: "converted",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  TRUST_BYPASS: "pitch_curated_override",
} as const;

export type PitchEventType =
  (typeof PITCH_EVENT_TYPES)[keyof typeof PITCH_EVENT_TYPES];
