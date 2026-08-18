import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { MOBILE_HEALTH_KIND_ORDER } from "@/lib/site-admin/builder-node/mobile-health";

/**
 * The advisory panel must render EVERY issue kind the checker can produce.
 *
 * It shipped with a hand-written render loop of three kinds while the badge
 * counted all of them, so `trapped_drawer` — a real, detected defect — was
 * counted but never displayed and never locatable. Deriving the loop from the
 * exported order is the fix; these assertions stop the hand-written list from
 * coming back.
 */
const PANEL = readFileSync(
  new URL("./MobileHealthPanel.tsx", import.meta.url),
  "utf8",
);
const LIB = readFileSync(
  new URL("../../lib/site-admin/builder-node/mobile-health.ts", import.meta.url),
  "utf8",
);

test("the panel derives its render loop from the exported kind order", () => {
  assert.match(PANEL, /\{MOBILE_HEALTH_KIND_ORDER\s*\n?\s*\.filter\(/);
  assert.ok(
    !/\[\s*"tiny_text",\s*"tap_target",\s*"overflow"\s*\]\s*as const/.test(PANEL),
    "a hand-written kind list silently drops any kind added later",
  );
});

test("the exported order covers every kind the checker can emit", () => {
  // Parse the union members off the source so a NEW kind fails here rather
  // than going invisible in the panel.
  const union = LIB.slice(
    LIB.indexOf("export type MobileHealthCheckKind"),
    LIB.indexOf(";", LIB.indexOf("export type MobileHealthCheckKind")),
  );
  const kinds = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 4, "expected the checker's kind union");
  for (const kind of kinds) {
    assert.ok(
      (MOBILE_HEALTH_KIND_ORDER as readonly string[]).includes(kind),
      `"${kind}" is detectable but has no place in the panel's order`,
    );
  }
});

test("the panel can label and colour every ordered kind", () => {
  for (const kind of MOBILE_HEALTH_KIND_ORDER) {
    assert.ok(
      PANEL.includes(`${kind}:`),
      `"${kind}" has no KIND_LABEL/KIND_COLOR entry — it would render blank`,
    );
  }
});
