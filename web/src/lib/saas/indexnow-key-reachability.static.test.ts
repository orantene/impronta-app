/**
 * TUL-589: `/indexnow-key.txt` must answer on every host kind (agency, app,
 * hub, marketing) — IndexNow checks `keyLocation` against whichever host a
 * pinged URL belongs to, which can be a talent's or an agency's own custom
 * domain. Pins the fourth layer (reachability) per AGENTS.md's "four-layer
 * rule": a path missing from `STATIC_PATHS` 404s on every host even though
 * the route handler itself is correct and its own test passes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";
import type { HostKind } from "@/lib/saas/host-kinds";

const HOST_KINDS: readonly HostKind[] = ["agency", "app", "hub", "marketing"];

test("/indexnow-key.txt is allowed on every host kind", () => {
  for (const kind of HOST_KINDS) {
    assert.equal(
      isPathAllowedForHostKind(kind, "/indexnow-key.txt"),
      true,
      `/indexnow-key.txt must be reachable on the ${kind} host kind`,
    );
  }
});
