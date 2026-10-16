import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * GRK-054 — directory card "Inquire" must open the chat launcher after add,
 * not silently toggle the lineup/shortlist only.
 */

const here = dirname(fileURLToPath(import.meta.url));
const actionsSrc = readFileSync(join(here, "talent-card-actions.tsx"), "utf8");

test("GRK-054: Inquire ADD calls openInquiry after toggleInCart", () => {
  assert.match(
    actionsSrc,
    /cart\.toggleInCart\([\s\S]*?\)[\s\S]*?if \(willAdd\) \{\s*cart\.openInquiry\(\{\s*sourcePage\s*\}\)/,
    "handleInquiry must open the inquiry composer on ADD (not shortlist-only)",
  );
});

test("GRK-054: remove path does not openInquiry", () => {
  // openInquiry only inside the willAdd branch after toggle — not on remove.
  const openCalls = actionsSrc.match(/cart\.openInquiry\(/g) ?? [];
  assert.equal(
    openCalls.length,
    1,
    "openInquiry should run once (ADD only); remove stays toggle-only",
  );
  assert.match(
    actionsSrc,
    /if \(willAdd\) \{\s*cart\.openInquiry/,
    "openInquiry must be gated on willAdd",
  );
});
