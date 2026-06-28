import "server-only";

/**
 * inquiry-receipt-data.ts — Jon Inquiry 360, Phase 2 (the SENT->RECEIVED beat).
 *
 * Assembles the post-send trust receipt the guest mini-chat pins to the top of
 * the now-shared thread once the inquiry is genuinely sent. Every field is
 * TIERED BY TRUTH so the card never over-claims:
 *
 *   • coordinator      — resolved from inquiries.coordinator_id → profiles. Null
 *                        until one is seated (Tier 3 → no face/name, no time).
 *   • typicalReplyLabel— the honest reply FRAGMENT, null below the 3-sample floor
 *                        (Tier 2 → omit the time line; never a fabricated number).
 *   • contactEmail     — the guest's REAL email, null while the row still carries
 *                        the synthetic pending-…@guest.impronta seed.
 *   • receivedAt       — coordinator_assigned_at, falling back to created_at.
 *   • owningPartyCount — distinct owning agencies/workspaces in the lineup; > 1
 *                        GATES the single-agency framing (the card goes NEUTRAL).
 *   • lineup           — the talent faces, resolved from the public roster source
 *                        (byte-identical to the directory cards / launcher rail).
 *
 * READ-ONLY + service-role: it never writes, and it is only invoked AFTER the
 * caller has proven the guest owns the inquiry (loadOwnedInquiry). No migration.
 *
 * The "is this actually sent?" predicate lives here (isReceiptVisibleStatus) so
 * the suppress-the-duplicate-auto-ack filter and the card both agree on one rule.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { getTypicalReplyLabel } from "@/lib/inquiry/guest-reply-latency";
import { loadCrossTenantContext } from "@/lib/inquiry/cross-tenant-context";
import { loadDefaultStorefrontRoster } from "@/lib/home/default-storefront-roster";
import type {
  InquiryReceiptData,
  InquiryReceiptLineupFace,
} from "@/lib/inquiry/guest-chat-contract";

// The inquiry statuses at which the SENT->RECEIVED receipt is shown. A receipt
// is only honest once the inquiry has actually left the draft airlock. "draft"
// is the private pre-send row; everything from "submitted" onward has reached a
// coordinator queue. (Terminal/closed statuses still resume — see
// getActiveGuestInquiry — but the caller decides whether to compute a receipt.)
const RECEIPT_VISIBLE_STATUSES = new Set([
  "submitted",
  "coordination",
  "coordinating",
]);

/**
 * True when the inquiry's status means it has genuinely been sent (so the
 * pinned receipt should render AND the thin auto-ack bubble should be
 * suppressed in its favor). Draft / unknown = false.
 */
export function isReceiptVisibleStatus(status: string | null | undefined): boolean {
  return RECEIPT_VISIBLE_STATUSES.has((status ?? "").trim());
}

/**
 * Resolve the coordinator-of-record's guest-safe display name + avatar.
 * Returns null when no coordinator is seated (Tier 3). Never leaks email/PII —
 * only the display name + avatar a coordinator chose to present.
 */
async function resolveCoordinator(
  admin: SupabaseClient,
  coordinatorId: string | null,
): Promise<InquiryReceiptData["coordinator"]> {
  if (!coordinatorId) return null;
  const { data, error } = await admin
    .from("profiles")
    .select("display_name, full_name, avatar_url")
    .eq("id", coordinatorId)
    .maybeSingle();
  if (error) {
    logServerError("inquiry-receipt-data.resolveCoordinator", error);
    return null;
  }
  if (!data) return null;
  const displayName =
    ((data.display_name as string | null)?.trim() ||
      (data.full_name as string | null)?.trim() ||
      "") || null;
  // No usable name = treat as unassigned rather than render an empty face.
  if (!displayName) return null;
  return {
    displayName,
    avatarUrl: (data.avatar_url as string | null)?.trim() || null,
  };
}

/**
 * Resolve the lineup faces for the inquiry — the talent the inquiry is about.
 * Reuses the public default-storefront roster so each face is byte-identical to
 * the directory card / launcher rail. Talent absent from the public roster are
 * simply omitted (never leaked, never resolved cross-tenant).
 */
