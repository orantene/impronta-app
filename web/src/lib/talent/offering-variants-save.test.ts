import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { replaceOfferingChildren } from "./offerings-children";

const SRC = resolve(process.cwd(), "src");
const home = readFileSync(resolve(SRC, "components/talent/services/ServicesHome.tsx"), "utf8");

test("5a: the product editor's save persists the variants (not only upsert + images)", () => {
  const onSave = home.slice(home.indexOf("onSave={async (next, publish, pendingImageIds)"));
  assert.match(onSave, /await upsertTalentOffering\(talentId, payload\)/);
  assert.match(onSave, /setOfferingVariants\(\s*talentId,\s*res\.item\.id,/);
  assert.match(onSave, /next\.variants !== undefined/);
});

test("5a: variants-only replace leaves the extras table untouched", async () => {
  const touched: string[] = [];
  const db = {
    from(table: string) {
      return {
        delete: () => ({ eq: async () => { touched.push(`delete:${table}`); return { error: null }; } }),
        insert: (rows: Record<string, unknown>[]) => {
          touched.push(`insert:${table}`);
          return { select: async () => ({ data: rows.map((r, i) => ({ id: `v${i}`, ...r })), error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient;
  const res = await replaceOfferingChildren(
    db,
    "o1",
    { variants: [{ label: "Large", amountCents: null }, { label: "Small", amountCents: 900 }], addOns: [] },
    "test",
    "en",
    { only: "variants" },
  );
  assert.equal(res.ok, true);
  assert.deepEqual(touched, ["delete:talent_offering_variants", "insert:talent_offering_variants"]);
  if (res.ok) assert.deepEqual(res.variants.map((v) => v.label), ["Large", "Small"]);
});
