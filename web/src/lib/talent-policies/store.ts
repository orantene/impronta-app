/**
 * Reads and writes behind the policy screen and the cancel engine. Takes the
 * client it is handed (service role), so the node:test suite can drive it with
 * an in-memory fake. Ownership is checked by the caller (the server action);
 * nothing here trusts a client-supplied profile id on its own.
 */

import { logServerError } from "@/lib/server/safe-error";

import { DEFAULT_POLICY_ANSWERS, parsePolicyAnswers, type LateCancelRefund, type PolicyAnswers } from "./answers";
import { loadPolicyFacts, type PolicyFacts } from "./facts";
import { policyContentHash } from "./hash";
import { renderPolicyText } from "./render";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export type PublishedPolicy = {
  version: number;
  contentHash: string;
  answers: PolicyAnswers;
  facts: unknown;
  textEs: string;
  textEn: string;
  publishedAt: string;
};

const VERSION_COLUMNS =
  "version, content_hash, answers, facts, rendered_text_es, rendered_text_en, published_at";

type VersionRow = {
  version: number;
  content_hash: string;
  answers: unknown;
  facts: unknown;
  rendered_text_es: string;
  rendered_text_en: string;
  published_at: string;
};

function toPublished(r: VersionRow): PublishedPolicy {
  return {
    version: r.version,
    contentHash: r.content_hash,
    answers: parsePolicyAnswers(r.answers),
    facts: r.facts,
    textEs: r.rendered_text_es,
    textEn: r.rendered_text_en,
    publishedAt: r.published_at,
  };
}

/** The latest published version, or null when none (or the read failed). */
export async function loadPublishedPolicy(admin: Admin, talentProfileId: string): Promise<PublishedPolicy | null> {
  const { data, error } = await admin
    .from("talent_policy_versions")
    .select(VERSION_COLUMNS)
    .eq("talent_profile_id", talentProfileId)
    .order("version", { ascending: false })
    .limit(1);
  if (error) {
    logServerError("talentPolicies.loadPublished", error);
    return null;
  }
  const row = ((data ?? []) as VersionRow[])[0];
  return row ? toPublished(row) : null;
}

/** The talent's saved answers (her working copy), or the defaults. */
export async function loadSavedAnswers(admin: Admin, talentProfileId: string): Promise<PolicyAnswers> {
  const { data, error } = await admin
    .from("talent_policy_settings")
    .select("answers")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) logServerError("talentPolicies.loadSavedAnswers", error);
  return parsePolicyAnswers((data as { answers?: unknown } | null)?.answers);
}

/**
 * What the cancel engine honours: the answer from the PUBLISHED version only.
 * Unpublished edits never move money. No version, or a failed read, is "none",
 * the behaviour before policies existed.
 */
export async function loadPublishedLateCancelRefund(admin: Admin, talentProfileId: string): Promise<LateCancelRefund> {
  const published = await loadPublishedPolicy(admin, talentProfileId);
  return published?.answers.late_cancel_refund ?? DEFAULT_POLICY_ANSWERS.late_cancel_refund;
}

export type PublishResult =
  | { ok: true; unchanged: boolean; version: number; contentHash: string }
  | { ok: false; reason: "facts_unavailable" | "unavailable" };

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

/**
 * Publish: render ES + EN from the LIVE facts and the given answers, stamp a new
 * immutable version unless the content hash equals the latest one (then nothing
 * changes and no version is burned), and keep the working copy in step.
 */
export async function publishPolicy(
  admin: Admin,
  input: { talentProfileId: string; userId: string | null; answers: unknown },
): Promise<PublishResult> {
  const answers = parsePolicyAnswers(input.answers);
  const facts: PolicyFacts | null = await loadPolicyFacts(admin, input.talentProfileId);
  if (!facts) return { ok: false, reason: "facts_unavailable" };
  const contentHash = policyContentHash(facts, answers);

  for (let attempt = 0; attempt < 2; attempt++) {
    const latest = await loadPublishedPolicy(admin, input.talentProfileId);
    if (latest && latest.contentHash === contentHash) {
      await saveAnswers(admin, input.talentProfileId, answers);
      return { ok: true, unchanged: true, version: latest.version, contentHash };
    }
    const version = (latest?.version ?? 0) + 1;
    const { error } = await admin.from("talent_policy_versions").insert({
      talent_profile_id: input.talentProfileId,
      version,
      content_hash: contentHash,
      answers,
      facts,
      rendered_text_es: renderPolicyText(facts, answers, "es").text,
      rendered_text_en: renderPolicyText(facts, answers, "en").text,
      published_by: input.userId,
    });
    if (!error) {
      await saveAnswers(admin, input.talentProfileId, answers);
      return { ok: true, unchanged: false, version, contentHash };
    }
    // Two publishes raced for the same number: re-read and take the next one.
    if (!isUniqueViolation(error)) {
      logServerError("talentPolicies.publish", error);
      return { ok: false, reason: "unavailable" };
    }
  }
  return { ok: false, reason: "unavailable" };
}

export async function saveAnswers(admin: Admin, talentProfileId: string, answers: PolicyAnswers): Promise<boolean> {
  const { error } = await admin.from("talent_policy_settings").upsert(
    { talent_profile_id: talentProfileId, answers, updated_at: new Date().toISOString() },
    { onConflict: "talent_profile_id" },
  );
  if (error) {
    logServerError("talentPolicies.saveAnswers", error);
    return false;
  }
  return true;
}
