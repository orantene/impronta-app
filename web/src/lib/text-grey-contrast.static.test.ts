import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
