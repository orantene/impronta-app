import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LOCALIZABLE_PROPS_BY_KIND } from "./builder-i18n-props";

/**
 * A BLOCK THAT RESOLVES LOCALIZED TEXT MUST BE IN THE REGISTRY.
 *
 * `resolveNodeLocalizedText` returns the base value unchanged when
 * `isLocalizableProp(kind, prop)` is false. So a renderer that dutifully calls
 * it for a kind ABSENT from the registry silently discards every stored
 * overlay: an operator translates "Reserve" to "Reservar", the Content panel
 * saves it, and the Spanish page still says Reserve. The registry's own header
 * warns about this — "needs an entry here or the renderer will not resolve its
 * overlay, a translation that stores fine and never appears" — and five blocks
 * were missing anyway, because nothing checked.
 *
 * WHY THIS GUARD ENUMERATES FROM THE RENDERER AND NOT FROM THE REGISTRY:
 * a check that walks the registry and asks "is this kind rendered" can never
 * see a kind that is in NEITHER list. Absence is invisible from that side. The
 * superset is the renderer, so the question is asked in the other direction.
 */

const RENDER = join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx");

/**
 * Kinds whose renderer resolves localized text while having no registry entry,
 * as of 2026-09-06. Each one silently drops translations TODAY.
 *
 * This list may only ever SHRINK. It is not a permission to add another: a new
 * block that resolves localized text and is not registered fails this test on
 * the PR that adds it, which is the point.
 *
 * Owners, so nobody has to guess who fixes which:
 *   menu_board      Menu Workspace Manager
 *   qr_code         QR & Links Engine Manager
 *   session_picker  Sessions & Classes Manager
 *   ticket_picker   Events & Ticketing Manager
 *   social_post     Page Builder (resolves `caption`)
 *   tabs            Page Builder (resolves `panelTitle`; `tab_panel` IS
 *                   registered, so this one may already be covered in practice
 *                   and needs a look rather than an assumption)
 */
const KNOWN_MISSING: readonly string[] = [
  "menu_board",
  "qr_code",
  "session_picker",
  "social_post",
  "tabs",
  "ticket_picker",
];

/** Kinds whose render arm calls the localized-text resolver. */
function kindsThatResolveLocalizedText(source: string): string[] {
  const kinds = new Set<string>();
  // Walk each `case "<kind>": { ... }` arm and look for a resolver call inside
  // it. Splitting on the case label keeps an arm's body with its own kind, so a
  // resolver call cannot be attributed to whichever `case` happened to sit
  // nearest it in the file.
  const parts = source.split(/\n    case "([a-z_]+)":/);
  for (let i = 1; i < parts.length; i += 2) {
    const kind = parts[i]!;
    const body = parts[i + 1] ?? "";
    // EXCLUDE THE DEFINITION. `function resolveNodeLocalizedText(` lives
    // between two case labels, so the arm that happens to precede it swallows
    // it and looks like a caller. The first version of this guard reported
    // `cms_posts` on exactly that basis — a proximity match, not a call.
    const calls = body
      .split("\n")
      .filter((l) => /resolveNodeLocalizedText\s*\(/.test(l))
      .filter((l) => !/function\s+resolveNodeLocalizedText/.test(l));
    if (calls.length > 0) kinds.add(kind);
  }
  return [...kinds].sort();
}

test("every block that resolves localized text is in the registry", () => {
  const source = readFileSync(RENDER, "utf8");
  const resolving = kindsThatResolveLocalizedText(source);

  assert.ok(
    resolving.length > 5,
    `expected to find many resolving kinds; found ${resolving.length}. ` +
      "If render.tsx was restructured this parser is measuring nothing — fix it " +
      "rather than deleting the assertion.",
  );

  const registered = new Set(Object.keys(LOCALIZABLE_PROPS_BY_KIND));
  const missing = resolving.filter(
    (k) => !registered.has(k) && !KNOWN_MISSING.includes(k),
  );

  assert.deepEqual(
    missing,
    [],
    `these blocks resolve localized text but have no LOCALIZABLE_PROPS_BY_KIND ` +
      `entry, so every stored translation for them is discarded: ${missing.join(", ")}`,
  );
});

test("reserve_table is registered, and with the props the renderer actually resolves", () => {
  // The block this guard was written for. Its renderer resolves exactly these
  // two; the guest-facing SENTENCES are not props and ship as en/es inside the
  // island on purpose.
  assert.deepEqual(LOCALIZABLE_PROPS_BY_KIND.reserve_table, ["venueName", "ctaVerb"]);
});

test("the known-missing list only shrinks", () => {
  const registered = new Set(Object.keys(LOCALIZABLE_PROPS_BY_KIND));
  const fixed = KNOWN_MISSING.filter((k) => registered.has(k));
  assert.deepEqual(
    fixed,
    [],
    `these are registered now — delete them from KNOWN_MISSING so the guard ` +
      `protects them: ${fixed.join(", ")}`,
  );
});
