import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * no-dead-contact-cta.static.test.ts — a shipped default may not point at a
 * route that 404s.
 *
 * THE ROUTING TRUTH: on an agency host `/contact` is NOT the platform contact
 * route. It is outside `AGENCY_STOREFRONT_PREFIXES`, so the proxy rewrites it
 * to `/p/contact`, which 404s until the operator creates that page — and #1395
 * decided deliberately NOT to seed a placeholder, repointing seeded links at
 * `/directory`, a real route served on every plan.
 *
 * That pass fixed the starter homepage and missed the section library. The
 * clearest evidence was `featured_talent/presets.ts`, where `footerCta` had
 * been updated to `/directory` and `requestCta` two lines above still said
 * `/contact` — so every seeded talent card on a brand-new site shipped a dead
 * Request button, which is the head of the inquiry funnel.
 *
 * A grep guard is crude. It is also the only thing that would have caught a
 * one-line miss inside an object that was otherwise correct.
 *
 * NOT covered on purpose: `LinkPicker`, which offers `/contact` as a path an
 * operator MAY link once they have created that page. Offering it is fine;
 * shipping it as a default nobody chose is not.
 */

const SECTIONS = resolve(process.cwd(), "src/lib/site-admin/sections");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Files whose job is to OFFER paths, not to ship them as defaults. */
const ALLOWED = new Set(["shared/LinkPicker.tsx"]);

test("no section default ships a /contact link", () => {
  const offenders: string[] = [];

  for (const file of walk(SECTIONS)) {
    const rel = relative(SECTIONS, file);
    if (ALLOWED.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    source.split("\n").forEach((line, i) => {
      // Only the literal path as a value. A comment explaining the routing
      // (there are several, deliberately) must not trip this.
      if (/["'`]\/contact["'`]/.test(line) && !line.trim().startsWith("*") && !line.trim().startsWith("//")) {
        offenders.push(`${rel}:${i + 1}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `these ship a CTA pointing at /contact, which 404s on an agency host until the operator creates that page — use /directory:\n  ${offenders.join("\n  ")}`,
  );
});
