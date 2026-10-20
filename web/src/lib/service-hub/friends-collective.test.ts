/**
 * TUL-1374: Friends collective preset (Model E), for ANY small group of sellers
 * in any trade: one owner coordinates and takes a % or a fixed amount per
 * member; members never see the client chat. These are the pure rules the
 * workspace screens and checkout read, so they are pinned here first.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  COLLECTIVE_OWNER_SHARE_CAP_BPS,
  collectiveAccess,
  collectiveReviewRouting,
  collectiveSeatState,
  memberPriceLine,
  memberNetCents,
  ownerTakeCents,
  validateOwnerShare,
} from "./friends-collective";
import { COLLECTIVE_COPY } from "./friends-collective-copy";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("owner share: a % or a fixed amount, capped at 90%", () => {
  test("the cap is 90% (9000 bps)", () => {
    assert.equal(COLLECTIVE_OWNER_SHARE_CAP_BPS, 9000);
  });

  test("percent: 0 to 90% in whole bps is valid; more, less, or fractions are refused", () => {
    for (const bps of [0, 1, 1000, 9000]) assert.deepEqual(validateOwnerShare({ kind: "percent", bps }), { ok: true });
    for (const bps of [-1, 9001, 10_000, 12.5, Number.NaN]) {
      assert.equal(validateOwnerShare({ kind: "percent", bps }).ok, false, String(bps));
    }
  });

  test("fixed: a whole, non-negative amount in a named currency", () => {
    assert.deepEqual(validateOwnerShare({ kind: "fixed", amountCents: 5000, currency: "MXN" }), { ok: true });
    assert.equal(validateOwnerShare({ kind: "fixed", amountCents: -1, currency: "MXN" }).ok, false);
    assert.equal(validateOwnerShare({ kind: "fixed", amountCents: 10.5, currency: "MXN" }).ok, false);
    assert.equal(validateOwnerShare({ kind: "fixed", amountCents: 5000, currency: "" }).ok, false);
  });

  test("owner take and member net always add up to the price (no cent appears or vanishes)", () => {
    for (const price of [1, 99, 10_000, 123_457]) {
      for (const share of [
        { kind: "percent", bps: 0 },
        { kind: "percent", bps: 1500 },
        { kind: "percent", bps: 9000 },
        { kind: "fixed", amountCents: 3000, currency: "USD" },
      ] as const) {
        assert.equal(ownerTakeCents(price, share) + memberNetCents(price, share), price, `${price} ${JSON.stringify(share)}`);
      }
    }
  });

  test("percent rounds to the cent; a fixed take larger than 90% of the price is capped so the member keeps at least 10%", () => {
    assert.equal(ownerTakeCents(10_000, { kind: "percent", bps: 1500 }), 1500);
    assert.equal(ownerTakeCents(999, { kind: "percent", bps: 1500 }), 150);
    assert.equal(ownerTakeCents(10_000, { kind: "fixed", amountCents: 3000, currency: "USD" }), 3000);
    assert.equal(ownerTakeCents(10_000, { kind: "fixed", amountCents: 50_000, currency: "USD" }), 9000);
    assert.equal(memberNetCents(10_000, { kind: "fixed", amountCents: 50_000, currency: "USD" }), 1000);
  });

  test("an invalid share takes nothing (fail closed for the member)", () => {
    assert.equal(ownerTakeCents(10_000, { kind: "percent", bps: 99_999 }), 0);
    assert.equal(ownerTakeCents(10_000, { kind: "fixed", amountCents: -5, currency: "USD" }), 0);
    assert.equal(ownerTakeCents(-5, { kind: "percent", bps: 1000 }), 0);
  });
});

describe("who sees what", () => {
  test("members see the job card and the talent thread, never the client chat or the client's contact", () => {
    const m = collectiveAccess("member");
    assert.deepEqual(m, { jobCard: true, talentThread: true, clientThread: false, clientContact: false, otherMembersShares: false });
  });
  test("the owner sees everything and is the coordinator", () => {
    const o = collectiveAccess("owner");
    assert.deepEqual(o, { jobCard: true, talentThread: true, clientThread: true, clientContact: true, otherMembersShares: true });
  });
  test("reviews: public on the owner's page, private feedback to the member", () => {
    assert.deepEqual(collectiveReviewRouting(), { publicOn: "owner_page", memberGets: "private_feedback" });
  });
});

describe("Free seat cap of 5 is respected", () => {
  test("free: 5 seats, the sixth is refused", () => {
    assert.deepEqual(collectiveSeatState("free", 4), { cap: 5, remaining: 1, canAdd: true });
    assert.deepEqual(collectiveSeatState("free", 5), { cap: 5, remaining: 0, canAdd: false });
    assert.equal(collectiveSeatState("free", 9).canAdd, false);
  });
  test("a paid plan uses its own cap; an unknown plan is held to the Free cap", () => {
    assert.equal(collectiveSeatState("studio", 14).canAdd, true);
    assert.equal(collectiveSeatState("agency", 500).canAdd, true);
    assert.equal(collectiveSeatState("mystery", 5).canAdd, false);
  });
});

describe("the member's price is shown with her name", () => {
  test("EN and ES", () => {
    assert.equal(memberPriceLine({ name: "Ana", priceCents: 50_000, currency: "MXN" }, "es"), "Ana · $500.00");
    assert.match(memberPriceLine({ name: "Ana", priceCents: 50_000, currency: "USD" }, "en"), /^Ana · \$500\.00$/);
  });
  test("no name, no price line (never an anonymous price)", () => {
    assert.equal(memberPriceLine({ name: "  ", priceCents: 100, currency: "USD" }, "en"), null);
  });
});

describe("existing behavior this preset relies on stays pinned", () => {
  test("an inquiry on a non-hub workspace goes to the workspace owner as coordinator by default", () => {
    const src = read("../inquiry/coordinator-assignment.ts");
    assert.match(src, /agencies\.default_coordinator_user_id/);
    assert.match(src, /workspace owner/);
    assert.match(src, /resolveTenantOwnerId/);
  });
  test("a talent is the seller only on the hub; on any other workspace she never gets the client sale or the client thread", () => {
    const pov = read("../messaging/talent-pov.ts");
    assert.match(pov, /She is the seller only when the inquiry's tenant is the platform hub/);
    const rule = read("../messaging/thread-rule.ts");
    assert.match(rule, /"private" is the CLIENT thread/);
    assert.match(rule, /"group" is the TALENT thread/);
  });
  test("the Free roster cap is the single source of truth", () => {
    assert.match(read("../saas/plan-seat-caps.ts"), /free: 5,/);
  });
});

describe("copy exists in ES and EN", () => {
  for (const f of ["en", "es"] as const) {
    test(f, () => {
      const c = COLLECTIVE_COPY[f];
      for (const k of ["title", "summary", "ownerShare", "capNote", "membersSee", "reviews", "seatCap"] as const) {
        assert.equal(typeof c[k], "string", k);
        assert.ok(c[k].length > 0, k);
        assert.ok(!/[\u2013\u2014]/.test(c[k]), `no dash in ${k}`);
      }
    });
  }
  test("the 90% cap and the 5 seats are stated, and match the rules", () => {
    assert.match(COLLECTIVE_COPY.en.capNote, /90%/);
    assert.match(COLLECTIVE_COPY.es.capNote, /90%/);
    assert.match(COLLECTIVE_COPY.en.seatCap, /5 people/);
    assert.equal(COLLECTIVE_OWNER_SHARE_CAP_BPS, 9000);
  });
});

import { decideFriendsCollectivePreset } from "./friends-collective";

describe("applying the preset to a workspace (owner only, idempotent, respects seats)", () => {
  const base = { role: "owner", ownerUserId: "u-owner", currentModel: null, defaultCoordinatorUserId: null, seatOk: true } as const;

  test("the owner applies it: the model is recorded and ALL requests go to the owner's inbox", () => {
    assert.deepEqual(decideFriendsCollectivePreset(base), {
      ok: true,
      changed: true,
      set: { work_model: "friends_collective", default_coordinator_user_id: "u-owner" },
    });
  });
  test("a second apply is a no-op", () => {
    assert.deepEqual(
      decideFriendsCollectivePreset({ ...base, currentModel: "friends_collective", defaultCoordinatorUserId: "u-owner" }),
      { ok: true, changed: false, set: { work_model: "friends_collective", default_coordinator_user_id: "u-owner" } },
    );
  });
  test("it re-points the inbox at the owner if the coordinator drifted", () => {
    const d = decideFriendsCollectivePreset({ ...base, currentModel: "friends_collective", defaultCoordinatorUserId: "someone-else" });
    assert.equal(d.ok && d.changed, true);
  });
  test("admins and members cannot apply it; only the owner", () => {
    for (const role of ["admin", "editor", "viewer", null]) {
      assert.deepEqual(decideFriendsCollectivePreset({ ...base, role }), { ok: false, reason: "owner_only" });
    }
  });
  test("over the seat cap: refused (Free cap 5 respected)", () => {
    assert.deepEqual(decideFriendsCollectivePreset({ ...base, seatOk: false }), { ok: false, reason: "over_seat_cap" });
  });
  test("another model already chosen: refused, never silently switched", () => {
    for (const currentModel of ["coordinator_agency", "open_network", "team_studio", "rental_studio"]) {
      assert.deepEqual(decideFriendsCollectivePreset({ ...base, currentModel }), { ok: false, reason: "model_already_set" });
    }
  });
});

describe("the apply action and its held migration", () => {
  const act = read("./friends-collective-actions.ts");
  test("owner-only, not impersonating, seat-checked, audited, writes only work_model and the coordinator", () => {
    assert.match(act, /^"use server";/);
    assert.match(act, /requireNotImpersonating\(\)/);
    assert.match(act, /requireWorkspaceStaffAction\(\)/);
    assert.match(act, /checkRosterSeatAvailability\(/);
    assert.match(act, /decideFriendsCollectivePreset\(/);
    assert.match(act, /scheduleWorkspaceAudit\(/);
    assert.match(act, /\.update\(decision\.set\)/);
  });
  test("the migration is held at the reserved version, additive, and limits work_model to the five models", () => {
    const sql = readFileSync(new URL("../../../../supabase/migrations/_pending_pm/20261231420200_agencies_work_model_tul1374.sql", import.meta.url), "utf8");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS work_model TEXT/);
    for (const m of ["coordinator_agency", "open_network", "team_studio", "rental_studio", "friends_collective"]) assert.match(sql, new RegExp(m));
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|CREATE POLICY/);
    assert.match(sql, /Rollback/);
  });
});
