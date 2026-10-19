import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * TUL-1205 / TUL-1220: the grey TEXT colour is rgba(11,11,13,0.6) (at least 4.99:1
 * on white). 0.35 / 0.38 fail WCAG AA. These files carry user-visible text greys
 * that were raised; a text colour line must not drop back below 0.6.
 * Shadows, backgrounds and icon strokes at 0.35 are decorative and not scanned.
 */
const SRC = join(process.cwd(), "src");
const FILES = [
  "app/%5Fpage-not-found/page.tsx",
  "app/(workspace)/[tenantSlug]/client/layout.tsx",
  "app/(workspace)/[tenantSlug]/client/messages/ClientMessagesShell.tsx",
  "app/(workspace)/[tenantSlug]/client/messages/DetailsTab.tsx",
  "app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard.tsx",
  "app/(workspace)/talent/discover/page.tsx",
  "app/(workspace)/talent/not-found.tsx",
  "app/client/hub/page.tsx",
  "app/not-found.tsx",
  "app/share/shortlist/[token]/page.tsx",
  "components/admin/registration/RegistrationSettingsClient.tsx",
  "components/support-desk/SupportDeskForbidden.tsx",
];

/** A text-colour key directly followed by the ink grey: `color: "rgba(11,11,13,0.4)"`, `inkDim: ...`. */
const TEXT_GREY = /(?:^|[\s{,])(?:color|inkDim|dim|INK_DIM|fg|textColor)\s*:\s*["'`]rgba\(\s*11\s*,\s*11\s*,\s*13\s*,\s*(0?\.\d+)\s*\)/g;

for (const rel of FILES) {
  test(`TUL-1205: no text grey below 60% in ${rel}`, () => {
    const lines = readFileSync(join(SRC, rel), "utf8").split("\n");
    const bad: string[] = [];
    lines.forEach((line, i) => {
      for (const m of line.matchAll(TEXT_GREY)) {
        if (Number(m[1]) < 0.6) bad.push(`${rel}:${i + 1} ${m[0].trim()}`);
      }
    });
    assert.deepEqual(bad, []);
  });
}

/**
 * TUL-1205 (repo-wide ratchet). The 12 files above are guarded one by one; the rest of src/ was
 * not scanned at all. This walks every non-test .ts/.tsx under src/ with the same TEXT_GREY rule.
 * Files below still hold a text grey under 0.6 (measured 2026-10-19, 16 files): no other file may
 * add one and the count may not grow. Fixing one means deleting it from the list (shrinking never
 * fails). This does not fix those 16 files; it stops the number from rising.
 */
const KNOWN_BELOW_60 = new Set([
  "app/(workspace)/[tenantSlug]/admin/activity-log/ActivityLogClient.tsx",
  "app/(workspace)/[tenantSlug]/client/discover/DiscoverShell.tsx",
  "app/(workspace)/[tenantSlug]/client/messages/LineupAddTalentPicker.tsx",
  "app/(workspace)/[tenantSlug]/talent/settings/ProfileVisibilityDrawer.tsx",
  "app/unsubscribe/[token]/page.tsx",
  "app/unsubscribe/conversation/page.tsx",
  "components/admin/shell/internal/drawers/drawer-shared.tsx",
  "components/admin/shell/internal/drawers/profile-shell/profile-shell-modules/profile-identity-editor.tsx",
  "components/admin/shell/internal/messages/shared/inbox-identity-1.tsx",
  "components/admin/shell/internal/messages/talent-2.tsx",
  "components/admin/shell/internal/page-modules/CardDesignStudio-4.tsx",
  "components/admin/shell/internal/primitives/cards.tsx",
  "components/admin/shell/internal/state/fixtures.ts",
  "components/admin/shell/internal/workspace.tsx",
  "components/inquiry/GuestTrustChip.tsx",
  "components/messages-status-sheet/StatusSheet.tsx",
]);

function* sourceFiles(dir: string, rel = ""): Generator<string> {
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* sourceFiles(dir, r);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) yield r;
  }
}

function lowGreyFiles(src: string): string[] {
  const out: string[] = [];
  for (const rel of sourceFiles(src)) {
    const text = readFileSync(join(src, rel), "utf8");
    if ([...text.matchAll(TEXT_GREY)].some((m) => Number(m[1]) < 0.6)) out.push(rel);
  }
  return out.sort();
}

test("TUL-1205: repo-wide, no NEW file holds a text grey below 60% (ratchet of 16)", () => {
  const found = lowGreyFiles(SRC);
  const added = found.filter((f) => !KNOWN_BELOW_60.has(f));
  assert.deepEqual(added, [], `new text grey below 0.6; use rgba(11,11,13,0.6) or a token:\n${added.join("\n")}`);
  assert.ok(found.length <= KNOWN_BELOW_60.size, `${found.length} files (ceiling ${KNOWN_BELOW_60.size})`);
});

test("TUL-1205: the repo-wide scanner sees the 12 guarded files clean and is not scanning nothing", () => {
  const found = new Set(lowGreyFiles(SRC));
  for (const f of FILES) assert.equal(found.has(f), false, `${f} regressed`);
  assert.ok(found.size > 0, "scanner finds the known offenders");
});
