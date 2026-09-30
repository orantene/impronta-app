import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { planGenerate } from "./generate-items.server";
import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";

const from: DesignPayload = { shellTree: [], homeTree: [], tokenDefaults: { "spacing.row": "8px" } };
const to: DesignPayload = { shellTree: [], homeTree: [], tokenDefaults: { "spacing.row": "12px" } };
const REL = { design_slug: "maison-v2", from_version: 1, to_version: 2, items: [], base_payload: null };

test("plan: empty items and base are filled from the snapshots", () => {
  const p = planGenerate(REL, from, to);
  assert.equal(p.items?.length, 1);
  assert.equal(p.items?.[0]?.type, "token-default");
  assert.equal(p.basePayload, from);
});

test("plan: existing items and base are never overwritten", () => {
  const p = planGenerate({ ...REL, items: [{ type: "code", key: "x" }], base_payload: {} }, from, to);
  assert.deepEqual(p, { items: null, basePayload: null });
});

test("action clears the dry run and is wired through the gated wrapper", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const src = readFileSync(join(here, "generate-items.server.ts"), "utf8");
  assert.match(src, /dry_run_report: null/);
  const actions = readFileSync(join(here, "../../../../app/(workspace)/platform/admin/builder-lab/themes/actions.ts"), "utf8");
  assert.match(actions, /actionGenerateItems[\s\S]*withRelease/);
});
