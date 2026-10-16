/**
 * A11Y: no text colour uses the legacy 35% or 38% ink alpha (TUL-1205).
 *
 * Roughly a hundred files declared their own grey for secondary text as ink
 * at 35% or 38% alpha: 2.5:1 on white, against 4.5:1 for normal text. They
 * were raised to 60% (>= 4.99:1; same value as `--color-admin-ink-dim` after
 * TUL-1189). This guard stops the old values coming back on a text colour.
 *
 * Scope is deliberately narrow: only the two legacy alphas, only lines that
 * set a text colour (a `color`, `inkDim`, `dim` or `INK_DIM` key). Shadows,
 * fills, borders and strokes are not text and are left alone.
 *
 * An allow-list entry that no longer needs it is harmless (never fails), so
 * entries can be deleted whenever the file is swapped.
 *
 * FOLLOW-UPS (not covered here): text greys at other low alphas (0.40 to 0.55)
 * that also sit under 4.5:1, and the files in ALLOWED_UNTIL_THEIR_PRS_LAND.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Files that still carry the legacy value because another open PR edits them.
 * Remove each entry when that PR lands and the file is swapped.
 */
const ALLOWED_UNTIL_THEIR_PRS_LAND = new Set([
  "app/%5Fpage-not-found/page.tsx",
  "app/(workspace)/[tenantSlug]/client/layout.tsx",
  "app/(workspace)/[tenantSlug]/client/messages/ClientMessagesShell.tsx",
  "app/(workspace)/[tenantSlug]/client/messages/DetailsTab.tsx",
  "app/(workspace)/[tenantSlug]/talent/settings/ProfileVisibilityDrawer.tsx",
  "app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard.tsx",
  "app/(workspace)/talent/discover/page.tsx",
  "app/(workspace)/talent/not-found.tsx",
  "app/client/hub/page.tsx",
  "app/not-found.tsx",
  "app/share/shortlist/[token]/page.tsx",
  "components/admin/registration/RegistrationSettingsClient.tsx",
  "components/admin/shell/admin-shell-client.tsx",
  "components/admin/shell/internal/drawers/drawer-shared.tsx",
  "components/support-desk/SupportDeskForbidden.tsx",
  // Money surface (display only): shipped in the separate "MONEY (display only)" PR.
  "app/(workspace)/[tenantSlug]/admin/payouts/base-fee-client.tsx",
  "app/(workspace)/[tenantSlug]/admin/payouts/payouts-section-client.tsx",
]);

const LEGACY_ALPHA = /rgba\(\s*11,\s*11,\s*13,\s*0\.3[58]\s*\)/;
const TEXT_COLOUR_KEY = /(?:^|[\s{,])(?:color|inkDim|dim|INK_DIM)\s*[:=]/;
const NOT_TEXT = /shadow|background|border|outline|stroke=|fill=/i;

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield full;
  }
}

test("no text colour uses the legacy 35%/38% ink alpha outside the allow-list", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join("/");
    if (ALLOWED_UNTIL_THEIR_PRS_LAND.has(rel)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (LEGACY_ALPHA.test(line) && TEXT_COLOUR_KEY.test(line) && !NOT_TEXT.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
  }
  assert.deepEqual(
    offenders,
    [],
    `text colour at the legacy 35%/38% ink alpha (2.5:1, below AA). Use the 60% value or var(--color-admin-ink-dim):\n${offenders.join("\n")}`,
  );
});
