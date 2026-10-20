import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type Stripe from "stripe";

import {
  cancelNoticeKey,
  detectCancelTransition,
  sendCancelStateNotice,
  type CancelNoticeDeps,
} from "./cancel-state-notice";
import { cancelStateBody, cancelStateSubject, renderCancelStateEmail } from "../email/subscription-cancel-state";

const END = 1_800_000_000; // 2027-01-15

function evt(type: string, cap: boolean, prev: Record<string, unknown> | null, status = "active"): Stripe.Event {
  return {
    id: "evt_1",
    type,
    data: {
      object: { id: "sub_1", status, cancel_at_period_end: cap, items: { data: [{ current_period_end: END }] } },
      ...(prev ? { previous_attributes: prev } : {}),
    },
  } as unknown as Stripe.Event;
}

describe("detectCancelTransition", () => {
  test("false -> true is a cancel", () => {
    const t = detectCancelTransition(evt("customer.subscription.updated", true, { cancel_at_period_end: false }));
    assert.equal(t?.cancelAtPeriodEnd, true);
    assert.equal(t?.subscriptionId, "sub_1");
    assert.equal(t?.periodEnd, new Date(END * 1000).toISOString());
  });
  test("true -> false is a resume", () => {
    const t = detectCancelTransition(evt("customer.subscription.updated", false, { cancel_at_period_end: true }));
    assert.equal(t?.cancelAtPeriodEnd, false);
  });
  test("unrelated update, no previous flag, wrong event, ended sub: null", () => {
    assert.equal(detectCancelTransition(evt("customer.subscription.updated", true, { status: "trialing" })), null);
    assert.equal(detectCancelTransition(evt("customer.subscription.updated", true, null)), null);
    assert.equal(detectCancelTransition(evt("customer.subscription.created", true, { cancel_at_period_end: false })), null);
    assert.equal(detectCancelTransition(evt("customer.subscription.updated", true, { cancel_at_period_end: false }, "canceled")), null);
  });
  test("unchanged flag in previous_attributes: null", () => {
    assert.equal(detectCancelTransition(evt("customer.subscription.updated", true, { cancel_at_period_end: true })), null);
  });
});

function portalEvt(cancelAt: number | null, prevCancelAt: number | null, id = "evt_portal"): Stripe.Event {
  return {
    id,
    type: "customer.subscription.updated",
    created: 1_790_000_000,
    data: {
      object: { id: "sub_1", status: "active", cancel_at_period_end: false, cancel_at: cancelAt, items: { data: [{ current_period_end: END }] } },
      previous_attributes: { cancel_at: prevCancelAt },
    },
  } as unknown as Stripe.Event;
}

describe("detectCancelTransition: portal cancel via cancel_at (API 2026-04-22.dahlia)", () => {
  test("cancel_at null -> future with the flag still false is a cancel", () => {
    const t = detectCancelTransition(portalEvt(END, null));
    assert.equal(t?.cancelAtPeriodEnd, true);
    assert.equal(t?.periodEnd, new Date(END * 1000).toISOString());
  });
  test("cancel_at future -> null is a resume", () => {
    const t = detectCancelTransition(portalEvt(null, END));
    assert.equal(t?.cancelAtPeriodEnd, false);
  });
  test("cancel_at moved between two future dates is not a transition", () => {
    assert.equal(detectCancelTransition(portalEvt(END + 86_400, END)), null);
  });
  test("a replay yields the same key, so the ledger sends exactly one notice", async () => {
    const a = detectCancelTransition(portalEvt(END, null, "evt_a"));
    const b = detectCancelTransition(portalEvt(END, null, "evt_b"));
    assert.ok(a && b);
    assert.equal(cancelNoticeKey(a), cancelNoticeKey(b));
    const { deps, sent } = fakeDeps();
    const input = { scope: "talent" as const, to: "pat@example.com", locale: "es" as const, actionUrl: "https://app.test/" };
    assert.equal(await sendCancelStateNotice({ ...input, transition: a }, deps), "sent");
    assert.equal(await sendCancelStateNotice({ ...input, transition: b }, deps), "duplicate");
    assert.equal(sent.length, 1);
  });
});

