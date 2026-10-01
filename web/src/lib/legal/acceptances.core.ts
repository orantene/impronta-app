/**
 * Pure helpers for acceptance records (legal plan 2.2). No I/O, unit-tested.
 */

import { createHash } from "node:crypto";

export type PlatformPolicyKind = "terms" | "privacy" | "cookies";
export type AcceptanceContext = "signup" | "inquiry" | "offer_approval" | "payment";

/**
 * Current revision of each platform document. Bump the tag when the public
 * page changes (it matches the page's "last updated" date); a new
 * platform_policy_versions row is cut the first time a new tag is accepted.
 */
export const PLATFORM_POLICY_REVISIONS: Record<
  Exclude<PlatformPolicyKind, "cookies">,
  { revisionTag: string; url: string }
> = {
  terms: { revisionTag: "2026-04-01", url: "/legal/terms" },
  privacy: { revisionTag: "2026-09-30", url: "/legal/privacy" },
};

/** On unless explicitly "false" / "0" / "off". */
export function isLegalAcceptanceEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.LEGAL_ACCEPTANCE_ENABLED?.trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "off");
}

/** Table (or column) not there yet: the migration has not been applied. */
export function isMissingSchemaError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204";
}

/** The 18+ and Terms/Privacy checkbox. Only an explicit tick counts. */
export function isAgeAndTermsConfirmed(value: FormDataEntryValue | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v === "on" || v === "1" || v === "true" || v === "yes";
}

export function platformContentHash(kind: PlatformPolicyKind, revisionTag: string, url: string): string {
  return createHash("sha256").update(`${kind}\n${revisionTag}\n${url}`).digest("hex");
}

/** First hop of x-forwarded-for, salted and hashed. Never store a raw IP. */
export function hashIp(ip: string | null | undefined, salt = process.env.LEGAL_IP_HASH_SALT ?? "tulala-legal"): string | null {
  const v = ip?.split(",")[0]?.trim();
  if (!v) return null;
  return createHash("sha256").update(`${salt}:${v}`).digest("hex");
}

/**
 * Legal 2.4: the talent policy version stamped on the offer differs from the
 * one stamped on the request. Unknown on either side is never a claim.
 */
export function policyChangedSinceRequest(
  inquiryVersionId: string | null | undefined,
  offerVersionId: string | null | undefined,
): boolean {
  return Boolean(inquiryVersionId && offerVersionId && inquiryVersionId !== offerVersionId);
}

/**
 * A Google account is "new" when Supabase created it moments ago. Used only to
 * decide whether to show the one-time acceptance step after OAuth.
 */
export function isFreshOAuthSignup(
  user: { created_at?: string | null; app_metadata?: { provider?: unknown } | null } | null | undefined,
  nowMs: number,
  windowMs = 15 * 60 * 1000,
): boolean {
  if (!user?.created_at) return false;
  if (user.app_metadata?.provider !== "google") return false;
  const created = Date.parse(user.created_at);
  return Number.isFinite(created) && nowMs - created >= 0 && nowMs - created <= windowMs;
}
