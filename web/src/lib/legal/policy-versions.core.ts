/**
 * Pure helpers for versioned policy texts (legal plan 2.1 / 2.2 / 2.4).
 * No IO here so they can be unit tested; the server half lives in
 * ./policy-versions.ts.
 */

import { createHash } from "node:crypto";

import {
  REFUND_POLICY_DESCRIPTIONS,
  REFUND_POLICY_LABELS,
  type ResolvedCommercialTerms,
} from "@/lib/billing/commercial-terms-types";

export type PolicyKind = "terms" | "privacy" | "cookies" | "booking";
export type PolicyScope = "platform" | "talent" | "workspace";
export type AcceptanceContext = "signup" | "inquiry" | "offer_approval" | "payment";

export type PolicySubject =
  | { scope: "platform" }
  | { scope: "talent"; talentProfileId: string; tenantId?: string | null }
  | { scope: "workspace"; tenantId: string };

/**
 * Revision tag of the platform Terms / Privacy / Cookies pages. Bump it when
 * that copy changes so a new policy_versions row is cut. The pages themselves
 * stay the source of the words; the stored text points at them.
 */
export const PLATFORM_LEGAL_REVISION = "2026-10-01";

/** DB writes are on unless explicitly switched off. */
export function isLegalAcceptanceEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.LEGAL_ACCEPTANCE_ENABLED !== "false";
}

/** Postgres "undefined_table" / "undefined_column": migration not applied yet. */
export function isMissingSchemaError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "42P01" || code === "42703" || code === "PGRST205" || code === "PGRST204";
}

/** Normalise line endings and trailing spaces so cosmetic noise never cuts a version. */
export function normalizePolicyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
}

export function hashPolicyText(text: string): string {
  return createHash("sha256").update(normalizePolicyText(text), "utf8").digest("hex");
}

export type LatestVersion = { id: string; version: number; content_hash: string } | null;

/**
 * Decide whether the latest stored version still matches. A new version is cut
 * ONLY when the content hash changed.
 */
export function decideVersion(
  latest: LatestVersion,
  contentHash: string,
): { action: "reuse"; id: string; version: number } | { action: "insert"; version: number } {
  if (latest && latest.content_hash === contentHash) {
    return { action: "reuse", id: latest.id, version: latest.version };
  }
  return { action: "insert", version: (latest?.version ?? 0) + 1 };
}

/** Booking policy text from the resolved commercial terms (settings, not copy). */
export function renderBookingPolicyText(
  terms: Pick<ResolvedCommercialTerms, "depositPct" | "refundPolicy">,
): string {
  const deposit = Math.round(terms.depositPct);
  const depositLine =
    deposit > 0
      ? `Deposit: ${deposit}% of the total to confirm the booking.`
      : "Deposit: none required to confirm the booking.";
  return normalizePolicyText(
    [
      "Booking policy",
      depositLine,
      `Refunds: ${REFUND_POLICY_LABELS[terms.refundPolicy]}. ${REFUND_POLICY_DESCRIPTIONS[terms.refundPolicy]}.`,
    ].join("\n"),
  );
}

export function renderPlatformPolicyText(kind: Exclude<PolicyKind, "booking">): string {
  const page = kind === "terms" ? "terms" : "privacy";
  return `Tulala ${kind} policy, revision ${PLATFORM_LEGAL_REVISION}. Full text: /legal/${page}`;
}

/** Server-side validation of the signup "18 or older + agree" checkbox. */
export function isAgeAndTermsConfirmed(value: FormDataEntryValue | null | undefined): boolean {
  return value === "on" || value === "true" || value === "1" || value === "yes";
}
