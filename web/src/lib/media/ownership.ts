/**
 * ownership.ts — the single place that decides what a `media_assets` row's
 * ownership columns say, and what a human should read off them.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `media_assets` has carried `ownership_kind` / `owner_tenant_id` /
 * `uploaded_by_user_id` / `created_by` since migration 20260907180000, and
 * until phase 0 (brand library) every writer left them at their defaults: of
 * 1,894 live talent assets, `uploaded_by_user_id` was set on 6 and
 * `owner_tenant_id` on 0. The product could not answer "who uploaded this?",
 * which is the question every later phase of the media-ownership plan
 * (`web/docs/media-ownership-and-brand-library-plan-2026-08-10.md`) is built
 * on. Phase 1 stamps every writer — and every writer stamps THROUGH here, so
 * "what does a staff upload mean" is one function, not eleven call sites that
 * drift (the `is_publicly_listed` single-gate lesson, applied to ownership).
 *
 * THE MODEL (plan §3, P1) — every asset has exactly one owner:
 *   • talent uploads (talent studio, claimed account) → 'talent'
 *   • workspace uploads (roster gallery, Drive import, staging, branding,
 *     CMS library) → 'agency' + owner_tenant_id = the uploading workspace
 *   • seeded starter/demo imagery → 'platform'
 *
 * Ownership models the working agreement ("who controls where this may appear
 * and who may delete it"), not a copyright register — `attribution_note`
 * carries anything contractual.
 *
 * DB CONSTRAINT: `media_assets_agency_ownership_chk` requires
 * `owner_tenant_id IS NOT NULL` whenever `ownership_kind = 'agency'`. The
 * builders below never emit an 'agency' stamp without a tenant id; a missing
 * tenant degrades to 'talent' rather than failing the INSERT.
 *
 * This module is deliberately pure (no `server-only`, no Supabase import) so
 * the Media page's ownership chips read the same vocabulary the writers use.
 */

export const MEDIA_OWNERSHIP_KINDS = ["talent", "agency", "platform"] as const;

export type MediaOwnershipKind = (typeof MEDIA_OWNERSHIP_KINDS)[number];

/**
 * The exact column set every `media_assets` INSERT should spread. Snake-case
 * on purpose: it is spread straight into a PostgREST insert payload.
 */
export type MediaOwnershipStamp = {
  ownership_kind: MediaOwnershipKind;
  owner_tenant_id: string | null;
  uploaded_by_user_id: string | null;
  created_by: string | null;
};

export function isMediaOwnershipKind(value: unknown): value is MediaOwnershipKind {
  return (
    typeof value === "string" &&
    (MEDIA_OWNERSHIP_KINDS as readonly string[]).includes(value)
  );
}

/** Normalize whatever the DB / a caller handed us into a known kind. */
export function normalizeOwnershipKind(value: unknown): MediaOwnershipKind {
  return isMediaOwnershipKind(value) ? value : "talent";
}

/**
 * Talent-owned: the talent (or whoever acts for them) controls the asset.
 * `owner_tenant_id` stays null — the owner is the subject, not a workspace.
 */
export function talentOwnedStamp(uploaderUserId: string | null): MediaOwnershipStamp {
  return {
    ownership_kind: "talent",
    owner_tenant_id: null,
    uploaded_by_user_id: uploaderUserId,
    created_by: uploaderUserId,
  };
}

/**
 * Workspace-owned: a workspace paid for / produced this and controls where it
 * appears. Degrades to a talent stamp when the tenant is unknown, because the
 * agency check constraint would otherwise reject the row.
 */
export function workspaceOwnedStamp(
  tenantId: string | null,
  uploaderUserId: string | null,
): MediaOwnershipStamp {
  if (!tenantId) return talentOwnedStamp(uploaderUserId);
  return {
    ownership_kind: "agency",
    owner_tenant_id: tenantId,
    uploaded_by_user_id: uploaderUserId,
    created_by: uploaderUserId,
  };
}

