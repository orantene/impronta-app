"use server";

/**
 * admin-tracking.ts — read + connect/disconnect for the analytics and
 * advertising accounts on Website → Setup → Tracking.
 *
 * AUTH — owner class, matching the custom-code library next to it
 * ──────────────────────────────────────────────────────────────
 * Gated on `manage_agency_domains`, which `roles.ts` grants to `owner` and NOT
 * to `admin` (asserted in `access/roles.transaction-capabilities.test.ts`).
 * Connecting a tracker puts a third party's JavaScript on every page of the live
 * public site and starts sending that third party the tenant's visitors. That is
 * the same class of act as pointing the domain somewhere else, and the same
 * class as the custom-code library, which is why it reuses that gate rather than
 * the editor-tier `agency.site_admin.pages.edit` the neighbouring Redirects
 * surface uses. It also has a data-protection edge the page-copy tier does not:
 * whoever turns a pixel on is the person deciding what the agency shares about
 * its visitors.
 *
 * TENANT SCOPE
 * ────────────
 * `requireWorkspaceStaffAction` resolves the tenant from the caller's ACTIVE
 * workspace scope and proves an active membership whose role grants the
 * capability. `tenantId` therefore never comes from client input. The only
 * client inputs are the provider key (checked against a closed list) and the ID
 * itself (checked against that provider's anchored pattern before it is stored).
 *
 * There is no `.from()` in this file on purpose: the `agencies.settings`
 * read-modify-write lives in `site-admin/server/tracking-settings.ts`, the same
 * split `page-role-actions.ts` uses, so the privileged write has one home.
 *
 * CACHE
 * ─────
 * Writes bust the tenant `storefront` tag, which `loadTenantTracking` is tagged
 * with, so connecting or disconnecting is live on the next storefront request
 * rather than at TTL expiry.
 */

import { updateTag } from "next/cache";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  isTrackingProviderId,
  normalizeTrackingId,
  type TenantTrackingConfig,
  type TrackingProviderId,
} from "@/lib/site-admin/tracking";
import {
  readTenantTracking,
  writeTenantTrackingId,
} from "@/lib/site-admin/server/tracking-settings";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type TrackingReadResult =
  | { ok: true; config: TenantTrackingConfig }
  | { ok: false; error: string };

export type TrackingSaveResult =
  | { ok: true; config: TenantTrackingConfig }
  | { ok: false; error: string };

/** Every action starts here; there is no path to a write that skips it. */
async function guard() {
  return requireWorkspaceStaffAction({ capability: "manage_agency_domains" });
}

/** What this workspace currently has connected. */
export async function readTrackingSettings(): Promise<TrackingReadResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, error: auth.error };

  const svc = createServiceRoleClient();
  if (!svc) return { ok: false, error: CLIENT_ERROR.generic };
  try {
    return { ok: true, config: await readTenantTracking(svc, auth.tenantId) };
  } catch (err) {
    logServerError("admin-tracking.read", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

/**
 * Connect one provider, or disconnect it by sending an empty value.
 *
 * A malformed ID is REFUSED with a plain sentence rather than stored. That is
 * the point of the surface: a silently wrong ID is a tracker that never fires
 * while the screen says it is connected, and nobody finds out for months.
 */
export async function saveTrackingId(input: {
  provider: string;
  value: string;
}): Promise<TrackingSaveResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isTrackingProviderId(input?.provider)) {
    return { ok: false, error: CLIENT_ERROR.generic };
  }
  const provider: TrackingProviderId = input.provider;

  const normalized = normalizeTrackingId(provider, input.value);
  if (!normalized.ok) return { ok: false, error: normalized.error };

  const svc = createServiceRoleClient();
  if (!svc) return { ok: false, error: CLIENT_ERROR.generic };

  const res = await writeTenantTrackingId(svc, auth.tenantId, provider, normalized.value);
  if (!res.ok) return { ok: false, error: res.error };

  updateTag(tagFor(auth.tenantId, "storefront"));
  return { ok: true, config: res.config };
}
