import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { replaceOfferingChildren } from "./offerings-children";

/** Minimal fake: records every insert per table and echoes ids back. */
function fakeDb() {
  const inserted: Record<string, Record<string, unknown>[]> = {};
  const db = {
    from(table: string) {
      return {
        delete: () => ({ eq: async () => ({ error: null }) }),
        insert: (rows: Record<string, unknown>[]) => {
          inserted[table] = rows;
          return {
            select: async () => ({
              data: rows.map((r, i) => ({ id: `${table}-${i}`, ...r })),
              error: null,
            }),
          };
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, inserted };
}

test("5e: an extra keeps its added minutes through a replace (duplicate / options save)", async () => {
  const { db, inserted } = fakeDb();
  const res = await replaceOfferingChildren(
    db,
    "o1",
    { variants: [], addOns: [{ label: "Beard", amountCents: 500, durationMinutes: 15 }, { label: "Wax", amountCents: 300 }] },
    "test",
  );
  assert.equal(res.ok, true);
  assert.equal(inserted.talent_offering_addons![0]!.duration_minutes, 15);
  assert.equal(inserted.talent_offering_addons![1]!.duration_minutes, null);
  if (res.ok) assert.equal(res.addOns[0]!.durationMinutes, 15);
});

test("5d: translations ride along on options and extras (label_i18n is kept, not dropped)", async () => {
  const { db, inserted } = fakeDb();
  await replaceOfferingChildren(
    db,
    "o1",
    {
      variants: [{ label: "Large", amountCents: null, labelI18n: { en: "Large", es: "Grande" } }],
      addOns: [{ label: "Extra", amountCents: 100, labelI18n: { en: "Extra", es: "Adicional" } }],
    },
    "test",
  );
  assert.deepEqual(inserted.talent_offering_variants![0]!.label_i18n, { en: "Large", es: "Grande" });
  assert.deepEqual(inserted.talent_offering_addons![0]!.label_i18n, { en: "Extra", es: "Adicional" });
});