/** Platform-owned: starter kits and seeded demo imagery shipped by Tulala. */
export function platformOwnedStamp(uploaderUserId: string | null): MediaOwnershipStamp {
  return {
    ownership_kind: "platform",
    owner_tenant_id: null,
    uploaded_by_user_id: uploaderUserId,
    created_by: uploaderUserId,
  };
}

/**
 * The upload-context switch every dual-auth writer needs: agency staff
 * uploading for a roster talent produce workspace-owned media, the talent
 * uploading on their own surface produces talent-owned media.
 *
 * `actor` mirrors which guard passed (`requireWorkspaceStaffAction` vs
 * `requireTalentSelfAction`) — NOT a caller-supplied field.
 */
export function uploadOwnershipStamp(input: {
  actor: "workspace_staff" | "talent_self" | "platform";
  tenantId: string | null;
  uploaderUserId: string | null;
}): MediaOwnershipStamp {
  if (input.actor === "platform") return platformOwnedStamp(input.uploaderUserId);
  if (input.actor === "workspace_staff") {
    return workspaceOwnedStamp(input.tenantId, input.uploaderUserId);
  }
  return talentOwnedStamp(input.uploaderUserId);
}

/**
 * Derivatives (crops, baked watermarks) inherit the source asset's owner —
 * re-cropping someone's photo does not transfer ownership. The uploader is
 * still recorded as whoever ran the operation.
 */
export function derivedOwnershipStamp(
  source: { ownership_kind?: unknown; owner_tenant_id?: string | null } | null,
  uploaderUserId: string | null,
): MediaOwnershipStamp {
  const kind = normalizeOwnershipKind(source?.ownership_kind);
  if (kind === "agency") {
    return workspaceOwnedStamp(source?.owner_tenant_id ?? null, uploaderUserId);
  }
  if (kind === "platform") return platformOwnedStamp(uploaderUserId);
  return talentOwnedStamp(uploaderUserId);
}

// ─── Reading side: what the Media page shows on a tile ───────────────────────

export type MediaOwnershipTone = "workspace" | "talent" | "platform" | "external";

export type MediaOwnershipChip = {
  kind: MediaOwnershipKind;
  tone: MediaOwnershipTone;
  /** Short tile label. */
  label: string;
  /** Longer explanation for a title attribute / details panel. */
  hint: string;
};

/**
 * Describe an asset's ownership from the point of view of the workspace
 * currently looking at it. `ownedByThisWorkspace` is resolved server-side (the
 * Media bridge knows the tenant id; the client never needs it).
 *
 * Copy note: never a silent absence. A tile the workspace does not own says so
 * in words, because "why can't I use this photo?" is the exact question phase 3
 * turns into a release request.
 */
export function describeMediaOwnership(input: {
  ownershipKind: unknown;
  ownedByThisWorkspace: boolean;
  /** Optional workspace display name, for "Owned by Impronta". */
  workspaceName?: string | null;
}): MediaOwnershipChip {
  const kind = normalizeOwnershipKind(input.ownershipKind);

  if (kind === "platform") {
    return {
      kind,
      tone: "platform",
      label: "Starter",
      hint: "Platform starter imagery, shipped with your workspace. Replace it with your own photos when you are ready.",
    };
  }

  if (kind === "agency") {
    if (input.ownedByThisWorkspace) {
      const name = input.workspaceName?.trim();
      return {
        kind,
        tone: "workspace",
        label: name ? `Owned by ${name}` : "Owned by you",
        hint: "Your workspace uploaded this. You control where it appears and who may reuse it.",
      };
    }
    return {
      kind,
      tone: "external",
      label: "Another workspace",
      hint: "Another workspace owns this photo. It stays on their site unless they release it.",
    };
  }

  return {
    kind,
    tone: "talent",
    label: "Talent's own",
    hint: "The talent owns this photo. It travels with them to any workspace they join.",
  };
}
