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

import { listTalentScopedMediaLibrary } from "@/lib/site-admin/media/assets";
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

  // No managing tenant resolved (e.g. an independent self-registered talent on
  // no roster) → no agency-scoped library to show. Return empty rather than run
  // an unscoped (cross-tenant) query.
  if (!resolvedTenantId) {
    return NextResponse.json({ ok: true, items: [], portfolioAssetIds: [] });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Server configuration error." },
      { status: 500 },
    );
  }

  const { items, portfolioAssetIds } = await listTalentScopedMediaLibrary(
    admin,
    talentProfileId,
    resolvedTenantId,
  );
  return NextResponse.json({ ok: true, items, portfolioAssetIds });
}
