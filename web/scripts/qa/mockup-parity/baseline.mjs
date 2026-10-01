/**
 * Known-delta baseline: design-references/<design>/parity-baseline.json
 *
 *   { "design": "maison-v2", "accepted": [
 *       { "section": "menu", "check": "no horizontal overflow", "width": 360,
 *         "ticket": "TF-123", "reason": "why this is accepted for now" } ] }
 *
 * `section` and `check` are required. `check` may end in "*" (prefix match).
 * `width`, `demo` (profile code) and `layer` narrow an entry when present. `ticket` is
 * required: an entry without a ticket is a load error, because an accepted delta with
 * nobody holding it is just a hidden failure. Green means no failure outside this file.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..", "..", "..");

export const baselinePath = (design) => join(WEB, "design-references", design, "parity-baseline.json");

export function loadBaseline(design, file = baselinePath(design)) {
  if (!existsSync(file)) return { file, accepted: [], missing: true };
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const accepted = Array.isArray(raw.accepted) ? raw.accepted : [];
  accepted.forEach((a, i) => {
    for (const k of ["section", "check", "ticket"]) {
      if (!a[k] || typeof a[k] !== "string") throw new Error(`${file}: accepted[${i}] needs a string "${k}" (every accepted delta needs a ticket)`);
    }
  });
  return { file, accepted, missing: false };
}

const checkMatches = (pattern, check) => (pattern.endsWith("*") ? check.startsWith(pattern.slice(0, -1)) : pattern === check);
const entryMatches = (a, d) =>
  a.section === d.section &&
  checkMatches(a.check, d.check) &&
  (a.width == null || a.width === d.width) &&
  (a.demo == null || a.demo === d.talent) &&
  (a.layer == null || a.layer === d.layer);

/** Marks `delta.accepted = ticket` on baselined deltas. Returns the entries that matched nothing (stale). */
export function applyBaseline(deltas, baseline) {
  const used = new Set();
  for (const d of deltas) {
    const hit = baseline.accepted.find((a) => entryMatches(a, d));
    if (hit) { d.accepted = hit.ticket; used.add(hit); }
  }
  return baseline.accepted.filter((a) => !used.has(a));
}
