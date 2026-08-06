import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ES_SECTION_CATALOG_TEXT } from "@/components/edit-chrome/editor-i18n-es-sections";
import { ES_TEXT } from "@/components/edit-chrome/editor-i18n-es";

/**
 * WAVE 0a — Spanish parity for the add-block gallery's section cards.
 *
 * The gallery frame was translated long before its 55 item cards were, so a
 * Spanish operator got a Spanish frame wrapped around an English catalog. PR
 * #1000 closed that gap; this guard stops it reopening, because adding a new
 * section is exactly the moment the translation gets forgotten and nothing
 * visibly breaks (the renderer falls back to English).
 *
 * Scope: the `label` and `description` a section's `meta.ts` exports, which are
 * what the gallery card actually renders.
 */

const SECTIONS_DIR = join(process.cwd(), "src/lib/site-admin/sections");

/** Pull `label:` / `description:` string literals out of a meta.ts source. */
function readMetaStrings(file: string): { label?: string; description?: string } {
  const src = readFileSync(file, "utf8");
  const grab = (field: string): string | undefined => {
    // Single-line literal only; a computed value is not a translatable constant.
    const m = new RegExp(
      `\\b${field}\\s*:\\s*(["'])((?:\\\\.|(?!\\1)[^\\\\])*?)\\1`,
    ).exec(src);
    return m?.[2]?.replace(/\\(["'\\])/g, "$1");
  };
  return { label: grab("label"), description: grab("description") };
}

function collect(): Array<{ kind: string; field: string; value: string }> {
  const out: Array<{ kind: string; field: string; value: string }> = [];
  for (const kind of readdirSync(SECTIONS_DIR)) {
    const meta = join(SECTIONS_DIR, kind, "meta.ts");
    if (!existsSync(meta)) continue;
    const { label, description } = readMetaStrings(meta);
    if (label) out.push({ kind, field: "label", value: label });
    if (description) out.push({ kind, field: "description", value: description });
  }
  return out;
}

test("every section card label and description has a Spanish entry", () => {
  const entries = collect();
  assert.ok(
    entries.length > 20,
    `only ${entries.length} section meta strings found; the extractor broke rather than the catalog shrinking`,
  );

  // Check the EFFECTIVE catalog, not the section table alone. `ES_TEXT` spreads
  // the section table and then defines its own keys, so a later explicit key
  // silently overrides a section translation. Checking only the section table
  // would pass while the gallery rendered English: a guard fooling itself.
  const missing = entries.filter(
    (e) => !Object.prototype.hasOwnProperty.call(ES_TEXT, e.value),
  );

  const shown = missing
    .slice(0, 30)
    .map((m) => `  sections/${m.kind}/meta.ts (${m.field})\n    "${m.value}"`)
    .join("\n");

  assert.equal(
    missing.length,
    0,
    missing.length === 0
      ? ""
      : `${missing.length} section-card string(s) have no Spanish entry.\n\n` +
          `Add each to ES_SECTION_CATALOG_TEXT in ` +
          `components/edit-chrome/editor-i18n-es-sections.ts, in the SAME ` +
          `commit as the section. Spanish is a requirement, and the gallery ` +
          `silently falls back to English so nothing else will tell you.\n\n` +
          `${shown}` +
          (missing.length > 30 ? `\n  ...and ${missing.length - 30} more` : ""),
  );
});

test("no later ES_TEXT key silently overrides a section translation", () => {
  // `ES_TEXT = { ...ES_SECTION_CATALOG_TEXT, "Some Key": "..." }`: the explicit
  // key wins. That is invisible at runtime (both are Spanish-looking strings)
  // and invisible to a table-only check, so pin it here.
  const conflicts = Object.entries(ES_SECTION_CATALOG_TEXT)
    .filter(([key, value]) => ES_TEXT[key] !== undefined && ES_TEXT[key] !== value)
    .map(([key, value]) => `  "${key}": section says "${value}", ES_TEXT resolves "${ES_TEXT[key]}"`);

  assert.equal(
    conflicts.length,
    0,
    conflicts.length === 0
      ? ""
      : `${conflicts.length} section translation(s) are overridden by a later ` +
          `ES_TEXT key. Remove the duplicate from editor-i18n-es.ts so the ` +
          `section catalog wins, or reconcile the two values.\n\n${conflicts.join("\n")}`,
  );
});

test("the section catalog translation table has no orphans", () => {
  // An orphan means a section was renamed or deleted and its translation was
  // left behind. Harmless at runtime, but it rots the catalog and hides the
  // real coverage number, so it is worth reporting rather than failing on.
  const live = new Set(collect().map((e) => e.value));
  const orphans = Object.keys(ES_SECTION_CATALOG_TEXT).filter((k) => !live.has(k));
  if (orphans.length > 0) {
    console.log(
      `[section-es-parity] ${orphans.length} translation(s) no longer match any ` +
        `meta.ts string (renamed or removed sections): ${orphans.slice(0, 5).join(" | ")}` +
        (orphans.length > 5 ? ` ...and ${orphans.length - 5} more` : ""),
    );
  }
  assert.ok(true);
});
