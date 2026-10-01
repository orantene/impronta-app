import "server-only";

/**
 * Versioned policy texts + acceptance records (legal plan 2.1 / 2.2 / 2.4).
 *
 * Every function here is BEST EFFORT: it returns null on any failure, logs,
 * and never throws, so a legal-record write can never break signup, an
 * inquiry, an offer approval or a checkout. Writes are gated by
 * LEGAL_ACCEPTANCE_ENABLED (on unless "false") and tolerate the tables not
 * existing yet (migration 20261231299600 not applied).
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError, logServerExpected } from "@/lib/server/safe-error";
import { loadPlatformCommercialDefaults } from "@/lib/platform/commercial-defaults";
import {
  parseTalentBookingTerms,
  parseTenantCommercialTerms,
  resolveCommercialTerms,
} from "@/lib/billing/commercial-terms";
import {
  decideVersion,
  hashPolicyText,
  isLegalAcceptanceEnabled,
  isMissingSchemaError,
  renderBookingPolicyText,
  renderPlatformPolicyText,
  type AcceptanceContext,
  type LatestVersion,
  type PolicyKind,
  type PolicySubject,
} from "./policy-versions.core";

export type { AcceptanceContext, PolicyKind, PolicySubject } from "./policy-versions.core";

export type PolicyVersionRef = { id: string; version: number; contentHash: string };

function report(context: string, err: unknown): void {
  if (isMissingSchemaError(err)) logServerExpected(`legal.${context}.schema_missing`, err);
  else logServerError(`legal.${context}`, err);
}

function adminClient(): SupabaseClient | null {
  if (!isLegalAcceptanceEnabled()) return null;
  return createServiceRoleClient();
}

async function renderFor(
  admin: SupabaseClient,
  kind: PolicyKind,
  subject: PolicySubject,
): Promise<{ text: string; settings: Record<string, unknown> }> {
  if (kind !== "booking") {
    return { text: renderPlatformPolicyText(kind), settings: { kind } };
  }
  const platform = await loadPlatformCommercialDefaults();
  let tenantSettings: unknown = null;
  let talentTerms: unknown = null;
  const tenantId = subject.scope === "platform" ? null : subject.tenantId ?? null;
  if (tenantId) {
    const { data } = await admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle();
    tenantSettings = (data as { settings?: unknown } | null)?.settings ?? null;
  }
  if (subject.scope === "talent") {
    const { data } = await admin
      .from("talent_profiles")
      .select("booking_terms")
      .eq("id", subject.talentProfileId)
      .maybeSingle();
    talentTerms = (data as { booking_terms?: unknown } | null)?.booking_terms ?? null;
  }
  const resolved = resolveCommercialTerms({
    platform,
    tenant: parseTenantCommercialTerms(tenantSettings),
    talent: parseTalentBookingTerms(talentTerms),
  });
  return {
    text: renderBookingPolicyText(resolved),
    settings: { depositPct: resolved.depositPct, refundPolicy: resolved.refundPolicy, resolvedFrom: resolved.resolvedFrom },
  };
}

function subjectColumns(subject: PolicySubject): { talent_profile_id: string | null; tenant_id: string | null } {
  // Talent terms layer over the home workspace's terms, so each (talent,
  // workspace) pair keeps its own version series.
  if (subject.scope === "talent") {
    return { talent_profile_id: subject.talentProfileId, tenant_id: subject.tenantId ?? null };
  }
  if (subject.scope === "workspace") return { talent_profile_id: null, tenant_id: subject.tenantId };
  return { talent_profile_id: null, tenant_id: null };
}

async function readLatest(
  admin: SupabaseClient,
  kind: PolicyKind,
  subject: PolicySubject,
): Promise<LatestVersion> {
  const cols = subjectColumns(subject);
  let q = admin
    .from("policy_versions")
    .select("id, version, content_hash")
    .eq("scope", subject.scope)
    .eq("kind", kind);
  q = cols.talent_profile_id ? q.eq("talent_profile_id", cols.talent_profile_id) : q.is("talent_profile_id", null);
  q = cols.tenant_id ? q.eq("tenant_id", cols.tenant_id) : q.is("tenant_id", null);
  const { data, error } = await q.order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as LatestVersion) ?? null;
}

/**
 * Render the current text for (kind, subject) from canonical settings and
 * return its version row, inserting a new version only when the hash changed.
 */
