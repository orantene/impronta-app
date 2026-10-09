/**
 * Pure SSO / edit hand-off validators (no I/O).
 *
 * Shared by the server mint/redeem path and unit tests so expiry, single-use,
 * host binding, and replay rules stay one place. See
 * docs/plans/auth/custom-domain-edit-handoff.md.
 */

/** 2 minutes — enough for the mint → redirect → redeem round-trip. */
export const SSO_HANDOFF_TTL_MS = 120_000;

export type HandoffTokenRow = {
  user_id: string;
  target_host: string;
  expires_at: string;
  used_at: string | null;
};

export type HandoffValidateFail =
  | "missing"
  | "used"
  | "expired"
  | "host_mismatch";

export type HandoffValidateResult =
  | { ok: true }
  | { ok: false; reason: HandoffValidateFail };

/** Normalize a request host the same way mint/redeem do. */
export function normalizeHandoffHost(host: string): string {
  return host.split(":")[0]?.trim().toLowerCase() ?? "";
}

/** Mint expiry ISO timestamp from a clock + TTL. */
export function mintHandoffExpiresAt(
  nowMs: number,
  ttlMs: number = SSO_HANDOFF_TTL_MS,
): string {
  return new Date(nowMs + ttlMs).toISOString();
}

/**
 * Pre-claim checks for a hand-off row. Fail closed on any mismatch.
 * Replay of an already-claimed token surfaces as `used`.
 */
export function validateHandoffRow(
  row: HandoffTokenRow | null | undefined,
  requestHost: string,
  nowMs: number = Date.now(),
): HandoffValidateResult {
  if (!row) return { ok: false, reason: "missing" };
  if (row.used_at) return { ok: false, reason: "used" };
  const host = normalizeHandoffHost(requestHost);
  if (!host || row.target_host !== host) {
    return { ok: false, reason: "host_mismatch" };
  }
  if (new Date(row.expires_at).getTime() < nowMs) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

/**
 * Models the atomic `UPDATE … SET used_at WHERE used_at IS NULL` claim.
 * Only a row that still has `used_at === null` wins; a second claim loses
 * (replay protection).
 */
export function atomicHandoffClaimWins(
  usedAtBeforeClaim: string | null | undefined,
): boolean {
  return usedAtBeforeClaim == null;
}