async function resolveLineup(
  admin: SupabaseClient,
  inquiryId: string,
  tenantId: string,
): Promise<InquiryReceiptLineupFace[]> {
  const { data: parts, error } = await admin
    .from("inquiry_participants")
    .select("talent_profile_id")
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent")
    .not("talent_profile_id", "is", null);
  if (error) {
    logServerError("inquiry-receipt-data.resolveLineup", error);
    return [];
  }
  const wanted = new Set(
    (parts ?? [])
      .map((p) => p.talent_profile_id as string | null)
      .filter((id): id is string => !!id),
  );
  if (wanted.size === 0) return [];
  const roster = await loadDefaultStorefrontRoster(tenantId);
  return roster
    .filter((r) => wanted.has(r.id))
    .map((r) => ({
      talentProfileId: r.id,
      displayName: r.name,
      portraitUrl: r.thumb,
    }));
}

type BuildReceiptInput = {
  admin: SupabaseClient;
  inquiryId: string;
  tenantId: string;
  status: string;
};

/**
 * Build the full receipt for a SENT inquiry. Returns null when the inquiry is
 * not in a receipt-visible status (the caller short-circuits on null). Every
 * sub-resolve is best-effort: a single failure degrades that field to its
 * honest null/empty rather than failing the whole thread load.
 */
export async function buildInquiryReceipt(
  input: BuildReceiptInput,
): Promise<InquiryReceiptData | null> {
  const { admin, inquiryId, tenantId, status } = input;
  if (!isReceiptVisibleStatus(status)) return null;

  try {
    // The contact + coordinator + timestamp live on the inquiry row.
    const { data: row, error } = await admin
      .from("inquiries")
      .select(
        "coordinator_id, coordinator_assigned_at, created_at, contact_email, contact_name",
      )
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      logServerError("inquiry-receipt-data.buildInquiryReceipt/load", error);
      return null;
    }
    if (!row) return null;

    const coordinatorId = (row.coordinator_id as string | null) ?? null;
    const rawEmail = ((row.contact_email as string | null) ?? "").trim();
    // Honest contact email only — never surface the synthetic seed.
    const isSeedEmail =
      rawEmail.toLowerCase().startsWith("pending-") &&
      rawEmail.toLowerCase().endsWith("@guest.impronta");
    const contactEmail = !rawEmail || isSeedEmail ? null : rawEmail;

    // Spec gate: the receipt renders once the inquiry is SENT — status (checked
    // above) AND the contact promoted. A submitted/coordination row that still
    // carries the seed email never truly reached the agency (a manual status
    // nudge, say), so suppress the receipt rather than claim a send that the
    // guest did not make. Mirrors the contactPromoted flag (no string-match on
    // the client). The common send path promotes both atomically, so this only
    // guards the edge case.
    const rawName = ((row.contact_name as string | null) ?? "").trim();
    const isSeedContact = isSeedEmail || (rawName === "Guest" && rawEmail.length === 0);
    if (isSeedContact) return null;

    const receivedAt =
      (row.coordinator_assigned_at as string | null)?.trim() ||
      (row.created_at as string | null)?.trim() ||
      null;

    // The lineup faces, the coordinator, the honest reply fragment, and the
    // distinct owning-agency count are independent reads — fan them out.
    const [lineup, coordinator, owningPartyCount, agencyName] = await Promise.all([
      resolveLineup(admin, inquiryId, tenantId),
      resolveCoordinator(admin, coordinatorId),
      resolveOwningPartyCount(admin, inquiryId),
      resolveAgencyName(admin, tenantId),
    ]);

    // The honest reply fragment, narrowed to the lineup's first talent when
    // resolvable (the helper falls back to the tenant-wide median, and returns
    // null below the 3-sample floor — never a fabricated duration).
    const typicalReplyLabel = await getTypicalReplyLabel({
      tenantId,
      talentProfileId: lineup[0]?.talentProfileId ?? null,
    });

    return {
      coordinator,
      typicalReplyLabel,
      contactEmail,
      receivedAt,
      owningPartyCount,
      lineup,
      agencyName,
    };
  } catch (err) {
    logServerError("inquiry-receipt-data.buildInquiryReceipt", err);
    return null;
  }
}

/**
 * Count the DISTINCT owning agencies/workspaces in the lineup. Reuses the
 * cross-tenant context RPC (one row per distinct owning party). 0/1 = the
 * normal single-agency tiers; > 1 = the cross-agency GATE.
 */
async function resolveOwningPartyCount(
  admin: SupabaseClient,
  inquiryId: string,
): Promise<number> {
  try {
    const ctx = await loadCrossTenantContext(admin, inquiryId);
    return ctx.parties.length;
  } catch {
    return 0;
  }
}

async function resolveAgencyName(
  admin: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("agencies")
    .select("display_name")
    .eq("id", tenantId)
    .maybeSingle();
  return (data?.display_name as string | null)?.trim() || null;
}
