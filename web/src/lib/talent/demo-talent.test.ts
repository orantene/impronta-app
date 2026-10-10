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

import { anyDemoTalent, demoSiteFooterText } from "./demo-talent";

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

describe("demoSiteFooterText (TUL-531 eyes-0433-01)", () => {
  it("never says bookings are off while the widget offers slots", () => {
    assert.doesNotMatch(demoSiteFooterText("es", true), /desactivadas/);
    assert.doesNotMatch(demoSiteFooterText("en", true), /turned off/);
  });

  it("says bookings are off when the switch is off", () => {
    assert.match(demoSiteFooterText("es-MX", false), /desactivadas/);
    assert.match(demoSiteFooterText("en", false), /turned off/);
  });

  it("matches ES and EN meaning when bookings are on", () => {
    assert.equal(demoSiteFooterText("es", true), "Perfil de demostración. Las reservas son simuladas.");
    assert.equal(demoSiteFooterText("en", true), "Demo profile. Bookings are simulated.");
  });
});