export async function getOrCreateCurrentVersion(
  kind: PolicyKind,
  subject: PolicySubject,
): Promise<PolicyVersionRef | null> {
  const admin = adminClient();
  if (!admin) return null;
  try {
    const { text, settings } = await renderFor(admin, kind, subject);
    const contentHash = hashPolicyText(text);
    for (let attempt = 0; attempt < 2; attempt++) {
      const latest = await readLatest(admin, kind, subject);
      const decision = decideVersion(latest, contentHash);
      if (decision.action === "reuse") return { id: decision.id, version: decision.version, contentHash };
      const { data, error } = await admin
        .from("policy_versions")
        .insert({
          scope: subject.scope,
          ...subjectColumns(subject),
          kind,
          version: decision.version,
          content_hash: contentHash,
          rendered_text: text,
          source_settings: settings,
        })
        .select("id, version")
        .single();
      if (!error && data) {
        const row = data as { id: string; version: number };
        return { id: row.id, version: row.version, contentHash };
      }
      // 23505: a concurrent request cut the same version; re-read and reuse.
      if ((error as { code?: string } | null)?.code !== "23505") throw error;
    }
    return null;
  } catch (err) {
    report("getOrCreateCurrentVersion", err);
    return null;
  }
}

export type RecordAcceptanceInput = {
  policyVersionId: string;
  context: AcceptanceContext;
  contextId?: string | null;
  actorUserId?: string | null;
  guestSessionId?: string | null;
  tenantId?: string | null;
  ageConfirmed?: boolean;
  ip?: string | null;
  userAgent?: string | null;
};

function hashIp(ip: string | null | undefined): string | null {
  const v = ip?.split(",")[0]?.trim();
  if (!v) return null;
  const salt = process.env.LEGAL_IP_HASH_SALT ?? "tulala-legal";
  return createHash("sha256").update(`${salt}:${v}`).digest("hex");
}

