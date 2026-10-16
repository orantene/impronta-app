/**
 * TUL-1157: contact details are never inferred. The model sometimes fills
 * WhatsApp / name from its own priors ("+529981234567", "Ana") when the
 * person typed neither. A contact fact survives only when its value appears
 * in the person's own words: digits for phones, case-insensitive for names
 * and emails. Everything else is dropped, so the field stays empty ("Falta").
 */

const PHONE_KEYS = new Set(["presence.whatsapp", "presence.phone"]);
const NAME_KEYS = new Set(["person.name", "person.professional_name"]);
const EMAIL_KEYS = new Set(["presence.email", "person.email", "business.email"]);

function digitsOf(s: string): string {
  return s.replace(/\D/g, "");
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function isContactFactKey(key: string): boolean {
  return PHONE_KEYS.has(key) || NAME_KEYS.has(key) || EMAIL_KEYS.has(key);
}

/** True when `value` for contact `key` is present in what the person typed. */
export function contactValueIsGrounded(key: string, value: unknown, userText: string): boolean {
  if (typeof value !== "string") return false;
  if (PHONE_KEYS.has(key)) {
    const want = digitsOf(value);
    if (want.length < 7) return false;
    const have = digitsOf(userText);
    // The model may add a country code the person left off; the typed digits must still be inside.
    return have.includes(want) || (have.length >= 7 && want.endsWith(have));
  }
  if (NAME_KEYS.has(key) || EMAIL_KEYS.has(key)) {
    const want = fold(value);
    if (!want) return false;
    const hay = ` ${fold(userText).replace(/[^\p{L}\p{N}@._+-]+/gu, " ")} `;
    return hay.includes(` ${want} `) || (EMAIL_KEYS.has(key) && hay.includes(want));
  }
  return true;
}

export function dropUngroundedContactFacts<T extends { factKey: string; value: unknown }>(facts: readonly T[], userText: string): T[] {
  return facts.filter((f) => !isContactFactKey(f.factKey) || contactValueIsGrounded(f.factKey, f.value, userText));
}
