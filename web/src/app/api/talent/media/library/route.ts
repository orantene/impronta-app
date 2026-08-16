/**
 * GET /api/talent/media/library?talentProfileId=<uuid>
 *
 * Talent-scoped media library for the Max-tier page builder picker. Returns the
 * talent's OWN uploads + the photos on their profile (portfolio), each tagged so
 * the picker can show "My portfolio" vs "My uploads". A talent only ever sees
 * their own imagery here — NOT the whole agency library (privacy; the agency
 * library API `/api/admin/media/library` is staff-only and rejects talents).
 *
 * Auth: the talent themselves (talent-self ownership) OR agency staff who manage
 * this talent (tenant-scoped). After the gate, reads run through the service-role
 * client (same pattern as the talent media upload action) so portfolio assets
 * that are agency-owned still resolve.
 */

import { NextResponse } from "next/server";

import { readTalentMediaUsage } from "@/lib/media/talent-storage-usage";
import { queryTenantMediaLibrary } from "@/lib/media/library-query";
import {
  toMediaLibraryWireFolder,
  toMediaLibraryWireItem,
} from "@/lib/media/library-wire";
import {
  MEDIA_LIBRARY_MAX_PAGE_SIZE,
  MEDIA_LIBRARY_PAGE_SIZE,
} from "@/lib/media/library-item";
import { classifyTalentMediaUsability } from "@/lib/site-admin/server/media-grants";
import {
  requireWorkspaceStaffAction,
  requireTalentSelfAction,
} from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const talentProfileId = url.searchParams.get("talentProfileId");
  if (!talentProfileId || !UUID_RE.test(talentProfileId)) {
    return NextResponse.json(
      { ok: false, error: "talentProfileId required" },
      { status: 400 },
    );
  }

  // Authorize as EITHER the talent who owns this profile OR agency staff who
  // manage them. Talent-self is the primary path (the /talent/page-builder
  // surface has no staff-tenant scope); staff is the fallback for agency-built
  // talent pages and is verified against the talent's managing tenant below.
  const self = await requireTalentSelfAction(talentProfileId);
  let authorized = self.ok;
  // The managing tenant whose media this caller may see — used to scope EVERY
  // query in listTalentScopedMediaLibrary (the service-role client bypasses RLS).
  let resolvedTenantId: string | null = self.ok ? self.tenantId : null;

  if (!authorized) {
    const staff = await requireWorkspaceStaffAction();
    if (staff.ok) {
      // Staff may only read media for a talent their tenant actually manages.
      const admin = createServiceRoleClient();
      if (admin) {
        const { data: roster } = await admin
          .from("agency_talent_roster")
          .select("talent_profile_id")
          .eq("talent_profile_id", talentProfileId)
          .eq("tenant_id", staff.tenantId)
          .limit(1)
          .maybeSingle();
        const { data: profile } = await admin
          .from("talent_profiles")
          .select("created_by_agency_id")
          .eq("id", talentProfileId)
          .maybeSingle();
        const managed =
          !!roster ||
          (profile as { created_by_agency_id: string | null } | null)
            ?.created_by_agency_id === staff.tenantId;
        authorized = managed;
        // Scope to the STAFF's own tenant — never a tenant the talent is shared
        // with elsewhere.
        if (managed) resolvedTenantId = staff.tenantId;
      }
    }
  }

  if (!authorized) {
    return NextResponse.json(
      { ok: false, error: "Not authorized for this talent's media." },
      { status: 403 },
    );
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Server configuration error." },
      { status: 500 },
    );
  }

  // B13 — plan usage, so a surface can say "N of M photos" before the cap first
  // shows itself by refusing an upload. Talent-scoped (the cap is), one count
  // per load, and deliberately ahead of the managing-tenant early return: how
  // full your own library is does not depend on who represents you.
  //
  // `?quotaOnly=1` short-circuits the rest for surfaces that want the line and
  // not the grid (the talent Media section, the workspace Media header). Same
  // auth, one query instead of a library read plus the usability RPC.
  const quota = await readTalentMediaUsage(admin, talentProfileId);
  if (url.searchParams.get("quotaOnly") === "1") {
    return NextResponse.json({ ok: true, quota, items: [], portfolioAssetIds: [], locked: [] });
  }

  // No managing tenant resolved (e.g. an independent self-registered talent on
  // no roster) → no agency-scoped library to show. Return empty rather than run
  // an unscoped (cross-tenant) query.
  if (!resolvedTenantId) {
    return NextResponse.json({
      ok: true,
      items: [],
      folders: [],
      portfolioAssetIds: [],
      locked: [],
      nextCursor: null,
      totalCount: 0,
      pendingCount: 0,
      quota,
    });
  }

  // 2026-08-16 (library unification, seam 1) — the talent lane now reads the
  // SAME query layer as the staff library and the workspace Media page. Its
  // scope semantics are unchanged: a talent sees their OWN uploads plus the
  // photos linked to their profile (which may be agency-owned originals), and
  // never the rest of the agency library. `queryTenantMediaLibrary` enforces
  // the tenant scope in the app layer because this is a service-role client.
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const result = await queryTenantMediaLibrary({
    supabase: admin,
    tenantId: resolvedTenantId,
    scope: "talent",
    talentProfileId,
    search: url.searchParams.get("q"),
    folderId: url.searchParams.get("folderId"),
    cursor: url.searchParams.get("cursor"),
    limit:
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MEDIA_LIBRARY_MAX_PAGE_SIZE)
        : MEDIA_LIBRARY_PAGE_SIZE,
  });
  const { items, portfolioAssetIds } = result;

  // Media-ownership phase 3 (plan §6): the picker must not offer a photo the
  // talent may not actually use, AND must never drop one silently. So the
  // items list is returned WHOLE and each unusable asset is reported with a
  // reason — the picker greys the tile and says why.
  //
  // The surface asked about is the MASTER profile (`tenantId: null`): this is
  // the talent's own global page, the strictest of the surfaces they pick for.
  // The verdict comes from the one SQL predicate, never re-derived here.
  const usability = await classifyTalentMediaUsability(admin, {
    talentProfileId,
    assetIds: items.map((item) => item.id),
    tenantId: null,
  });
  const locked = usability
    .filter((u) => !u.usable)
    .map((u) => ({
      assetId: u.assetId,
      reason: u.reason,
      ownerName: u.ownerTenantName,
    }));

  return NextResponse.json({
    ok: true,
    items: items.map((photo) => toMediaLibraryWireItem(photo, resolvedTenantId)),
    folders: result.folders.map(toMediaLibraryWireFolder),
    portfolioAssetIds,
    locked,
    nextCursor: result.nextCursor,
    totalCount: result.totalCount,
    pendingCount: result.pendingCount,
    quota,
  });
}
