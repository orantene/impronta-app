import assert from "node:assert/strict";
import { test } from "node:test";

import { BUSINESS_TYPES } from "@/lib/words/business-types";
import { IMAGE_SLOT_KEYS } from "../types";
import { DIRECTION_IDS, TYPE_CONTEXT, resolveStockPrompt } from "./layers";

test("every business type has its own context line (adding a type = one line)", () => {
  const missing = BUSINESS_TYPES.map((t) => t.id).filter((id) => !TYPE_CONTEXT[id]);
  assert.deepEqual(missing, []);
});

test("every type × slot × direction resolves to a prompt with all five layer versions", () => {
  for (const t of BUSINESS_TYPES) {
    for (const slot of IMAGE_SLOT_KEYS) {
      for (const direction of DIRECTION_IDS) {
        const r = resolveStockPrompt({ family: t.family, typeId: t.id, slot, direction });
        assert.ok(r.prompt.length > 200, `${t.id}/${slot}/${direction}`);
        assert.match(r.prompt, /No logos, no brand marks, no readable text/);
        assert.equal(r.layerVersions.type, `type@v1:${t.id}`);
        assert.equal(Object.keys(r.tags).length, 0);
      }
    }
  }
});

test("facts appear only when stated, and only the stated ones become tags", () => {
  const neutral = resolveStockPrompt({ family: "dining", typeId: "restaurant", slot: "hero", direction: "service" });
  assert.doesNotMatch(neutral.prompt, /The food is/);
  const indian = resolveStockPrompt({ family: "dining", typeId: "restaurant", slot: "hero", direction: "service", facts: { cuisine: "Indian", words: ["family recipes"] } });
  assert.match(indian.prompt, /The food is Indian\./);
  assert.match(indian.prompt, /"family recipes"/);
  assert.deepEqual(indian.tags, { cuisine: "Indian", words: "family recipes" });
  // A blank fact is not a fact.
  const blank = resolveStockPrompt({ family: "dining", typeId: "restaurant", slot: "hero", direction: "service", facts: { cuisine: "   ", clientele: "" } });
  assert.deepEqual(blank.tags, {});
});

test("every direction names its setting so five heroes are not one scene", () => {
  const prompts = DIRECTION_IDS.map((d) => resolveStockPrompt({ family: "beauty", typeId: "nail-salon", slot: "hero", direction: d }).prompt);
  assert.equal(new Set(prompts).size, DIRECTION_IDS.length);
  for (const p of prompts) assert.match(p, /light/);
});

test("unknown type ids fall back to the family with the custom context, never throw", () => {
  const r = resolveStockPrompt({ family: "tours", typeId: "kite-school", slot: "gallery-2", direction: "minimal" });
  assert.equal(r.role, "gallery");
  assert.equal(r.size, "1024x1024");
  assert.equal(r.layerVersions.type, "type@v1:custom");
});
