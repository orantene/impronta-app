/**
 * guest-chat-unified-contract — the unified-inquiry-cart contract slice (Message
 * Impronta plan §5). Split out of guest-chat-contract.ts to keep that barrel under
 * the line cap; re-exported from it so consumers keep importing from one place.
 *
 * Covers: the launcher avatar-stack item (P0-T1), the early-partial inquiry
 * create (ensureGuestChatInquiry, §6.2), and the guest-side structured-detail
 * read used by the panel's inbound realtime reconcile (P1-T3).
 */

import type {
  GuestChatFailure,
  GuestChipKind,
  GuestChipValue,
} from "./guest-chat-contract";

// One talent entry on the launcher rail (P0-T1). Derived at the directory page
// level by joining cartIds with loadTalentCardThumbs() output.
export type AvatarStackItem = {
  talentProfileId: string;
  displayName: string;
  portraitUrl: string | null;
};

// Early-partial inquiry creation (§6.2). ensureGuestChatInquiry creates (or
// resurfaces) a minimal partial row on the first structured commit without
// requiring contact details yet; the id backs all subsequent patches.
export type EnsureGuestInquiryInput = {
  tenantSlug: string;
  talentProfileId?: string | null;
  talentProfileCode?: string | null;
  sourcePage: string;
};

export type EnsureGuestInquiryResult =
  | {
      ok: true;
      inquiryId: string;
      /**
       * True once the row carries a REAL contact (name + email the guest
       * supplied), false while it still holds the synthetic early-row seed
       * (`contact_name='Guest'`, `contact_email='pending-…@guest.impronta'`).
       * The panel uses this to decide whether the ContactCard gate must still
       * run before a first message can be sent. Computed server-side from the
       * row, never by string-matching the placeholder on the client.
       */
      contactPromoted: boolean;
    }
  | GuestChatFailure;

export type EnsureGuestChatInquiryCallback = (
  input: EnsureGuestInquiryInput,
) => Promise<EnsureGuestInquiryResult>;

// Guest-side structured-detail READ (P1-T3 inbound reconcile). Returns the
// current chip values for an inquiry the guest cookie OWNS so the panel can
// reconcile a remote edit back into the live chips after a realtime refresh.
export type GuestInquiryDetailValues = Partial<Record<GuestChipKind, GuestChipValue>>;

export type GetGuestInquiryDetailsResult =
  | { ok: true; capturedKinds: GuestChipKind[]; values: GuestInquiryDetailValues }
  | GuestChatFailure;

export type GetGuestInquiryDetailsCallback = (input: {
  inquiryId: string;
}) => Promise<GetGuestInquiryDetailsResult>;

// Guest-safe public roster read (Phase 2 — TALENT picker). Returns the tenant's
// publicly-visible roster as the lite shape SearchTalentField consumes, so a
// guest can search + add talent in the chat. Public, no PII — only the same
// name/thumb/category a directory card already shows.
export type GuestRosterItem = {
  id: string;
  name: string;
  primaryTypeLabel?: string;
  city?: string;
  photoUrl?: string | null;
};

export type ListGuestTenantRosterResult =
  | { ok: true; roster: GuestRosterItem[] }
  | GuestChatFailure;

export type ListGuestTenantRosterCallback = (input: {
  tenantSlug: string;
}) => Promise<ListGuestTenantRosterResult>;

// Guest-safe cart-portrait BACKFILL (plan §4.A.1 / §5.5 remaining bug). Given the
// cart ids restored from saved_talent on a cold load — which are NOT in the
// client cart-talent-registry because the registry is only seeded by in-session
// adds — resolve each one's displayName + portraitUrl for the CURRENT public
// tenant so every rail avatar shows a face-focus portrait, not initials.
//
// Public information only (the same name + face a directory card already shows),
// scoped to the public tenant; never leaks cross-tenant or non-public talent.
// Reuses the same loadDefaultStorefrontRoster source + loadTalentCardThumbs rank
// as the roster picker. NO migration; cookie-gated service-role read.
export type ResolveGuestCartPortraitsResult =
  | { ok: true; talents: AvatarStackItem[] }
  | GuestChatFailure;

export type ResolveGuestCartPortraitsCallback = (input: {
  tenantSlug: string;
  talentProfileIds: string[];
}) => Promise<ResolveGuestCartPortraitsResult>;
