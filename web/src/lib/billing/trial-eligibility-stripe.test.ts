import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  readStripeSubscriptionHistory,
  TRIAL_HISTORY_MAX_PAGES,
  type HistoryStripe,
} from "./trial-eligibility-readers";
import {
  singleOpenTrialSession,
  TRIAL_SESSION_MARKER,
  type SessionStripe,
} from "./trial-checkout-session";

/** TUL-1280 review round 2 (Codex P2 pagination, P1 concurrent trial sessions). Fake Stripe only. */

type Sub = { id: string; status: string; trial_start: number | null };
const expired = (i: number): Sub => ({ id: `sub_x${i}`, status: "incomplete_expired", trial_start: null });

function pagedStripe(pages: Sub[][], failFirstTry = new Set<number>()) {
  const calls: { starting_after?: string }[] = [];
  const failed = new Set<number>();
  const stripe: HistoryStripe = {
    subscriptions: {
      list: async (p) => {
        calls.push({ starting_after: p.starting_after });
        const idx = p.starting_after ? pages.findIndex((pg) => pg.at(-1)?.id === p.starting_after) + 1 : 0;
        if (failFirstTry.has(idx) && !failed.has(idx)) {
          failed.add(idx);
          throw new Error("ECONNRESET");
        }
        return { data: pages[idx] ?? [], has_more: idx < pages.length - 1 };
      },
    },
  };
  return { stripe, calls };
}

test("P2: prior trial on page 2 (page 1 = 20 incomplete_expired) is found: not eligible", async () => {
  const page1 = Array.from({ length: 20 }, (_, i) => expired(i));
  const page2 = [{ id: "sub_old", status: "canceled", trial_start: 1_750_000_000 }];
  const { stripe, calls } = pagedStripe([page1, page2]);
  const r = await readStripeSubscriptionHistory(stripe, "cus_test_1");
  assert.equal(r.error, null);
  assert.ok(r.data?.some((s) => s.trial_start != null), "page 2 history is returned");
  assert.deepEqual(calls.map((c) => c.starting_after), [undefined, "sub_x19"]);
});

test("P2: stops paging as soon as qualifying history is found", async () => {
  const { stripe, calls } = pagedStripe([[{ id: "sub_a", status: "active", trial_start: null }], [expired(1)]]);
  await readStripeSubscriptionHistory(stripe, "cus_test_1");
  assert.equal(calls.length, 1);
});

test("P2: clean history across pages reads clean when the list is exhausted", async () => {
  const { stripe } = pagedStripe([[expired(1)], [expired(2)]]);
  const r = await readStripeSubscriptionHistory(stripe, "cus_test_1");
  assert.equal(r.error, null);
  assert.equal(r.data?.length, 2);
});

test("P2: page cap hit with more pages left fails CLOSED (error, so no trial)", async () => {
  const pages = Array.from({ length: TRIAL_HISTORY_MAX_PAGES + 2 }, (_, p) => [expired(p)]);
  const { stripe, calls } = pagedStripe(pages);
  const r = await readStripeSubscriptionHistory(stripe, "cus_test_1");
  assert.ok(r.error, "cap hit is an error");
  assert.equal(calls.length, TRIAL_HISTORY_MAX_PAGES);
});

test("P2: one retry per page; a page that fails twice is an error", async () => {
  const once = pagedStripe([[expired(1)], [expired(2)]], new Set([1]));
  const r = await readStripeSubscriptionHistory(once.stripe, "cus_test_1");
  assert.equal(r.error, null, "a single transient failure is retried");
  assert.equal(once.calls.length, 3);

  const always: HistoryStripe = {
    subscriptions: {
      list: async () => {
        throw new Error("down");
      },
    },
  };
  await assert.rejects(readStripeSubscriptionHistory(always, "cus_test_1"));
});

type Open = { id: string; metadata: Record<string, string> | null };

