// D5 slice 1 — submit a Discover-originated inquiry, fanning out per
// owning tenant.
//
// POST /api/discover/inquiry
//   body: {
//     talentIds: string[],
//     contactName?: string,
//     contactEmail?: string,
//     contactPhone?: string,
//     eventDate?: string,           // ISO YYYY-MM-DD
//     eventLocation?: string,
//     message?: string,
//     sourceShortlistId?: string,   // when triggered from a shortlist
//   }
//   → 200 { inquiries: Array<{ tenantId, inquiryId, talentIds }>,
//          skipped: Array<{ talentId, reason }> }
//   → 401 unauthenticated
//   → 400 missing talentIds or empty array
//
// Per spec §3 (web/docs/discover-and-unified-inquiry-2026-05-14.md):
// each talent's "owning party" resolves to their primary roster's
// tenant (agency_talent_roster.is_primary=true). Talents on the same
// primary tenant share one inquiry; talents on different tenants spawn
// separate inquiries. Independent talents (no primary roster) skipped
// in this slice — they need their own talent-direct inbox flow which
// lands in D5 slice 2.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { submitInquiry } from "@/lib/inquiry/inquiry-engine-submit";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

type SubmitBody = {
  talentIds?: string[];
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  eventDate?: string;
  eventLocation?: string;
  message?: string;
  sourceShortlistId?: string;
};

export type DiscoverInquiryResult = {
  tenantId: string;
  inquiryId: string;
  talentIds: string[];
};

export type DiscoverInquirySkip = {
  talentId: string;
  reason: "not_discoverable" | "no_primary_tenant";
};

export async function POST(req: Request) {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: SubmitBody | null = null;
  try { body = await req.json() as SubmitBody; } catch { /* */ }

  const talentIds = (body?.talentIds ?? []).filter((id): id is string => typeof id === "string" && id.length > 0);
  if (talentIds.length === 0) {
    return NextResponse.json({ error: "talent_ids_required" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  // Resolve each talent: discoverable + workflow_status + primary tenant.
  const { data: profiles } = await admin
    .from("talent_profiles")
    .select(
      `
      id, is_discoverable, workflow_status,
      agency_talent_roster!talent_profile_id (
        tenant_id, status, is_primary
      )
      `,
    )
    .in("id", talentIds);

  type ProfileRow = {
    id: string;
    is_discoverable: boolean | null;
    workflow_status: string | null;
    agency_talent_roster: Array<{
      tenant_id: string;
      status: string;
      is_primary: boolean;
    }> | null;
  };
  const rows = (profiles ?? []) as unknown as ProfileRow[];
  const byId = new Map(rows.map((r) => [r.id, r] as const));

  // Group by owning tenant; skip whatever doesn't have a primary roster
  // on a discoverable + approved talent.
  const groupByTenant = new Map<string, string[]>();
  const skipped: DiscoverInquirySkip[] = [];

  for (const tid of talentIds) {
    const p = byId.get(tid);
    if (!p) {
      skipped.push({ talentId: tid, reason: "not_discoverable" });
      continue;
    }
    const wfOk = p.workflow_status === "approved" || p.workflow_status === "published";
    if (!p.is_discoverable || !wfOk) {
      skipped.push({ talentId: tid, reason: "not_discoverable" });
      continue;
    }
    const roster = (p.agency_talent_roster ?? []).filter(
      (r) => (r.status === "active" || r.status === "pending") && r.is_primary,
    );
    if (roster.length === 0) {
      // Independent — needs talent-direct inbox routing, deferred to D5 slice 2.
      skipped.push({ talentId: tid, reason: "no_primary_tenant" });
      continue;
    }
    const tenantId = roster[0]!.tenant_id;
    const bucket = groupByTenant.get(tenantId) ?? [];
    bucket.push(tid);
    groupByTenant.set(tenantId, bucket);
  }

  if (groupByTenant.size === 0) {
    return NextResponse.json(
      {
        inquiries: [],
        skipped,
        error: "no_routable_talents",
      },
      { status: 400 },
    );
  }

  // Resolve actor contact info from client_profiles for nicer defaults
  // when the form omitted contact_name / phone.
  const { data: clientProfile } = await admin
    .from("client_profiles")
    .select("display_name, company, contact_phone")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const contactName = body?.contactName?.trim()
    || (clientProfile?.display_name as string | undefined)
    || (session.user.email ?? "Discover client");
  const contactEmail = body?.contactEmail?.trim() || session.user.email || "";
  const contactPhone = body?.contactPhone?.trim()
    || (clientProfile?.contact_phone as string | undefined)
    || null;

  const sourceChannel = (talentIds.length > 1 || body?.sourceShortlistId)
    ? "discover_shortlist"
    : "discover_single_talent";

  // Fan out: one submitInquiry call per tenant group. submitInquiry's
  // own permission gate + rate limiter + coordinator assignment + per-row
  // owning_party trigger all fire per row.
  const inquiries: DiscoverInquiryResult[] = [];
  const fanFailures: Array<{ tenantId: string; reason: string }> = [];

  for (const [tenantId, ids] of groupByTenant) {
    try {
      const res = await submitInquiry(admin, {
        tenant_id: tenantId,
        client_user_id: session.user.id,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        event_date: body?.eventDate?.trim() || null,
        event_location: body?.eventLocation?.trim() || null,
        message: body?.message?.trim() || null,
        source_channel: sourceChannel,
        source_workspace_id: null,
        origin_domain: req.headers.get("host") ?? null,
        source_context: {
          origin: "discover",
          shortlist_id: body?.sourceShortlistId ?? null,
        },
        trust_level_at_submission: null,
        initiator_role: "client",
        initiator_user_id: session.user.id,
        actorUserId: session.user.id,
        talent_profile_ids: ids,
      } as never);
      if (res.success && res.data?.inquiryId) {
        inquiries.push({ tenantId, inquiryId: res.data.inquiryId, talentIds: ids });
      } else if (!res.success) {
        // Narrow to the failure variant for `reason` / `error`.
        const reason = ("reason" in res ? res.reason : undefined)
          ?? ("error" in res ? res.error : undefined)
          ?? "submit_failed";
        fanFailures.push({ tenantId, reason: String(reason) });
      } else {
        fanFailures.push({ tenantId, reason: "submit_failed" });
      }
    } catch (err) {
      logServerError("api.discover.inquiry.fanout", err instanceof Error ? err : new Error(String(err)));
      fanFailures.push({ tenantId, reason: "submit_threw" });
    }
  }

  if (inquiries.length === 0) {
    return NextResponse.json(
      { inquiries, skipped, fanFailures, error: "all_submits_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ inquiries, skipped, fanFailures });
}
