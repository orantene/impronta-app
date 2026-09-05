import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * admission-token.ts — the QR a person shows at the door.
 *
 * Wire: `adm1.<base64url(admissionId:tokenVersion)>.<base64url(hmac)>`.
 * Distinct HMAC prefix from the guest cookie, the conversation tokens and the
 * unsubscribe token, so none can be replayed as another.
 *
 *
 * DERIVED, NOT STORED, AND THIS IS THE WHOLE DESIGN
 * ════════════════════════════════════════════════
 * `admissions` has no `qr_token` column, on purpose and ratified. A stored
 * token is a credential at rest in a table that staff — and later a door role —
 * can SELECT: one over-broad read and every ticket for the night is forgeable,
 * with no way to tell which row leaked. A derived token cannot leak from a row
 * because it is not in one. It also needs no backfill and rotates with the
 * platform secret.
 *
 * The usual objection is that you cannot revoke a derived token. Here you can,
 * twice over, because the row already carries state:
 *
 *   status='void'    revokes the ADMISSION. The seat is gone with it.
 *   token_version++  revokes the TOKEN and KEEPS the seat.
 *
 * The second is the one that earns the column, and the case is Events': a
 * transfer or a re-issue needs the old QR dead and a new one live **for the same
 * seat**. Void-and-remint would detach the row from its allocation and lose the
 * record of what was sold. So the version is bound INTO the signature — bumping
 * it invalidates every token ever issued for that admission and nothing else.
 *
 *
 * WHAT THIS DOES NOT DO, AND MUST NOT BE MADE TO DO
 * ════════════════════════════════════════════════
 * It answers exactly one question: *was this string signed by us for this
 * admission at this version*. It does NOT decide whether the holder may enter.
 * Status, admitted count, the session's date, and whether the scanner is staff
 * of the right tenant are all row-and-caller facts, checked by `check_in` under
 * a row lock. A verifier that also authorised would be a second, weaker
 * authority sitting outside the lock, and a door that trusted it would admit on
 * a refunded ticket that still verifies — because it always will. The signature
 * is over identity, not entitlement, and those decay differently: identity
 * never changes, entitlement changes the moment somebody refunds.
 *
 *
 * NO SECRET, NO TOKEN — NEVER AN UNSIGNED ONE
 * ═══════════════════════════════════════════
 * With `GUEST_COOKIE_SECRET` unset, signing returns null and the caller must
 * omit the QR entirely. Degrading to an unsigned token would turn a missing
 * environment variable into a door that admits anyone, which is the loudest
 * possible failure disguised as the quietest.
 */

const VERSION = "adm1";
const SEPARATOR = ".";

/** Same shape as the sibling token modules: a UUID and a small positive int. */
const ADMISSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSecret(): string | null {
  const secret = process.env.GUEST_COOKIE_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

function computeSignature(encodedPayload: string, secret: string): string {
  // Domain separation. The prefix is inside the signed message, so a token
  // minted for one purpose cannot be presented as another even with the same
  // secret and the same payload bytes.
  return createHmac("sha256", secret)
    .update(`admission-qr:${VERSION}:${encodedPayload}`)
    .digest("base64url");
}

/**
 * Sign the QR for one admission at one token version.
 *
 * Returns null when the secret is unset or the inputs are not a real admission
 * reference — never a token that will not verify, and never an unsigned one.
 */
export function signAdmissionToken(
  admissionId: string,
  tokenVersion: number,
): string | null {
  const secret = getSecret();
  if (!secret) return null;
  if (typeof admissionId !== "string" || !ADMISSION_ID_RE.test(admissionId.trim())) return null;
  if (!Number.isInteger(tokenVersion) || tokenVersion < 1) return null;

  // THE SYMBOL MARGIN IS THREE BYTES. Measured with QR & Links against the real
  // encoder: this token is 100 bytes at version 1 and 105 at the smallint
  // ceiling, and a version-8 QR at ecc "Q" holds 108. **Any field added to this
  // payload steps the symbol to version 9 — silently.** It still fits and
  // nothing errors; the printed code just gets denser, which is paid for by
  // whoever is scanning a ticket on a dim phone at a door.
  //
  // If a field is genuinely needed, the free saving is here: base64url of the
  // uuid's 36-char TEXT spends 48 characters carrying 128 bits that 16 raw
  // bytes carry in 22. Taking that first buys 26 bytes and changes no security
  // property. Truncating the HMAC also saves bytes and is NOT free — it is
  // forgery margin on a credential that opens a door, and it was proposed and
  // withdrawn for that reason.
  //
  // A format change is cheap whenever it happens: the `adm1` prefix is inside
  // the signed message, so an `adm2` can be verified alongside it and printed
  // codes keep working. That is the argument for waiting, not for hurrying.
  const payload = `${admissionId.trim().toLowerCase()}:${tokenVersion}`;
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${VERSION}${SEPARATOR}${encoded}${SEPARATOR}${computeSignature(encoded, secret)}`;
}

export type AdmissionTokenResult =
  | { ok: true; admissionId: string; tokenVersion: number }
  /**
   * Refusals are NAMED rather than collapsed into one false, because the door
   * shows different things for different reasons and a scanner that cannot
   * distinguish "wrong night" from "we are misconfigured" sends staff to argue
   * with a customer about a problem the customer does not have.
   *
   * `no_secret` is deliberately distinct from `bad_signature`: one is an
   * outage, the other is a forgery, and they must never look the same on a
   * dashboard.
   */
  | { ok: false; reason: "no_secret" | "malformed" | "bad_signature" };

/**
 * Verify a scanned token.
 *
 * Constant-time comparison, and the length check happens before it because
 * `timingSafeEqual` throws on a length mismatch rather than returning false —
 * an exception here would be an unhandled 500 at a door, on a string an
 * attacker chooses.
 */
export function verifyAdmissionToken(raw: string | null | undefined): AdmissionTokenResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "no_secret" };
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, reason: "malformed" };

  const parts = raw.trim().split(SEPARATOR);
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: "malformed" };
  const encoded = parts[1] ?? "";
  const provided = parts[2] ?? "";
  if (!encoded || !provided) return { ok: false, reason: "malformed" };

  const expected = computeSignature(encoded, secret);
  const a = Buffer.from(provided, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  // Only decoded AFTER the signature check. Parsing attacker-controlled bytes
  // before verifying them is how a verifier becomes an attack surface.
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const split = payload.lastIndexOf(":");
  if (split <= 0) return { ok: false, reason: "malformed" };
  const admissionId = payload.slice(0, split);
  const versionText = payload.slice(split + 1);
  if (!ADMISSION_ID_RE.test(admissionId)) return { ok: false, reason: "malformed" };
  const tokenVersion = Number(versionText);
  // Round-trip rather than a range check: `Number(" 1 ")` is 1 and `Number("1e0")`
  // is 1, and neither is the string we signed. A value that does not re-serialise
  // to what was signed was not what was signed.
  if (!Number.isInteger(tokenVersion) || tokenVersion < 1 || String(tokenVersion) !== versionText) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, admissionId, tokenVersion };
}
