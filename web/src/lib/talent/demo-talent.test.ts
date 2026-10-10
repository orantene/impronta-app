/**
 * UNIT TEST — anyDemoTalent (2026-09-28).
 *
 * Demo talents must never receive real inquiries, and a real talent must
 * never be blocked by this check: a lookup error fails open.
 *
 * Run: npx tsx --test src/lib/talent/demo-talent.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { anyDemoTalent, DEMO_SITE_FOOTER } from "./demo-talent";

function stub(rows: { id: string }[] | null, error = false) {
  const calls: string[][] = [];
  const db = {
    from() {
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              calls.push(ids);
              return {
                eq() {
                  return { limit: async () => ({ data: rows, error: error ? { message: "boom" } : null }) };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

describe("DEMO_SITE_FOOTER", () => {
  it("GRK-027: ES and EN both say bookings are disabled (not simulated)", () => {
    assert.match(DEMO_SITE_FOOTER.es, /desactivadas/i);
    assert.match(DEMO_SITE_FOOTER.en, /disabled/i);
    assert.doesNotMatch(DEMO_SITE_FOOTER.en, /simulated/i);
  });
});

describe("anyDemoTalent", () => {
  it("is true when a demo row comes back", async () => {
    const { db } = stub([{ id: "t1" }]);
    assert.equal(await anyDemoTalent(db, ["t1", "t2"]), true);
  });

  it("is false for real talents", async () => {
    const { db } = stub([]);
    assert.equal(await anyDemoTalent(db, ["t1"]), false);
  });

  it("fails open on a read error", async () => {
    const { db } = stub(null, true);
    assert.equal(await anyDemoTalent(db, ["t1"]), false);
  });

  it("skips the query when there are no ids", async () => {
    const { db, calls } = stub([{ id: "x" }]);
    assert.equal(await anyDemoTalent(db, [null, undefined, ""]), false);
    assert.equal(calls.length, 0);
  });
});