describe("idempotency key", () => {
  test("differs by flag and period end, stable for replays", () => {
    const a = { subscriptionId: "sub_1", cancelAtPeriodEnd: true, periodEnd: "2027-01-15T00:00:00.000Z" };
    assert.equal(cancelNoticeKey(a), cancelNoticeKey({ ...a }));
    assert.notEqual(cancelNoticeKey(a), cancelNoticeKey({ ...a, cancelAtPeriodEnd: false }));
    assert.notEqual(cancelNoticeKey(a), cancelNoticeKey({ ...a, periodEnd: "2027-02-15T00:00:00.000Z" }));
  });
});

function fakeDeps(sendResult: "sent" | "skipped" | "failed" = "sent") {
  const ledger = new Set<string>();
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const deps: CancelNoticeDeps = {
    async claim(r) {
      if (ledger.has(r.key)) return false;
      ledger.add(r.key);
      return true;
    },
    async release(k) {
      ledger.delete(k);
    },
    async send(i) {
      if (sendResult !== "failed") sent.push(i);
      return sendResult;
    },
  };
  return { deps, sent, ledger };
}

const transition = { subscriptionId: "sub_1", cancelAtPeriodEnd: true, periodEnd: "2027-01-15T00:00:00.000Z" };
const base = { transition, scope: "talent" as const, to: "pat@example.com", locale: "es" as const, actionUrl: "https://app.test/" };

describe("sendCancelStateNotice", () => {
  test("sends once, replay is a duplicate", async () => {
    const { deps, sent } = fakeDeps();
    assert.equal(await sendCancelStateNotice(base, deps), "sent");
    assert.equal(await sendCancelStateNotice(base, deps), "duplicate");
    assert.equal(sent.length, 1);
  });
  test("cancel then resume are separate emails", async () => {
    const { deps, sent } = fakeDeps();
    await sendCancelStateNotice(base, deps);
    await sendCancelStateNotice({ ...base, transition: { ...transition, cancelAtPeriodEnd: false } }, deps);
    assert.equal(sent.length, 2);
  });
  test("no recipient never claims", async () => {
    const { deps, ledger } = fakeDeps();
    assert.equal(await sendCancelStateNotice({ ...base, to: " " }, deps), "no_recipient");
    assert.equal(ledger.size, 0);
  });
  test("failed send releases the claim so a retry can send", async () => {
    const { deps, ledger } = fakeDeps("failed");
    assert.equal(await sendCancelStateNotice(base, deps), "failed");
    assert.equal(ledger.size, 0);
  });
});

describe("copy", () => {
  const input = { cancelAtPeriodEnd: true, periodEnd: "2027-01-15T00:00:00.000Z", actionUrl: "https://app.test/x?a=1&b=2" };
  test("ES and EN cancel copy carry the date and resume link", () => {
    const es = renderCancelStateEmail({ ...input, locale: "es" });
    const en = renderCancelStateEmail({ ...input, locale: "en" });
    assert.match(cancelStateBody({ ...input, locale: "es" }), /15 de enero de 2027/);
    assert.match(cancelStateBody({ ...input, locale: "en" }), /January 15, 2027/);
    assert.match(es, /Reanudar plan/);
    assert.match(en, /Resume plan/);
    assert.match(es, /a=1&amp;b=2/);
  });
  test("resume copy says the plan continues, per locale", () => {
    assert.equal(cancelStateSubject("es", false), "Tu plan continúa");
    assert.equal(cancelStateSubject("en", false), "Your plan continues");
    assert.match(cancelStateBody({ ...input, cancelAtPeriodEnd: false, locale: "en" }), /resumed/);
  });
  test("no em dashes, null date is graceful", () => {
    for (const l of ["es", "en"] as const) for (const c of [true, false]) {
      const html = renderCancelStateEmail({ ...input, locale: l, cancelAtPeriodEnd: c, periodEnd: null });
      assert.ok(!html.includes("—"));
      assert.ok(!html.includes("null"));
    }
  });
});
