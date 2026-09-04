/**
 * QR & Links Q1 — what a link's code may be, and how to generate one.
 *
 * Pure and free of `server-only`, so the test lane can import it directly.
 * `link-store.ts` does the I/O and re-exports nothing; it imports from here.
 */
import { randomInt } from "node:crypto";

/**
 * Readable is the default; opaque is for a code that GRANTS rather than SHOWS.
 *
 * A code printed on a table tent cannot be a secret, so a menu code is short
 * and typeable. A staff door or a comped-ticket link has no card anyone needs
 * to type, and guessability is the whole attack there, so it gets a long
 * random code. The mode is per link, decided at creation, because both kinds
 * live side by side in the same venue and an engine-wide switch would force
 * one answer on both.
 */
export type CodeMode = "readable" | "opaque";

/**
 * The alphabet for a generated code.
 *
 * Digits 1-9 and lowercase letters minus `l` and `o`. The excluded four are
 * the pairs a person misreads off a printed card or a phone screen, 0/o and
 * 1/l, and a code exists to be read back. 33 symbols after the exclusions.
 */
export const CODE_ALPHABET = "123456789abcdefghijkmnpqrstuvwxyz";

/**
 * Minimum length for an opaque code, mirrored by the
 * `links_opaque_code_is_long_enough` constraint.
 *
 * 16 characters of a 33-symbol alphabet is about 80 bits. Behind a
 * 60-request-per-minute rate limit that is not brute-forceable in the lifetime
 * of the restaurant, let alone of the sticker.
 */
export const OPAQUE_CODE_MIN_LENGTH = 16;

/** What we actually generate. Four characters of headroom over the floor. */
export const OPAQUE_CODE_LENGTH = 20;

/** The shape any code must have, mirroring the `links_code_format` constraint. */
export const CODE_PATTERN = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;

/**
 * Generate an opaque code.
 *
 * `randomInt` from `node:crypto`, never `Math.random`. An opaque code from a
 * predictable PRNG is a readable code that only looks opaque, which is worse
 * than not having the mode at all because it reads as solved. `randomInt` is
 * also rejection-sampled internally, so there is no modulo bias across the
 * 33-symbol alphabet.
 *
 * Readable codes are deliberately NOT generated. A readable code is named by
 * the person printing it ("t7", "door"); inventing one for them would produce
 * exactly the unreadable string the mode exists to avoid.
 */
export function generateOpaqueCode(length: number = OPAQUE_CODE_LENGTH): string {
  if (!Number.isInteger(length) || length < OPAQUE_CODE_MIN_LENGTH) {
    throw new Error(
      `An opaque code must be at least ${OPAQUE_CODE_MIN_LENGTH} characters; got ${length}.`,
    );
  }
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Is this code acceptable for this mode? Returns a sentence, not a boolean,
 * because every caller has a user to tell.
 */
export function validateCode(
  code: string,
  mode: CodeMode,
): { ok: true } | { ok: false; reason: string } {
  if (!CODE_PATTERN.test(code)) {
    return {
      ok: false,
      reason: "A code can use lowercase letters, numbers and hyphens, and cannot start or end with a hyphen.",
    };
  }
  if (mode === "opaque" && code.length < OPAQUE_CODE_MIN_LENGTH) {
    return {
      ok: false,
      reason: `A private code needs at least ${OPAQUE_CODE_MIN_LENGTH} characters.`,
    };
  }
  return { ok: true };
}
