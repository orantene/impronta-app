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
    assert.match(memberPriceLine({ name: "Ana", priceCents: 50_000, currency: "USD" }, "en") ?? "", /^Ana · \$500\.00$/);
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
  test("a coordinator someone else already chose is never overwritten: refused with coordinator_already_set", () => {
    for (const currentModel of [null, "friends_collective"]) {
      assert.deepEqual(
        decideFriendsCollectivePreset({ ...base, currentModel, defaultCoordinatorUserId: "someone-else" }),
        { ok: false, reason: "coordinator_already_set" },
      );
    }
  });
  test("an unset coordinator, or the owner already, is fine", () => {
    assert.equal(decideFriendsCollectivePreset({ ...base, defaultCoordinatorUserId: null }).ok, true);
    assert.equal(decideFriendsCollectivePreset({ ...base, defaultCoordinatorUserId: "u-owner" }).ok, true);
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
  test("the audit is written synchronously and records the previous model and coordinator", () => {
    assert.match(act, /await logWorkspaceAudit\(/);
    assert.doesNotMatch(act, /scheduleWorkspaceAudit\(/);
    assert.match(act, /previous_work_model: row\.work_model/);
    assert.match(act, /previous_coordinator: row\.default_coordinator_user_id/);
  });
  test("owner-only, not impersonating, seat-checked, audited, writes only work_model and the coordinator", () => {
    assert.match(act, /^"use server";/);
    assert.match(act, /requireNotImpersonating\(\)/);
    assert.match(act, /requireWorkspaceStaffAction\(\)/);
    assert.match(act, /checkRosterSeatAvailability\(/);
    assert.match(act, /decideFriendsCollectivePreset\(/);
    assert.match(act, /logWorkspaceAudit\(/);
    assert.match(act, /\.update\(decision\.set\)/);
  });
  test("the migration is held at the reserved version, additive, and limits work_model to the five models", () => {
    const sql = readFileSync(new URL("../../../../supabase/migrations/_pending_pm/20261231420200_agencies_work_model_tul1374.sql", import.meta.url), "utf8");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS work_model TEXT/);
    for (const m of ["coordinator_agency", "open_network", "team_studio", "rental_studio", "friends_collective"]) assert.match(sql, new RegExp(m));
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|CREATE POLICY/);
    assert.match(sql, /Rollback/);
  });
  test("non-owner staff cannot change work_model or default_coordinator_user_id directly (the 418000 policies alone do NOT cover these columns)", () => {
    const rls = readFileSync(new URL("../../../../supabase/migrations/20261231418000_tenant_admin_tables_role_aware_rls.sql", import.meta.url), "utf8");
    // 418000 lets any ACTIVE non-viewer member UPDATE agencies and narrows only the 418100 platform columns.
    assert.match(rls, /agencies: UPDATE by ACTIVE non-viewer members/);
    assert.doesNotMatch(rls, /work_model|default_coordinator_user_id/);
    const sql = readFileSync(new URL("../../../../supabase/migrations/_pending_pm/20261231420200_agencies_work_model_tul1374.sql", import.meta.url), "utf8");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.agencies_protect_work_model\(\)/);
    assert.match(sql, /current_user IN \('authenticated', 'anon'\)/);
    assert.match(sql, /NEW\.work_model\s+IS DISTINCT FROM OLD\.work_model/);
    assert.match(sql, /NEW\.default_coordinator_user_id\s+IS DISTINCT FROM OLD\.default_coordinator_user_id/);
    assert.match(sql, /m\.role = 'owner'[\s\S]*m\.status = 'active'/);
    assert.match(sql, /public\.is_platform_admin\(\)/);
    assert.match(sql, /BEFORE UPDATE ON public\.agencies/);
    assert.match(sql, /ERRCODE = '42501'/);
  });
});

import { buildLineSnapshot, decideMemberShareUpdate, decideShareResponse, memberNetPreview } from "./friends-collective";
import { resolveBookingCommissions } from "../billing/commission";
import { proportionalRefundCents } from "../billing/commission-processing";

describe("the owner PROPOSES a member's share; it takes effect only when the member accepts it", () => {
  const ok = { role: "owner", workModel: "friends_collective", memberOnRoster: true } as const;

  test("a proposal writes the PENDING columns, never the effective share", () => {
    const d = decideMemberShareUpdate({ ...ok, share: { kind: "percent", bps: 2000 } });
    assert.equal(d.ok && d.mode, "propose");
    assert.deepEqual(d.ok && d.patch, { pending_share_kind: "percent", pending_share_bps: 2000, pending_share_cents: null, pending_share_currency: null });
    const f = decideMemberShareUpdate({ ...ok, share: { kind: "fixed", amountCents: 5000, currency: "mxn" } });
    assert.deepEqual(f.ok && f.patch, { pending_share_kind: "fixed", pending_share_bps: null, pending_share_cents: 5000, pending_share_currency: "MXN" });
  });
  test("clearing the share is immediate (it only helps the member) and drops any pending proposal", () => {
    const d = decideMemberShareUpdate({ ...ok, share: null });
    assert.equal(d.ok && d.mode, "clear");
    assert.deepEqual(d.ok && d.patch, {
      owner_share_kind: null, owner_share_bps: null, owner_share_cents: null, owner_share_currency: null,
      pending_share_kind: null, pending_share_bps: null, pending_share_cents: null, pending_share_currency: null,
    });
  });
  test("more than 90%, a bad fixed amount or no currency is refused", () => {
    assert.deepEqual(decideMemberShareUpdate({ ...ok, share: { kind: "percent", bps: 9001 } }), { ok: false, reason: "invalid_share" });
    assert.deepEqual(decideMemberShareUpdate({ ...ok, share: { kind: "fixed", amountCents: -1, currency: "MXN" } }), { ok: false, reason: "invalid_share" });
    assert.deepEqual(decideMemberShareUpdate({ ...ok, share: { kind: "fixed", amountCents: 100, currency: "" } }), { ok: false, reason: "invalid_share" });
  });
  test("not the owner, not a collective, or not a member of this workspace: refused", () => {
    const share = { kind: "percent", bps: 1000 } as const;
    assert.deepEqual(decideMemberShareUpdate({ ...ok, role: "admin", share }), { ok: false, reason: "owner_only" });
    assert.deepEqual(decideMemberShareUpdate({ ...ok, workModel: null, share }), { ok: false, reason: "not_a_collective" });
    assert.deepEqual(decideMemberShareUpdate({ ...ok, workModel: "team_studio", share }), { ok: false, reason: "not_a_collective" });
    assert.deepEqual(decideMemberShareUpdate({ ...ok, memberOnRoster: false, share }), { ok: false, reason: "not_a_member" });
  });

  test("only the member accepts or declines, and only when a proposal is pending", () => {
    assert.deepEqual(decideShareResponse({ isTheMember: false, hasPending: true, proposalMatches: true, accept: true }), { ok: false, reason: "not_the_member" });
    assert.deepEqual(decideShareResponse({ isTheMember: true, hasPending: false, proposalMatches: true, accept: true }), { ok: false, reason: "nothing_pending" });
    assert.deepEqual(decideShareResponse({ isTheMember: true, hasPending: true, proposalMatches: true, accept: true }), { ok: true, outcome: "accepted" });
    assert.deepEqual(decideShareResponse({ isTheMember: true, hasPending: true, proposalMatches: true, accept: false }), { ok: true, outcome: "declined" });
  });

  test("the member sees what she receives BEFORE accepting (EN and ES), for a percent and a fixed share", () => {
    assert.equal(
      memberNetPreview({ kind: "percent", bps: 1500 }, "USD", "en"),
      "On a $100.00 sale you receive $85.00 and the owner takes $15.00.",
    );
    assert.equal(
      memberNetPreview({ kind: "fixed", amountCents: 3000, currency: "MXN" }, "MXN", "es"),
      "En una venta de $100.00 recibes $70.00 y la dueña se queda con $30.00.",
    );
    // A fixed share in another currency has no honest preview (never converted).
    assert.equal(memberNetPreview({ kind: "fixed", amountCents: 3000, currency: "MXN" }, "USD", "en"), null);
  });

  test("the line snapshot records the ACCEPTED share, its version and the owner's take (<= 90% of the line)", () => {
    const snap = buildLineSnapshot(10_000, { kind: "percent", bps: 1500 }, 3);
    assert.deepEqual(snap, { ownerTakeCents: 1500, snapshot: { kind: "percent", bps: 1500, version: 3 } });
    const fixed = buildLineSnapshot(10_000, { kind: "fixed", amountCents: 50_000, currency: "MXN" }, 1);
    assert.deepEqual(fixed, { ownerTakeCents: 9000, snapshot: { kind: "fixed", amountCents: 50_000, currency: "MXN", version: 1 } });
  });
});

describe("rounding is defined: half up to the cent, owner take + member net = price", () => {
  test("worked half-cent cases", () => {
    assert.equal(ownerTakeCents(333, { kind: "percent", bps: 1500 }), 50); // 49.95 -> 50
    assert.equal(ownerTakeCents(5, { kind: "percent", bps: 1000 }), 1); // 0.5 -> 1 (half up)
    assert.equal(ownerTakeCents(1, { kind: "percent", bps: 5000 }), 0); // 0.5 -> 1, then capped at floor(0.9 * 1) = 0
    assert.equal(ownerTakeCents(99, { kind: "percent", bps: 9000 }), 89); // 89.1 -> 89, cap floor(89.1) = 89
    assert.equal(ownerTakeCents(101, { kind: "percent", bps: 9000 }), 90); // 90.9 -> 91, cap floor(90.9) = 90
  });
  test("the member always keeps at least 10% of the line, for every price and every allowed share", () => {
    for (let price = 1; price <= 400; price++) {
      for (const bps of [0, 1, 500, 1234, 5000, 8999, 9000]) {
        const take = ownerTakeCents(price, { kind: "percent", bps });
        const net = memberNetCents(price, { kind: "percent", bps });
        assert.equal(take + net, price);
        assert.ok(net * 10 >= price, `${price} @ ${bps}: net ${net}`);
      }
    }
  });
});

describe("the Tulala fee stays out of the split; lanes reverse proportionally", () => {
  const cfg = { default_take_bps: 600, default_take_floor_cents: 0, plan_tier_bps: {}, processing_mode: "pass_through" as const, pass_through_take_bps: 150 };
  test("with the 1.5% customer fee on, the owner's lane is exactly her take and the member's lane exactly her net", () => {
    const price = 10_000;
    const share = { kind: "percent", bps: 2000 } as const;
    const snap = resolveBookingCommissions({
      tenantId: "ws",
      workspacePlan: "free",
      offerLineItems: [{ line_total_cents: price, talent_cost_total_cents: memberNetCents(price, share) }],
      currencyCode: "MXN",
      paymentMethod: "card",
      sellerOfRecord: "workspace",
      platformConfig: cfg,
      tenantOverride: null,
      orderBackedCollect: true,
    });
    assert.equal(snap.talent_net_cents, 8000);
    assert.equal(snap.workspace_fee_cents, 2000);
    assert.equal(snap.client_surcharge_cents, 150);
    assert.equal(snap.gross_charged_cents, 10_150);
    assert.equal(snap.talent_net_cents + snap.workspace_fee_cents + snap.platform_fee_cents, snap.gross_charged_cents);
  });
  test("a refund of part of the order reduces each lane in proportion (no cent lost)", () => {
    // lanes 8000 member / 2000 owner; refund half of the 10_000 line
    const half = (lane: number) => proportionalRefundCents(lane, 0.5);
    assert.equal(half(8000) + half(2000), 5000);
    assert.equal(proportionalRefundCents(8000, 0.5) , 4000);
    assert.equal(proportionalRefundCents(2000, 0.5), 1000);
  });
  test("payouts are one row per booking, member and party; partial reversals carry an idempotency anchor", () => {
    const ledger = readFileSync(new URL("../../../../supabase/migrations/20260601014922_booking_payouts_ledger.sql", import.meta.url), "utf8");
    assert.match(ledger, /booking_payouts_unique_leg unique \(booking_id, participant_id, party\)/);
    const rev = read("../payments/booking-payouts-ledger.ts");
    assert.match(rev, /partialReversalAnchor/);
  });
});

describe("the owner screen", () => {
  const act = read("./friends-collective-actions.ts");
  test("setMemberOwnerShare is owner-only, tenant-scoped, audited", () => {
    assert.match(act, /export async function setMemberOwnerShare/);
    assert.match(act, /decideMemberShareUpdate\(/);
    assert.match(act, /tenantScopedQuery\(admin, "agency_talent_roster", tenantId\)/);
    assert.match(act, /action: "workspace\.owner_share\.set"/);
  });
  test("the settings page exists and mounts the card; copy has ES and EN", () => {
    const page = read("../../app/(workspace)/[tenantSlug]/admin/settings/collective/page.tsx");
    assert.match(page, /CollectiveSharesCard/);
    const card = read("../../app/(workspace)/[tenantSlug]/admin/settings/collective/CollectiveSharesCard.tsx");
    assert.match(card, /setMemberOwnerShare/);
    assert.match(card, /applyFriendsCollectivePreset/);
    for (const l of ["en", "es"] as const) {
      for (const k of ["apply", "memberHeading", "percentLabel", "fixedLabel", "noShare", "save", "saved", "ownerOnly", "overCap", "reviewsHeading", "pendingNote", "splitOff", "proposalHeading", "accept", "decline", "nothingPending", "answered"] as const) {
        assert.ok(COLLECTIVE_COPY[l][k] && COLLECTIVE_COPY[l][k].length > 0, `${l}.${k}`);
        assert.ok(!/[–—]/.test(COLLECTIVE_COPY[l][k]), `${l}.${k} has a dash`);
      }
    }
  });
});

describe("DB guarantees, flag gate and acceptance wiring", () => {
  const sql = readFileSync(new URL("../../../../supabase/migrations/_pending_pm/20261231420200_agencies_work_model_tul1374.sql", import.meta.url), "utf8");
  test("the 90% cap and the 10% member minimum are enforced IN THE DATABASE on the order line, and the share is snapshotted there", () => {
    assert.match(sql, /ALTER TABLE public\.order_lines[\s\S]*owner_take_cents BIGINT/);
    assert.match(sql, /owner_share_snapshot JSONB/);
    assert.match(sql, /order_lines_owner_take_cap_chk CHECK/);
    assert.match(sql, /owner_take_cents >= 0 AND owner_take_cents <= \(total_cents \* 9\) \/ 10/);
    assert.match(sql, /talent_cost_cents >= total_cents - owner_take_cents/);
  });
  test("the roster keeps an ACCEPTED share (effective, versioned) apart from a PENDING proposal", () => {
    for (const col of ["pending_share_kind", "pending_share_bps", "pending_share_cents", "pending_share_currency", "pending_share_proposed_at", "owner_share_version", "owner_share_accepted_at", "owner_share_accepted_by"]) {
      assert.match(sql, new RegExp(col), col);
    }
    assert.match(sql, /pending_share_bps BETWEEN 0 AND 9000/);
  });
  test("checkout reads only the ACCEPTED columns, and snapshots them on the line", () => {
    const split = read("./collective-split.ts");
    assert.doesNotMatch(split, /pending_share/);
    assert.match(split, /owner_share_version/);
    assert.match(split, /buildLineSnapshot\(/);
    assert.match(split, /ownerTakeCents/);
    assert.match(split, /ownerShareSnapshot/);
    assert.match(read("../orders/purchase-lines.ts"), /owner_take_cents: l\.ownerTakeCents, owner_share_snapshot: l\.ownerShareSnapshot/);
  });
  test("flag-gated: the split applies only when COLLECTIVE_SPLIT_ENABLED is exactly 1 (default OFF)", () => {
    const split = read("./collective-split.ts");
    assert.match(split, /env\.COLLECTIVE_SPLIT_ENABLED === "1"/);
    assert.match(split, /collectiveSplitEnabled/);
  });
  test("the member's accept action and page exist, and show the net before accepting", () => {
    const act = read("./friends-collective-actions.ts");
    assert.match(act, /export async function respondToOwnerShare/);
    assert.match(act, /decideShareResponse\(/);
    assert.match(act, /requireTalentSelf\(/);
    const page = read("../../app/(workspace)/[tenantSlug]/talent/collective-share/page.tsx");
    assert.match(page, /memberNetPreview\(/);
    const card = read("../../app/(workspace)/[tenantSlug]/talent/collective-share/CollectiveShareResponseCard.tsx");
    assert.match(card, /respondToOwnerShare/);
  });
});

test("accepting a proposal that changed since she saw it is refused (swap 10% for 90% before the click)", () => {
  assert.deepEqual(decideShareResponse({ isTheMember: true, hasPending: true, proposalMatches: false, accept: true }), { ok: false, reason: "proposal_changed" });
  // Declining is always safe, even if it changed: it only drops the pending row.
  assert.deepEqual(decideShareResponse({ isTheMember: true, hasPending: true, proposalMatches: false, accept: false }), { ok: true, outcome: "declined" });
});
