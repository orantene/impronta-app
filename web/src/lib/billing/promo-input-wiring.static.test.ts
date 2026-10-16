import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/** TUL-833: the "Have a code?" box is mounted on the talent upgrade button and its code reaches checkout. */
const shell = readFileSync(
  join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/settings/TalentSubscriptionShell.tsx"),
  "utf8",
);

test("talent upgrade button mounts PromoCodeInput", () => {
  assert.match(shell, /import \{ PromoCodeInput \} from "@\/components\/billing\/promo-code-input"/);
  assert.match(shell, /<PromoCodeInput plan=\{plan\} interval="month" onApplied=/);
  assert.match(shell, /data-testid="promo-code-input"/);
});

test("applied code is forwarded to startTalentUpgrade; removing it falls back to the URL param", () => {
  assert.match(shell, /startTalentUpgrade\(plan, tenantSlug, appliedCode \?\? readPromoCodeFromUrl\(\)\)/);
  assert.match(shell, /onApplied=\{\(code\) => setAppliedCode\(code\)\}/);
});
