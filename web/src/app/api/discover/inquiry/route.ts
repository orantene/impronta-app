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
import { loadClientSubscription } from "@/lib/discover/client-subscription";
import { decideProGate } from "@/lib/discover/pro-gate";
import { loadClientTrustState } from "@/lib/client-trust/evaluator";
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
  reason: "not_discoverable" | "no_roster";
};

export type DiscoverInquiryRouting = "primary_agency" | "any_active_roster";

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

  // Phase D §5 — resolve the host/hub tenant the request entered through, so
  // no-roster (independent) talents can route to a talent-direct inbox instead
  // of being silently dropped. The inquiry files under the host tenant and the
  // owning-party resolver inside submitInquiry freezes owning_party='talent'
  // for them (no roster → independent). Resolved lazily — only no-roster talents
  // need it, and only once.
  let hostTenantId: string | null | undefined;
  async function resolveHostTenantId(): Promise<string | null> {
    if (hostTenantId !== undefined) return hostTenantId;
    const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
    if (!host) { hostTenantId = null; return hostTenantId; }
    const { data: domain } = await admin!
      .from("agency_domains")
      .select("tenant_id")
      .eq("hostname", host)
      .maybeSingle();
    hostTenantId = (domain as { tenant_id?: string } | null)?.tenant_id ?? null;
    return hostTenantId;
  }

  // Group by owning tenant. Discoverable + approved talents with a roster route
  // to their owning tenant; independent (no-roster) talents route to the host
  // tenant as talent-direct. Only genuinely non-discoverable talents are skipped.
  const groupByTenant = new Map<string, string[]>();
  const skipped: DiscoverInquirySkip[] = [];
  // Talents that are valid but have no roster — routed talent-direct once the
  // host tenant is resolved (below).
  const noRosterTalents: string[] = [];

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
    // D5 slice 3 — fallback ladder for routing:
    //   1. primary roster on a paid-plan workspace → that tenant (commission lane)
    //   2. else: any active/pending roster → that tenant (no commission, FYI route)
    //   3. else (Phase D §5): independent talent → talent-direct inbox on the host
    // Talents on Free workspaces fall to (2) — the inquiry still routes,
    // commission resolves at 0% per the exclusivity model.
    const activeRoster = (p.agency_talent_roster ?? []).filter(
      (r) => r.status === "active" || r.status === "pending",
    );
    const primary = activeRoster.find((r) => r.is_primary);
    const chosen = primary ?? activeRoster[0];
    if (!chosen) {
      noRosterTalents.push(tid);
      continue;
    }
    const tenantId = chosen.tenant_id;
    const bucket = groupByTenant.get(tenantId) ?? [];
    bucket.push(tid);
    groupByTenant.set(tenantId, bucket);
  }

  // Phase D §5 — fold the independent talents into a host-tenant group so they
  // produce a talent-direct inquiry. If the host tenant can't be resolved (e.g.
  // an unrecognized host), fall back to the legacy skip so we never file under
  // the wrong tenant.
  if (noRosterTalents.length > 0) {
    const host = await resolveHostTenantId();
    if (host) {
      const bucket = groupByTenant.get(host) ?? [];
      bucket.push(...noRosterTalents);
      groupByTenant.set(host, bucket);
    } else {
      for (const tid of noRosterTalents) skipped.push({ talentId: tid, reason: "no_roster" });
    }
  }

  // Phase D §1 — server-enforce the Pro gate. The routable count is the number
  // of talents that will actually fan out to an inquiry. Multi-talent send is a
  // Pro power tool; single-talent send stays free. The client-side alert() is no
  // longer the gate — this 402 is the source of truth.
  const routableTalentCount = Array.from(groupByTenant.values())
    .reduce((sum, ids) => sum + ids.length, 0);
  const subscription = await loadClientSubscription(session.user.id);
  const gate = decideProGate({ routableTalentCount, subscription });
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: "pro_required",
        message: "Multi-talent inquiry send requires a Pro subscription.",
      },
      { status: 402 },
    );
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
      // Phase D §4 — snapshot the client's REAL trust level for THIS tenant so
      // the talent contact-policy gate inside submitInquiry enforces against the
      // client's actual tier (was hardcoded null → treated as "basic" for every
      // send). Trust state is per (user, tenant); resolve per fan-out group.
      // Missing row → null, which submitInquiry safely defaults to "basic".
      const trust = await loadClientTrustState(session.user.id, tenantId, admin);
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
        trust_level_at_submission: trust?.trustLevel ?? null,
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
