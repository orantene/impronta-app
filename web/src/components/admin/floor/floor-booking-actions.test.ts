/**
 * TUL-1757: which reservations the host may no-show or cancel, the wiring of the detail sheet,
 * the capability on the two writers, and the copy (en + es, no em dashes).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

import { canCancelReservation, canMarkNoShow, type FloorBookState } from "./floor-model";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const START = "2026-10-21T20:00:00.000Z";
const at = (minutes: number) => Date.parse(START) + minutes * 60_000;

describe("canMarkNoShow", () => {
  it("is offered once the booked time has passed, even inside the grace window (+9 min)", () => {
    assert.equal(canMarkNoShow({ state: "arriving", startsAtIso: START }, at(9)), true);
    assert.equal(canMarkNoShow({ state: "late", startsAtIso: START }, at(45)), true);
  });
  it("is not offered before the booked time", () => {
    assert.equal(canMarkNoShow({ state: "arriving", startsAtIso: START }, at(-5)), false);
    assert.equal(canMarkNoShow({ state: "booked", startsAtIso: START }, at(-60)), false);
  });
  it("is not offered for a party already seated, marked, or done", () => {
    for (const state of ["seated", "part_seated", "no_show", "completed"] as FloorBookState[]) {
      assert.equal(canMarkNoShow({ state, startsAtIso: START }, at(30)), false, state);
    }
  });
});

describe("canCancelReservation", () => {
  it("is offered until somebody sits down", () => {
    for (const state of ["booked", "arriving", "late"] as FloorBookState[]) assert.equal(canCancelReservation({ state }), true, state);
    for (const state of ["seated", "part_seated", "no_show", "completed"] as FloorBookState[]) assert.equal(canCancelReservation({ state }), false, state);
  });
});

describe("the two writers are never capability-less", () => {
  const src = strip(read("src/app/(workspace)/[tenantSlug]/admin/reservations/actions.ts"));
  it("both go through operate_venue, not the bare default", () => {
    assert.match(src, /requireWorkspaceStaffAction\(\{ capability: "operate_venue" \}\)/);
    for (const fn of ["reservationsMarkNoShow", "reservationsCancel"]) {
      const start = src.indexOf(`export async function ${fn}(`);
      assert.ok(start > 0, fn);
      const body = src.slice(start, start + 700);
      assert.match(body, /await reservationOperator\(\)/, fn);
      assert.match(body, /await requireNotImpersonating\(\)/, fn);
    }
  });
  it("takes no clock from the caller", () => {
    const start = src.indexOf("export async function reservationsMarkNoShow(");
    assert.match(src.slice(start, start + 200), /input: \{ admissionId: string \}/);
    assert.match(src, /now: new Date\(\)/);
  });
  it("a viewer cannot run the floor; an editor can", () => {
    assert.equal(roleGrantsCapability("viewer", "operate_venue"), false);
    assert.equal(roleGrantsCapability("editor", "operate_venue"), true);
  });
});

describe("the board opens a booking's own detail", () => {
  it("a tapped booking opens the detail, never the walk-in waiting list", () => {
    const src = strip(read("src/components/admin/floor/FloorBoard.tsx"));
    const start = src.indexOf("function pickEntry(");
    const body = src.slice(start, src.indexOf("async function seat(", start));
    assert.match(body, /kind: "booking"/);
    assert.doesNotMatch(body, /kind: "waiting"/);
  });
  it("a cancelled reservation leaves tonight's book", () => {
    const src = strip(read("src/app/(workspace)/[tenantSlug]/admin/reservations/floor-book.ts"));
    assert.match(src, /data\.entries\.filter\(\(e\) => !e\.isVoid\)/);
  });
  it("both floors wire the writers", () => {
    for (const p of ["src/app/(workspace)/[tenantSlug]/admin/reservations/LiveFloorClient.tsx", "src/app/(workspace)/[tenantSlug]/admin/pos/floor-client.tsx"]) {
      const src = read(p);
      assert.match(src, /markNoShow: \(input\) => reservationsMarkNoShow\(input\)/, p);
      assert.match(src, /cancelReservation: \(input\) => reservationsCancel\(input\)/, p);
    }
  });
});

describe("copy", () => {
  const get = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined), o);
  const en = JSON.parse(read("messages/en.json")) as unknown;
  const es = JSON.parse(read("messages/es.json")) as unknown;
  for (const base of ["dashboard.pos.floor.board.booking", "dashboard.workspaceBookings"]) {
    it(`${base} has the same keys in en and es, with no em dashes`, () => {
      const a = get(en, base) as Record<string, string>;
      const b = get(es, base) as Record<string, string>;
      assert.ok(a && b, "both locales carry the block");
      assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
      for (const v of [...Object.values(a), ...Object.values(b)]) assert.ok(!v.includes("\u2014"), v);
    });
  }
  it("every key the booking copy reads exists", () => {
    const src = read("src/components/admin/floor/floor-copy-booking.ts");
    const keys = [...src.matchAll(/\$\{K\}\.(\w+)/g)].map((m) => m[1]);
    const block = get(en, "dashboard.pos.floor.board.booking") as Record<string, string>;
    for (const k of keys) assert.ok(k in block, k);
  });
  it("the Spanish bookings page has no English left in the status labels", () => {
    const es2 = get(es, "dashboard.workspaceBookings") as Record<string, string>;
    assert.notEqual(es2.statusPaid, "Paid");
    assert.notEqual(es2.title, "Bookings");
  });
  it("the client drawer's trust text reads the catalog, not the English fixture", () => {
    const src = read("src/components/admin/shell/internal/drawers/light-06.tsx");
    assert.doesNotMatch(src, /CLIENT_TRUST_META\[trust\]\.(hint|rationale)/);
    assert.match(src, /tKey\(TRUST_TIER_KEYS\[trust\]\.hint\)/);
  });
});
