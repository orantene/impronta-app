/**
 * originals-policy.ts — who may download the ORIGINAL file, and who gets the
 * web-size one instead.
 *
 * THE DECISION (plan §9, decision 2, already adopted by the owner)
 * ───────────────────────────────────────────────────────────────
 *   "Original-file downloads → owner-only by default; subjects get web-size;
 *    releases can include originals per grant."
 *
 * So: exactly one party may pull the master file — the party that owns the
 * asset. A talent who is IN the photo but does not own it, and a hub the photo
 * was merely released to, both get the web-size render. That is not a
 * punishment; it is the difference between "you may show this" and "you may
 * re-license this", and it is the boundary the whole ownership model exists to
 * draw.
 *
 * WHAT "ORIGINAL" MEANS HERE (read this before extending it)
 * ─────────────────────────────────────────────────────────
 * `variant_kind='original'` in this schema means "un-cropped web-size", NOT
 * "camera master": `lib/server/media-resize.ts` recompresses every photo
 * BEFORE it reaches storage, on every upload path. There is no true master in
 * the bucket today. This policy therefore governs the highest-fidelity file
 * that exists, and it will keep governing the right thing on the day an
 * originals-retention pipeline lands — which is exactly why the gate goes in
 * now rather than after.
 *
 * PURE: no `server-only`, no Supabase import. The action hands it rows it has
 * already loaded, so the same verdict can be unit-tested and shown in UI copy.
 */

import { normalizeOwnershipKind, type MediaOwnershipKind } from "@/lib/media/ownership";

/** What the caller is allowed to receive. */
export type OriginalsAccessLevel = "original" | "web";

export type OriginalsAccessVerdict = {
  level: OriginalsAccessLevel;
  /**
   * Why. Always populated, including on a grant — "never a silent absence" is
   * the standing rule for every lock in this program, and a download that
   * quietly hands back a smaller file is the silent-absence bug in disguise.
   */
  message: string;
  /** Stable code for logs and tests; never shown to a person. */
  reason:
    | "owner_workspace"
    | "owner_talent"
    | "platform_asset"
    | "subject_not_owner"
    | "released_not_owner"
    | "no_relationship";
};

/** The asset's ownership columns, as loaded from `media_assets`. */
export type OriginalsAssetFacts = {
  ownershipKind: unknown;
  ownerTenantId: string | null;
  ownerTalentProfileId: string | null;
};

/**
 * Who is asking. Resolved server-side from the session — never client-supplied,
 * or "owner-only" would mean "whoever says they are the owner".
 */
export type OriginalsViewer = {
  /** The workspace the caller is acting as staff for, if any. */
  tenantId: string | null;
  /** The caller's own talent profile, if they are a talent. */
  talentProfileId: string | null;
};

const OWNER_MESSAGE = "You own this photo, so you can download the original file.";

const SUBJECT_MESSAGE =
  "This photo is owned by the workspace that produced it, so downloads are the web-size version. Ask them to release the original if you need it for print.";

const RELEASED_MESSAGE =
  "This photo was released to you for display, not for download. The owner keeps the original file.";

const NO_RELATIONSHIP_MESSAGE =
  "You can only download originals of photos you own.";

/**
 * The one place the originals rule is decided. Every download or signed-URL
 * path for a media asset must route through here, so "owner-only" cannot mean
 * one thing on the Media page and another in an export.
 */
export function resolveOriginalsAccess(
  asset: OriginalsAssetFacts,
  viewer: OriginalsViewer,
): OriginalsAccessVerdict {
  const kind: MediaOwnershipKind = normalizeOwnershipKind(asset.ownershipKind);

  // Platform starter imagery is shipped to be used. Nobody's master file is at
  // stake, so there is nothing to withhold.
  if (kind === "platform") {
    return {
      level: "original",
      message: "This is platform starter imagery, free for you to use and download.",
      reason: "platform_asset",
    };
  }

  if (kind === "agency") {
    if (viewer.tenantId && asset.ownerTenantId === viewer.tenantId) {
      return { level: "original", message: OWNER_MESSAGE, reason: "owner_workspace" };
    }
    // The person in the photo, but not its owner — plan §9.2 "subjects get
    // web-size".
    if (
      viewer.talentProfileId &&
      asset.ownerTalentProfileId === viewer.talentProfileId
    ) {
      return { level: "web", message: SUBJECT_MESSAGE, reason: "subject_not_owner" };
    }
    // Another workspace looking at a photo that reached them by release.
    if (viewer.tenantId) {
      return { level: "web", message: RELEASED_MESSAGE, reason: "released_not_owner" };
    }
    return { level: "web", message: NO_RELATIONSHIP_MESSAGE, reason: "no_relationship" };
  }

  // Talent-owned: the talent is the owner. A workspace that rosters them may
  // display the photo, and still does not own the file.
  if (viewer.talentProfileId && asset.ownerTalentProfileId === viewer.talentProfileId) {
    return { level: "original", message: OWNER_MESSAGE, reason: "owner_talent" };
  }
  if (viewer.tenantId) {
    return { level: "web", message: RELEASED_MESSAGE, reason: "released_not_owner" };
  }
  return { level: "web", message: NO_RELATIONSHIP_MESSAGE, reason: "no_relationship" };
}

/** Convenience for call sites that only branch on the yes/no. */
export function mayDownloadOriginal(
  asset: OriginalsAssetFacts,
  viewer: OriginalsViewer,
): boolean {
  return resolveOriginalsAccess(asset, viewer).level === "original";
}
