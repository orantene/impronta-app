/**
 * Feature-flag helpers must not default ON when NODE_ENV === "development".
 *
 * That pattern made Studio V2 / Desk look live on localhost while production
 * stayed dark. Explicit env only — same default in every environment.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT, blankComments } from "./supabase-unchecked-read";

/** Paths (under web/) that are known feature-flag helpers. Expand when adding gates. */
/** Known env-gated enable helpers (incl. names without "flag"). Expand when adding gates. */
const FLAG_HELPER_FILES = [
  "src/lib/talent/studio-flag.ts",
  "src/lib/support/desk-flag.ts",
  "src/lib/talent-agenda/flag.ts",
  "src/lib/access/talent-free-website.ts",
  "src/lib/access/talent-theme-gallery.ts",
  "src/lib/access/talent-website-settings.ts",
  "src/lib/access/talent-maison-theme.ts",
  "src/lib/access/talent-site-subdomains.ts",
  "src/lib/access/talent-tier-label.ts",
  "src/lib/access/talent-site-tier-expansion.ts",
  "src/lib/talent-site/footer-socket.ts",
  "src/lib/media/private-access.ts",
  "src/lib/site-admin/site-shell-flag.ts",
  "src/lib/site-admin/edit-mode/presence-flag.ts",
  "src/lib/channels/flag.ts",
  "src/lib/client-billing/pricing-flag.ts",
];

/**
 * Discover all feature-flag helpers under lib/:
 *  - every path in FLAG_HELPER_FILES
 *  - any *.ts whose filename matches /flag/i
 *  - any access/*.ts that exports an *Enabled helper reading process.env
 */
function discoverFlagFiles(): string[] {
  const found = new Set(FLAG_HELPER_FILES);
  const libRoot = join(WEB_ROOT, "src", "lib");

  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name === "node_modules" || name.endsWith(".test.ts")) continue;
        walk(full);
        continue;
      }
      if (!name.endsWith(".ts") || name.includes(".test.")) continue;
      const rel = full.slice(WEB_ROOT.length + 1).replace(/\\/g, "/");
      if (/flag/i.test(name)) {
        found.add(rel);
        continue;
      }
      // Catch access/* enable helpers that omit "flag" from the filename.
      if (rel.startsWith("src/lib/access/")) {
        try {
          const src = blankComments(readFileSync(full, "utf8"));
          if (
            /export\s+function\s+\w*Enabled\b/.test(src) &&
            /process\.env\./.test(src)
          ) {
            found.add(rel);
          }
        } catch {
          // ignore unreadable
        }
      }
    }
  }
  walk(libRoot);
  return [...found].sort();
}

test("feature flag helpers never default ON via NODE_ENV === development", () => {
  const offenders: string[] = [];
  for (const rel of discoverFlagFiles()) {
    const abs = join(WEB_ROOT, rel);
    let src: string;
    try {
      src = blankComments(readFileSync(abs, "utf8"));
    } catch {
      continue; // listed path not present yet
    }
    // Ban returning / short-circuiting ON from NODE_ENV development.
    // Allows logging / host-context loops that mention NODE_ENV in comments only
    // (already blanked) or non-return comparisons in non-flag files — we only
    // scan flag helpers.
    if (/NODE_ENV\s*===\s*["']development["']/.test(src)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "Flag helpers must not use NODE_ENV===development as a default. " +
      "Use explicit env (1/0) so local and prod match. Offenders: " +
      offenders.join(", "),
  );
});