function sessionStripe(open: Open[], opts: { listFails?: boolean; expireFails?: boolean } = {}) {
  const expiredIds: string[] = [];
  const listed: unknown[] = [];
  const stripe: SessionStripe = {
    checkout: {
      sessions: {
        list: async (p) => {
          listed.push(p);
          if (opts.listFails) throw new Error("down");
          return { data: open, has_more: false };
        },
        expire: async (id) => {
          if (opts.expireFails) throw new Error("expire failed");
          expiredIds.push(id);
          return {};
        },
      },
    },
  };
  return { stripe, expiredIds, listed };
}

test("P1: a second trial checkout expires the first OPEN trial session; non-trial sessions untouched", async () => {
  const { stripe, expiredIds, listed } = sessionStripe([
    { id: "cs_trial_old", metadata: { checkout_type: "talent_subscription", [TRIAL_SESSION_MARKER]: "cs_talent_p_talent_pro" } },
    { id: "cs_no_trial", metadata: { checkout_type: "talent_subscription" } },
    { id: "cs_booking", metadata: null },
  ]);
  const marker = await singleOpenTrialSession(stripe, "cus_test_1", 14, "cs_talent_p_talent_pro_year", () => {});
  assert.deepEqual(expiredIds, ["cs_trial_old"]);
  assert.deepEqual(listed, [{ customer: "cus_test_1", status: "open", limit: 100 }]);
  assert.deepEqual(marker, { [TRIAL_SESSION_MARKER]: "cs_talent_p_talent_pro_year" });
});

test("P1: the session our idempotency key would return is never expired (a re-click reuses it)", async () => {
  const { stripe, expiredIds } = sessionStripe([
    { id: "cs_same", metadata: { [TRIAL_SESSION_MARKER]: "cs_talent_p_talent_pro" } },
  ]);
  await singleOpenTrialSession(stripe, "cus_test_1", 14, "cs_talent_p_talent_pro", () => {});
  assert.deepEqual(expiredIds, []);
});

test("P1: no trial on this checkout: no Stripe calls, no marker", async () => {
  const { stripe, expiredIds, listed } = sessionStripe([{ id: "cs_trial_old", metadata: { [TRIAL_SESSION_MARKER]: "k" } }]);
  assert.deepEqual(await singleOpenTrialSession(stripe, "cus_test_1", null, "k2", () => {}), {});
  assert.deepEqual([expiredIds.length, listed.length], [0, 0]);
});

test("P1: best effort: list or expire failures are logged and never block checkout", async () => {
  const errors: string[] = [];
  const a = sessionStripe([], { listFails: true });
  assert.deepEqual(await singleOpenTrialSession(a.stripe, "cus_test_1", 14, "k", (w) => errors.push(w)), {
    [TRIAL_SESSION_MARKER]: "k",
  });
  const b = sessionStripe([{ id: "cs_old", metadata: { [TRIAL_SESSION_MARKER]: "old" } }], { expireFails: true });
  await singleOpenTrialSession(b.stripe, "cus_test_1", 14, "k", (w) => errors.push(w));
  assert.deepEqual(errors, ["billing.trialSession.list", "billing.trialSession.expire"]);
  assert.deepEqual(await singleOpenTrialSession(null, "cus_test_1", 14, "k", () => {}), { [TRIAL_SESSION_MARKER]: "k" });
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("P1 wiring: both checkouts guard trial sessions before create and only ADD the marker to session metadata", () => {
  for (const file of ["src/lib/stripe/talent-billing.ts", "src/lib/stripe/workspace-billing.ts"]) {
    const src = read(file);
    const guard = src.indexOf("await prepareTrialSession(stripe, customerResult.data, trialDays, idempotencyKey,");
    assert.ok(guard > 0, `${file} calls the guard with the same idempotency key`);
    assert.ok(guard < src.indexOf("stripe.checkout.sessions.create("), `${file} guards before create`);
    assert.match(src, /\.\.\.trialGuard\.marker \}/, `${file} adds the marker to session metadata`);
    assert.match(src, /\{ idempotencyKey \}/, `${file} create still uses the same key`);
    assert.match(src, /line_items: \[\{ price: priceId, quantity: 1 \}\]/, `${file} line items unchanged`);
    assert.match(src, /\.\.\.discount\.params,/, `${file} discount params unchanged`);
  }
});
