import "server-only";

/**
 * Acceptance records (legal plan 2.2).
 *
 * Every export is BEST EFFORT: it logs and returns null/false on any failure
 * and never throws, so a legal-record write can never break signup, an
 * inquiry, an offer approval or a checkout. Writes are gated by
 * LEGAL_ACCEPTANCE_ENABLED and tolerate the tables not existing yet
 * (migration 20261231299910 not applied).
 *
 * Talent booking policies are NOT versioned here: they live in
 * talent_policy_versions and are resolved by lib/talent-policies/stamp.ts.
 * This module only records that someone accepted a version.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError, logServerExpected } from "@/lib/server/safe-error";
import {
  PLATFORM_POLICY_REVISIONS,
  hashIp,
  isLegalAcceptanceEnabled,
  isMissingSchemaError,
  platformContentHash,
  type AcceptanceContext,
} from "./acceptances.core";

export type { AcceptanceContext } from "./acceptances.core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type AcceptanceDeps = { client?: Db | null; env?: Record<string, string | undefined> };

function report(context: string, err: unknown): void {
  if (isMissingSchemaError(err)) logServerExpected(`legal.${context}.schema_missing`, err);
  else logServerError(`legal.${context}`, err);
}

function db(deps?: AcceptanceDeps): Db | null {
  if (!isLegalAcceptanceEnabled(deps?.env)) return null;
  if (deps && "client" in deps) return deps.client ?? null;
  return createServiceRoleClient() as Db | null;
}

export type RecordAcceptanceInput = {
  platformPolicyVersionId?: string | null;
  talentPolicyVersionId?: string | null;
  context: AcceptanceContext;
  contextId?: string | null;
  actorUserId?: string | null;
  guestSessionId?: string | null;
  tenantId?: string | null;
  ageConfirmed?: boolean;
  ip?: string | null;
  userAgent?: string | null;
};

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

/** Insert one acceptance row. Returns its id, or null (disabled, no version, or failure). */
export async function recordAcceptance(input: RecordAcceptanceInput, deps?: AcceptanceDeps): Promise<string | null> {
  try {
    if (!input.platformPolicyVersionId && !input.talentPolicyVersionId) return null;
    const client = db(deps);
    if (!client) return null;
    const { data, error } = await client
      .from("terms_acceptances")
      .insert({
        platform_policy_version_id: input.platformPolicyVersionId ?? null,
        talent_policy_version_id: input.talentPolicyVersionId ?? null,
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
    return ((data ?? null) as { id?: string } | null)?.id ?? null;
  } catch (err) {
    report("recordAcceptance", err);
    return null;
  }
}

/** The platform_policy_versions row for the current revision of a document, created on first use. */
export async function currentPlatformPolicyVersionId(
  kind: keyof typeof PLATFORM_POLICY_REVISIONS,
  deps?: AcceptanceDeps,
): Promise<string | null> {
  try {
    const client = db(deps);
    if (!client) return null;
    const { revisionTag, url } = PLATFORM_POLICY_REVISIONS[kind];
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: found, error: findErr } = await client
        .from("platform_policy_versions")
        .select("id")
        .eq("kind", kind)
        .eq("revision_tag", revisionTag)
        .maybeSingle();
      if (findErr) throw findErr;
      const foundId = ((found ?? null) as { id?: string } | null)?.id;
      if (foundId) return foundId;

      const { data: latest, error: latestErr } = await client
        .from("platform_policy_versions")
        .select("version")
        .eq("kind", kind)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestErr) throw latestErr;
      const version = (Number(((latest ?? null) as { version?: number } | null)?.version) || 0) + 1;
      const { data: created, error: insErr } = await client
        .from("platform_policy_versions")
        .insert({ kind, version, revision_tag: revisionTag, url, content_hash: platformContentHash(kind, revisionTag, url) })
        .select("id")
        .single();
      if (!insErr) return ((created ?? null) as { id?: string } | null)?.id ?? null;
      // 23505: a concurrent request cut the same version; re-read.
      if ((insErr as { code?: string }).code !== "23505") throw insErr;
    }
    return null;
  } catch (err) {
    report("currentPlatformPolicyVersionId", err);
    return null;
  }
}

/**
 * Signup: the account confirmed 18+ and agreed to Terms and Privacy. Records
 * one row per document; skips a document already accepted at this revision,
 * so calling it twice (email confirm + OAuth step) is harmless.
 */
export async function recordSignupAcceptance(userId: string, deps?: AcceptanceDeps): Promise<number> {
  let written = 0;
  try {
    const client = db(deps);
    if (!client) return 0;
    const fp = deps ? { ip: null, userAgent: null } : await requestFingerprint();
    for (const kind of ["terms", "privacy"] as const) {
      const versionId = await currentPlatformPolicyVersionId(kind, deps);
      if (!versionId) continue;
      const { data: existing, error } = await client
        .from("terms_acceptances")
        .select("id")
        .eq("actor_user_id", userId)
        .eq("context", "signup")
        .eq("platform_policy_version_id", versionId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (existing) continue;
      const id = await recordAcceptance(
        { platformPolicyVersionId: versionId, context: "signup", contextId: userId, actorUserId: userId, ageConfirmed: true, ...fp },
        deps,
      );
      if (id) written++;
    }
  } catch (err) {
    report("recordSignupAcceptance", err);
  }
  return written;
}

/**
 * true / false when we can tell whether this user ever accepted at signup;
 * null when we cannot (feature off, table missing, read failed). Callers must
 * treat null as "do not gate".
 */
export async function hasSignupAcceptance(userId: string, deps?: AcceptanceDeps): Promise<boolean | null> {
  try {
    const client = db(deps);
    if (!client) return null;
    const { data, error } = await client
      .from("terms_acceptances")
      .select("id")
      .eq("actor_user_id", userId)
      .eq("context", "signup")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  } catch (err) {
    report("hasSignupAcceptance", err);
    return null;
  }
}

/**
 * A customer accepted a talent's booking policy (the version
 * lib/talent-policies/stamp.ts already resolved and stamped). No version means
 * no record: a request without a single-talent policy carries none.
 */
export async function recordTalentPolicyAcceptance(
  input: Omit<RecordAcceptanceInput, "platformPolicyVersionId" | "ip" | "userAgent"> & {
    talentPolicyVersionId: string | null | undefined;
  },
  deps?: AcceptanceDeps,
): Promise<string | null> {
  if (!input.talentPolicyVersionId) return null;
  const fp = deps ? { ip: null, userAgent: null } : await requestFingerprint();
  return recordAcceptance({ ...input, ...fp }, deps);
}

/** The talent policy version stamped on an offer, else on its inquiry. Null when none. */
export async function stampedPolicyVersionForOffer(
  input: { inquiryId: string; offerId: string; tenantId: string },
  deps?: AcceptanceDeps,
): Promise<string | null> {
  try {
    const client = db(deps);
    if (!client) return null;
    const { data: offer, error } = await client
      .from("inquiry_offers")
      .select("policy_version_id")
      .eq("id", input.offerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (error) throw error;
    const fromOffer = ((offer ?? null) as { policy_version_id?: string | null } | null)?.policy_version_id;
    if (fromOffer) return fromOffer;
    const { data: inq, error: inqErr } = await client
      .from("inquiries")
      .select("policy_version_id")
      .eq("id", input.inquiryId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (inqErr) throw inqErr;
    return ((inq ?? null) as { policy_version_id?: string | null } | null)?.policy_version_id ?? null;
  } catch (err) {
    report("stampedPolicyVersionForOffer", err);
    return null;
  }
}
