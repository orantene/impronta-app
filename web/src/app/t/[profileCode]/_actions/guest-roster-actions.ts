"use server";

/**
 * guest-roster-actions.ts — guest-safe public roster read for the in-chat TALENT
 * picker (Phase 2 / §4.B.3).
 *
 * listGuestTenantRoster returns the tenant's publicly-visible, active + published
 * roster as the RosterLiteItem shape SearchTalentField consumes (id / name /
 * category / city / thumb). Public information only — the same name + thumb a
 * directory card already shows; it carries NO PII and requires NO inquiry
 * ownership, so it is gated only by a valid guest session (consistent with the
 * other guest actions) and a resolvable tenant. Never throws.
 *
 * Split out of guest-detail-chips-actions.ts so that file stays under the
 * 800-line cap. Mirrors the same cookie-only guest-session boundary.
 *
 * NO migration required — reads existing public roster data via service-role.
 */

import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  loadDefaultStorefrontRoster,
  loadRosterPortraitsByIds,
} from "@/lib/home/default-storefront-roster";
import { loadDiscoverTalents } from "@/app/(workspace)/[tenantSlug]/_data-bridge/discover";
import { discoverTalentsToRosterItems } from "@/lib/inquiry/hub-roster-adapter";
import type {
  GuestChatErrorCode,
  GuestChatFailure,
  ListGuestTenantRosterResult,
  ResolveGuestCartPortraitsResult,
} from "@/lib/inquiry/guest-chat-contract";

/**
 * How many cross-tenant profiles the hub talent picker loads. The picker is a
 * client-filtered search list, so this is the upper bound of the searchable set
 * (the agency path caps at 24 via loadDefaultStorefrontRoster; the hub reads the
 * wider platform index up to the loader's own max).
 */
const HUB_ROSTER_LIMIT = 60;

const GUEST_HEADER = "x-impronta-guest";

function fail(code: GuestChatErrorCode, message: string): GuestChatFailure {
  return { ok: false, code, message };
}

type ResolvedTenant =
  | { ok: true; tenantId: string; isHub: boolean }
  | { ok: false; failure: GuestChatFailure };

/**
 * Shared preamble for the guest-safe public roster reads: a service-role client,
 * the cookie-only guest-session gate (same boundary as every other guest action,
 * so the surface is uninvokable without a session header even though the data is
 * public), and the slug → public, non-cancelled tenant resolution. Keeps both
 * reads tenant-scoped to the public host so neither leaks cross-tenant talent.
 */
async function resolvePublicTenant(
  rawSlug: string | null | undefined,
  logTag: string,
): Promise<ResolvedTenant> {
  const slug = rawSlug?.trim().toLowerCase();
  if (!slug) {
    return { ok: false, failure: fail("tenant_unavailable", "We couldn't find this workspace.") };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, failure: fail("db_unavailable", "Messaging is temporarily unavailable.") };
  }

  const guestKey = (await headers()).get(GUEST_HEADER);
  if (!guestKey) {
    return {
      ok: false,
      failure: fail(
        "forbidden",
        "We couldn't identify your session. Please refresh and try again.",
      ),
    };
  }

  const { data: agency, error: agencyErr } = await admin
    .from("agencies")
    .select("id, status, kind")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (agencyErr) {
    logServerError(`${logTag}/agency`, agencyErr);
    return { ok: false, failure: fail("engine_error", "Couldn't load the roster.") };
  }
  if (!agency || agency.status === "cancelled" || agency.status === "archived") {
    return { ok: false, failure: fail("tenant_unavailable", "We couldn't find this workspace.") };
  }

  // A hub tenant (platform hub or a network hub) owns no roster of its own — its
  // talent comes from the cross-tenant Discover index. Callers branch on this so
  // the hub picker never hits the empty agency-scoped roster path.
  return { ok: true, tenantId: agency.id as string, isHub: agency.kind === "hub" };
}

export async function listGuestTenantRoster(input: {
  tenantSlug: string;
}): Promise<ListGuestTenantRosterResult> {
  try {
    const tenant = await resolvePublicTenant(
      input.tenantSlug,
      "guest-roster-actions.listGuestTenantRoster",
    );
    if (!tenant.ok) return tenant.failure;

    // Hub host: the tenant has no own roster, so source the picker from the
    // cross-tenant Discover index (the same platform-wide set the global
    // directory lists) instead of the empty agency-scoped roster.
    if (tenant.isHub) {
      const { items } = await loadDiscoverTalents({ limit: HUB_ROSTER_LIMIT });
      return { ok: true, roster: discoverTalentsToRosterItems(items) };
    }

    const rows = await loadDefaultStorefrontRoster(tenant.tenantId);
    return {
      ok: true,
      roster: rows.map((r) => ({
        id: r.id,
        name: r.name,
        primaryTypeLabel: r.primaryTypeLabel ?? undefined,
        city: r.city ?? undefined,
        photoUrl: r.thumb,
      })),
    };
  } catch (err) {
    logServerError("guest-roster-actions.listGuestTenantRoster", err);
    return fail("engine_error", "Couldn't load the roster.");
  }
}

/**
 * resolveGuestCartPortraits — backfill name + face-focus portrait for cart ids the
 * client registry doesn't know about (plan §4.A.1 / §5.5 remaining bug).
 *
 * On a COLD load the inquiry cart is restored from `saved_talent`, but the client
 * cart-talent-registry is only seeded by in-session adds, so those ids fall back
 * to initials on the launcher rail. This resolves each requested id via a TARGETED,
 * UNCAPPED by-id roster read (`loadRosterPortraitsByIds`) that shares the storefront
 * roster's photo rank (card → hero → public_watermarked → gallery → original via
 * `loadTalentCardThumbs`) so the rail avatar is byte-identical to the directory
 * card. The by-id read deliberately does NOT reuse the capped storefront roster
 * (`loadDefaultStorefrontRoster`, .limit(24)) so cart talents beyond the first 24,
 * or absent from the default storefront slice, still resolve a face.
 *
 * Public information only, scoped to the current public tenant — an id that is
 * not on this tenant's published, active, publicly-visible roster is simply
 * omitted (never leaked, never resolved cross-tenant). Never throws.
 */
export async function resolveGuestCartPortraits(input: {
  tenantSlug: string;
  talentProfileIds: string[];
}): Promise<ResolveGuestCartPortraitsResult> {
  try {
    const requested = [
      ...new Set((input.talentProfileIds ?? []).filter((x): x is string => !!x)),
    ];
    if (requested.length === 0) return { ok: true, talents: [] };

    const tenant = await resolvePublicTenant(
      input.tenantSlug,
      "guest-roster-actions.resolveGuestCartPortraits",
    );
    if (!tenant.ok) return tenant.failure;

    // Targeted, UNCAPPED by-id read: resolve exactly the requested cart ids
    // (membership + photo rank match the cards) without the storefront .limit(24).
    // Ids absent from this tenant's public roster are simply not returned
    // (cross-tenant / non-public talent never resolve here).
    const rows = await loadRosterPortraitsByIds(tenant.tenantId, requested);
    const talents = rows.map((r) => ({
      talentProfileId: r.id,
      displayName: r.name,
      portraitUrl: r.thumb,
    }));

    return { ok: true, talents };
  } catch (err) {
    logServerError("guest-roster-actions.resolveGuestCartPortraits", err);
    return fail("engine_error", "Couldn't load the roster.");
  }
}
