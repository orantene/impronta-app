"use server";

// ============================================================================
// admin-roster-card-badges.ts — per-tenant roster-card badge visibility.
// ============================================================================
//
// Which overlay badges show on admin roster cards: the visibility eye
// (roster-only live show/hide control), trust marks, Discover pill, profile
// completeness, photo count, availability, and the TAL-ID chip. Persisted
// per-tenant in agencies.settings.rosterCardBadges JSONB. agencies.settings is
// staff-only, which is exactly right here — only the admin shell reads these
// (seeded SSR-side through the bridge). No dedicated column, no migration.
//
// Split out of admin-workspace-settings.ts so that god-file stays under its
// max-lines budget; this module owns just the roster-badge action.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  ROSTER_CARD_BADGE_KEYS,
  normalizeRosterCardBadges,
  type RosterCardBadgePrefs,
} from "@/lib/talent-cards/roster-card-badges";

const rosterCardBadgesSchema = z
  .object({
    visibility:   z.boolean().optional(),
    trust:        z.boolean().optional(),
    discover:     z.boolean().optional(),
    completeness: z.boolean().optional(),
    photoCount:   z.boolean().optional(),
    availability: z.boolean().optional(),
    talentId:     z.boolean().optional(),
    categories:   z.boolean().optional(),
    quickView:    z.boolean().optional(),
  })
  .strict();

export type SetRosterCardBadgesInput = z.infer<typeof rosterCardBadgesSchema>;

export type SetRosterCardBadgesResult =
  | { ok: true; data: RosterCardBadgePrefs }
  | { ok: false; error: string };

/**
 * Merge a partial badge-visibility payload into
 * `agencies.settings.rosterCardBadges` and return the full, normalized prefs
 * so the caller can reconcile its optimistic state with the server truth.
 *
 * `agencies` is the tenant-root table (keyed by `id`, not `tenant_id`), so the
 * tenant-scoped-query helper does not model it — every settings writer in the
 * sibling admin-workspace-settings module accesses it the same way, gated by
 * `requireWorkspaceStaffAction` and filtered by `.eq("id", tenantId)`.
 *
 * AUTH (2026-08-04 sweep): the guard is MEMBERSHIP-based, not global-app_role
 * based, and is graded to `agency.site_admin.design.edit` (admin/owner) — the
 * capability the Phase-5 matrix assigns to card/design surfaces. A hybrid
 * workspace owner (talent/client `profiles.app_role`, owner membership) holds
 * it; the previous `requireStaff()` chain rejected them outright.
 */
export async function setRosterCardBadges(
  input: SetRosterCardBadgesInput,
): Promise<SetRosterCardBadgesResult> {
  const auth = await requireWorkspaceStaffAction({
    capability: "agency.site_admin.design.edit",
  });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = rosterCardBadgesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid badge payload.",
    };
  }

  // Read current settings so we merge the rosterCardBadges subset without
  // clobbering sibling keys (branding, watermark, locales, …).
  const { data: agency, error: readErr } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();
  if (readErr) {
    logServerError("admin-roster-card-badges.read", readErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const currentSettings: Record<string, unknown> =
    typeof agency?.settings === "object" && agency.settings !== null
      ? (agency.settings as Record<string, unknown>)
      : {};

  // Start from the normalized current value (fills any missing key with the
  // default = visible) then apply the explicit booleans from this payload.
  const merged = normalizeRosterCardBadges(currentSettings.rosterCardBadges);
  for (const key of ROSTER_CARD_BADGE_KEYS) {
    const value = parsed.data[key];
    if (typeof value === "boolean") merged[key] = value;
  }

  const nextSettings = { ...currentSettings, rosterCardBadges: merged };

  const { error: updateErr } = await supabase
    .from("agencies")
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq("id", tenantId);

  if (updateErr) {
    logServerError("admin-roster-card-badges.update", updateErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: merged };
}