/** Best-effort request fingerprint (IP + UA) for an acceptance record. */
export async function requestFingerprint(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return {
      ip: h.get("x-forwarded-for") ?? h.get("x-real-ip"),
      userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function recordAcceptance(input: RecordAcceptanceInput): Promise<string | null> {
  const admin = adminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from("terms_acceptances")
      .insert({
        policy_version_id: input.policyVersionId,
        actor_user_id: input.actorUserId ?? null,
        guest_session_id: input.guestSessionId ?? null,
        tenant_id: input.tenantId ?? null,
        context: input.context,
        context_id: input.contextId ?? null,
        ip_hash: hashIp(input.ip),
        user_agent: input.userAgent ?? null,
        age_confirmed: input.ageConfirmed ?? false,
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  } catch (err) {
    report("recordAcceptance", err);
    return null;
  }
}

/** Resolve the current version for (kind, subject) and record one acceptance. Returns the version id. */
export async function acceptCurrentPolicy(
  kind: PolicyKind,
  subject: PolicySubject,
  acceptance: Omit<RecordAcceptanceInput, "policyVersionId">,
): Promise<string | null> {
  const version = await getOrCreateCurrentVersion(kind, subject);
  if (!version) return null;
  await recordAcceptance({ ...acceptance, policyVersionId: version.id });
  return version.id;
}

/** Stamp policy_version_id on an offer or booking row. Best effort. */
export async function stampPolicyVersion(
  table: "inquiry_offers" | "agency_bookings",
  rowId: string,
  policyVersionId: string,
): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  try {
    const { error } = await admin.from(table).update({ policy_version_id: policyVersionId }).eq("id", rowId);
    if (error) throw error;
  } catch (err) {
    report(`stampPolicyVersion.${table}`, err);
  }
}

/** Booking subject for an inquiry: its first talent if any, else the workspace. */
export async function bookingSubjectForInquiry(inquiryId: string): Promise<PolicySubject | null> {
  const admin = adminClient();
  if (!admin) return null;
  try {
    const { data: inq } = await admin.from("inquiries").select("tenant_id").eq("id", inquiryId).maybeSingle();
    const tenantId = (inq as { tenant_id?: string } | null)?.tenant_id ?? null;
    const { data: part } = await admin
      .from("inquiry_participants")
      .select("talent_profile_id")
      .eq("inquiry_id", inquiryId)
      .eq("role", "talent")
      .not("talent_profile_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const talentProfileId = (part as { talent_profile_id?: string } | null)?.talent_profile_id ?? null;
    if (talentProfileId) return { scope: "talent", talentProfileId, tenantId };
    if (tenantId) return { scope: "workspace", tenantId };
    return null;
  } catch (err) {
    report("bookingSubjectForInquiry", err);
    return null;
  }
}

/**
 * Record acceptance of the booking policy that applies to an inquiry right
 * now, and optionally stamp that version on an offer / booking row.
 * Best effort; returns the version id or null.
 */
export async function acceptBookingPolicyForInquiry(input: {
  inquiryId: string;
  context: AcceptanceContext;
  contextId: string;
  actorUserId?: string | null;
  guestSessionId?: string | null;
  stamp?: { table: "inquiry_offers" | "agency_bookings"; id: string };
}): Promise<string | null> {
  const subject = await bookingSubjectForInquiry(input.inquiryId);
  if (!subject) return null;
  return acceptBookingPolicy(subject, input);
}

/** Same as above for a known subject (e.g. a workspace pay link). */
export async function acceptBookingPolicy(
  subject: PolicySubject,
  input: {
    context: AcceptanceContext;
    contextId: string;
    actorUserId?: string | null;
    guestSessionId?: string | null;
    stamp?: { table: "inquiry_offers" | "agency_bookings"; id: string };
  },
): Promise<string | null> {
  const fp = await requestFingerprint();
  const versionId = await acceptCurrentPolicy("booking", subject, {
    context: input.context,
    contextId: input.contextId,
    actorUserId: input.actorUserId ?? null,
    guestSessionId: input.guestSessionId ?? null,
    tenantId: subject.scope === "platform" ? null : subject.tenantId ?? null,
    ip: fp.ip,
    userAgent: fp.userAgent,
  });
  if (versionId && input.stamp) await stampPolicyVersion(input.stamp.table, input.stamp.id, versionId);
  return versionId;
}

/** Stamp the current booking-policy version on a freshly created offer (2.4). */
export async function stampCurrentBookingPolicyOnOffer(inquiryId: string, offerId: string): Promise<void> {
  const subject = await bookingSubjectForInquiry(inquiryId);
  if (!subject) return;
  const version = await getOrCreateCurrentVersion("booking", subject);
  if (version) await stampPolicyVersion("inquiry_offers", offerId, version.id);
}

/**
 * 2.4: true when the booking-policy version stamped on the offer differs from
 * the one the customer accepted with their request. False whenever either
 * side is unknown (no record means no claim).
 */
export async function bookingPolicyChangedSinceInquiry(
  inquiryId: string,
  offerId: string,
): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  try {
    const [{ data: acc, error: accErr }, { data: offer, error: offErr }] = await Promise.all([
      admin
        .from("terms_acceptances")
        .select("policy_version_id")
        .eq("context", "inquiry")
        .eq("context_id", inquiryId)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("inquiry_offers").select("policy_version_id").eq("id", offerId).maybeSingle(),
    ]);
    if (accErr) throw accErr;
    if (offErr) throw offErr;
    const accepted = (acc as { policy_version_id?: string | null } | null)?.policy_version_id ?? null;
    const current = (offer as { policy_version_id?: string | null } | null)?.policy_version_id ?? null;
    return Boolean(accepted && current && accepted !== current);
  } catch (err) {
    report("bookingPolicyChangedSinceInquiry", err);
    return false;
  }
}
