/**
 * The bio the talent page starts with: drafted from what the person said,
 * never from what they did not. Deterministic template first; a model pass
 * (Phase 5.1b) may improve the prose but must pass the same rules:
 * ≥ 30 chars (publish floor), no years of experience, clients, awards or
 * prices unless those facts exist, first person, one paragraph.
 */

export type BioFacts = {
  name: string | null;
  discipline: string | null;
  city: string | null;
  services: string[];
  yearsExperience: number | null;
};

const BANNED = /\b(\d+\+?\s*(years|años)|award|premio|clients? (like|including)|clientes como|\$\s?\d)/i;

export function draftBio(facts: BioFacts, locale: "en" | "es"): string {
  const services = facts.services.slice(0, 3);
  const what = facts.discipline?.trim() || null;
  const parts: string[] = [];
  if (locale === "es") {
    parts.push(what ? (facts.name ? `Soy ${facts.name}, ${jobTitle(what)}` : `${cap(what)}`) : facts.name ? `Soy ${facts.name}` : "Trabajo por mi cuenta");
    if (facts.city) parts[0] += ` en ${facts.city}`;
    parts[0] += ".";
    if (services.length) parts.push(`Ofrezco ${joinEs(services.map(lower))}.`);
    if (facts.yearsExperience && facts.yearsExperience > 0) parts.push(`Llevo ${facts.yearsExperience} años haciéndolo.`);
    parts.push("Escríbeme y vemos qué necesitas.");
  } else {
    parts.push(what ? (facts.name ? `I'm ${facts.name}, ${article(what)} ${jobTitle(what)}` : `${cap(what)}`) : facts.name ? `I'm ${facts.name}` : "I work independently");
    if (facts.city) parts[0] += ` in ${facts.city}`;
    parts[0] += ".";
    if (services.length) parts.push(`I offer ${joinEn(services.map(lower))}.`);
    if (facts.yearsExperience && facts.yearsExperience > 0) parts.push(`I've been doing this for ${facts.yearsExperience} years.`);
    parts.push("Write to me and we'll sort out what you need.");
  }
  return parts.join(" ");
}

/** The rules a drafted bio must pass, whoever wrote it. */
export function bioPassesRules(text: string, facts: BioFacts): { ok: boolean; reason?: string } {
  const t = text.trim();
  if (t.length < 30) return { ok: false, reason: "too_short" };
  if (t.length > 600) return { ok: false, reason: "too_long" };
  if (BANNED.test(t) && !facts.yearsExperience) return { ok: false, reason: "invented_claim" };
  if (/—/.test(t)) return { ok: false, reason: "em_dash" };
  return { ok: true };
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
/** "a" or "an" by the sound of the next word ("an event photographer", "a yoga instructor"). */
function article(s: string): string {
  return /^[aeiou]/i.test(s.trim()) ? "an" : "a";
}
/**
 * Catalogue labels are Title Case ("Event Photographer", "AC Technician");
 * mid-sentence they read as a trade, so Title Case words become lower case
 * while acronyms (all caps, 2+ letters) and slashes ("A/C", "DJ") stay.
 */
function jobTitle(s: string): string {
  return s.trim().split(/\s+/).map((w) => (/^\p{Lu}\p{Ll}+$/u.test(w) ? w.toLowerCase() : w)).join(" ");
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function joinEn(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
function joinEs(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}
