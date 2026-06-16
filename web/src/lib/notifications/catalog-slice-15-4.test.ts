import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReactElement } from "react";
import { findCatalogEntries, findCatalogEntryById } from "./catalog";
import { payoutReceiverTalent, transactionPayer, workspaceOwner } from "./catalog-audiences";
import { formatDateLabel, formatMoneyCents, planLabel } from "./catalog-render";
import { planChangeEventType } from "./producers/workspace-plan-notify";
import type { NotificationEvent, ResolvedRecipient } from "./types";

/**
 * Slice 15.4 — the 7 Stripe payment + billing catalog entries (spec §6.5/§6.6).
 *
 * Split out of `catalog.test.ts` to keep that file under the 800-line cap (the
 * same sibling-extraction convention the catalog source modules use). Guards the
 * catalog wiring (id, category, required, channels, surface routing), the
 * render + in-app smoke tests (money/date formatting, CTA URLs, the
 * unsubscribe-footer split between the opt-out `payments` category and the
 * REQUIRED `billing` category), the pure plan-delta → event-type mapping, and
 * the DB-free guard branches of the three new audience resolvers.
 */

const brand = {
  wordmark: "TULALA",
  accountName: "Tulala",
  footerDomain: "tulala.digital",
  homeHref: "https://tulala.digital",
};

function recipient(role: ResolvedRecipient["role"], displayName = "Giulia Conti"): ResolvedRecipient {
  return {
    userId: "user-1",
    email: "person@tulala.digital",
    displayName,
    locale: "en",
    isPlatformAdmin: false,
    role,
    dedupeId: "user-1",
  };
}

function event(
  type: string,
  payload: Record<string, unknown>,
  extra: Partial<NotificationEvent> = {},
): NotificationEvent {
  return { type, tenantId: "tenant-1", eventId: `${type}:test`, payload, ...extra };
}

// ─── Catalog wiring (all 7 entries present + correctly classified) ─────────────

test("catalog: all 7 Slice 15.4 entries are registered with the right category/required/channels", () => {
  const expected = [
    { id: "payment.received.client", category: "payments", required: false, channels: ["email", "in_app"] },
    { id: "payment.received.workspace", category: "payments", required: false, channels: ["email", "in_app"] },
    { id: "payment.failed.workspace", category: "payments", required: false, channels: ["email", "in_app"] },
    { id: "payment.payout_settled.talent", category: "payments", required: false, channels: ["email", "in_app"] },
    { id: "workspace.plan_upgraded", category: "billing", required: true, channels: ["email", "in_app"] },
    { id: "workspace.plan_downgraded", category: "billing", required: true, channels: ["email", "in_app"] },
    { id: "workspace.subscription_cancelled", category: "billing", required: true, channels: ["email"] },
  ] as const;
  for (const e of expected) {
    const entry = findCatalogEntryById(e.id);
    assert.ok(entry, `missing entry ${e.id}`);
    assert.equal(entry!.category, e.category, `${e.id} category`);
    assert.equal(entry!.required, e.required, `${e.id} required`);
    assert.deepEqual(entry!.defaultChannels, e.channels, `${e.id} channels`);
    assert.ok(entry!.email, `${e.id} should have an email config`);
  }
});

test("catalog: each Slice 15.4 trigger routes to exactly its expected entries", () => {
  assert.deepEqual(findCatalogEntries("payment.received").map((e) => e.id).sort(), [
    "payment.received.client",
    "payment.received.workspace",
  ]);
  assert.deepEqual(findCatalogEntries("payment.failed").map((e) => e.id), ["payment.failed.workspace"]);
  assert.deepEqual(findCatalogEntries("payment.payout_settled").map((e) => e.id), [
    "payment.payout_settled.talent",
  ]);
  assert.deepEqual(findCatalogEntries("workspace.plan_upgraded").map((e) => e.id), ["workspace.plan_upgraded"]);
  assert.deepEqual(findCatalogEntries("workspace.plan_downgraded").map((e) => e.id), ["workspace.plan_downgraded"]);
  assert.deepEqual(findCatalogEntries("workspace.subscription_cancelled").map((e) => e.id), [
    "workspace.subscription_cancelled",
  ]);
});

test("catalog: in-app surfaces route each payment bell to the right dashboard", () => {
  assert.equal(findCatalogEntryById("payment.received.client")!.in_app!.surface, "client"); // client receipt bells the client dashboard
  assert.equal(findCatalogEntryById("payment.received.workspace")!.in_app!.surface, "workspace");
  assert.equal(findCatalogEntryById("payment.failed.workspace")!.in_app!.surface, "workspace");
  assert.equal(findCatalogEntryById("payment.payout_settled.talent")!.in_app!.surface, "talent");
  assert.equal(findCatalogEntryById("workspace.plan_upgraded")!.in_app!.surface, "workspace");
  assert.equal(findCatalogEntryById("workspace.plan_downgraded")!.in_app!.surface, "workspace");
  assert.equal(findCatalogEntryById("workspace.subscription_cancelled")!.in_app, undefined); // email-only
});

// ─── §6.5 payments — render + in-app smoke tests ───────────────────────────────

test("payment.received.client: receipt names amount + date and deep-links to the booking payment tab", () => {
  const entry = findCatalogEntryById("payment.received.client")!;
  const ev = event("payment.received", {
    bookingId: "bk-1",
    contactName: "Sofia's Wedding",
    grossAmountCents: 225000,
    currency: "eur",
    paidAt: "2026-06-05T12:00:00.000Z",
  });
  const r = recipient("client");
  const el = entry.email!.render({
    event: ev,
    recipient: r,
    brand,
    unsubscribeUrl: "https://tulala.digital/unsub?t=x",
  }) as ReactElement<{
    clientName: string | null;
    amountPaid: string;
    paymentDate: string;
    receiptUrl: string;
    categoryLabel?: string;
    unsubscribeUrl?: string;
  }>;
  assert.equal(el.props.amountPaid, "EUR 2,250.00");
  // Locale-robust: the entry must wire the payload date through formatDateLabel
  // (not pass the raw ISO / wrong field). Exact display string is locale-dependent.
  assert.equal(el.props.paymentDate, formatDateLabel("2026-06-05T12:00:00.000Z"));
  assert.ok(el.props.paymentDate.length > 0, "payment date should render");
  assert.match(el.props.receiptUrl, /\/client\/bookings\/bk-1\?tab=payment$/);
  // payments is opt-out → the dispatcher's unsubscribe URL must be forwarded.
  assert.equal(el.props.categoryLabel, "payments");
  assert.equal(el.props.unsubscribeUrl, "https://tulala.digital/unsub?t=x");
  // The client also gets an in-app bell naming the amount + contact.
  const body = entry.in_app!.body?.(ev, r) ?? "";
  assert.match(body, /EUR 2,250\.00/);
  assert.match(body, /Sofia's Wedding/);
});

test("payment.received.workspace: alert deep-links to the inquiry + bells with amount and contact", () => {
  const entry = findCatalogEntryById("payment.received.workspace")!;
  const ev = event(
    "payment.received",
    { contactName: "Sofia's Wedding", grossAmountCents: 225000, currency: "eur" },
    { inquiryId: "inq-1" },
  );
  const r = recipient("workspace_member");
  const el = entry.email!.render({ event: ev, recipient: r, brand }) as ReactElement<{
    amountReceived: string;
    inquiryUrl: string;
  }>;
  assert.equal(el.props.amountReceived, "EUR 2,250.00");
  assert.match(el.props.inquiryUrl, /\/admin\/work\/inq-1$/);
  const body = entry.in_app!.body?.(ev, r) ?? "";
  assert.match(body, /EUR 2,250\.00/);
  assert.match(body, /Sofia's Wedding/);
});

test("payment.failed.workspace: dunning alert names the amount due + points at the account page", () => {
  const entry = findCatalogEntryById("payment.failed.workspace")!;
  const ev = event("payment.failed", { workspaceName: "Impronta Models", amountDueCents: 4900, currency: "eur" });
  const r = recipient("workspace_member");
  const el = entry.email!.render({ event: ev, recipient: r, brand }) as ReactElement<{
    agencyName: string;
    amountDue: string;
    billingUrl: string;
    categoryLabel?: string;
  }>;
  assert.equal(el.props.agencyName, "Impronta Models");
  assert.equal(el.props.amountDue, "EUR 49.00");
  assert.match(el.props.billingUrl, /\/admin\/account$/);
  assert.equal(el.props.categoryLabel, "payments");
  assert.match(entry.in_app!.body?.(ev, r) ?? "", /EUR 49\.00/);
});

test("payment.payout_settled.talent: payout notice names the net amount + links to payout settings", () => {
  const entry = findCatalogEntryById("payment.payout_settled.talent")!;
  const ev = event("payment.payout_settled", {
    netAmountCents: 180000,
    currency: "eur",
    contactName: "Sofia's Wedding",
  });
  const r = recipient("talent", "Tina Rossi");
  const el = entry.email!.render({ event: ev, recipient: r, brand }) as ReactElement<{
    talentName: string | null;
    amountSettled: string;
    payoutsUrl: string;
  }>;
  assert.equal(el.props.talentName, "Tina Rossi");
  assert.equal(el.props.amountSettled, "EUR 1,800.00");
  assert.match(el.props.payoutsUrl, /\/talent\/settings\/payouts$/);
  assert.match(entry.in_app!.body?.(ev, r) ?? "", /EUR 1,800\.00/);
});

// ─── §6.6 billing (REQUIRED — no unsubscribe footer) ───────────────────────────

test("workspace.plan_upgraded: titles with the new plan and carries NO unsubscribe footer", () => {
  const entry = findCatalogEntryById("workspace.plan_upgraded")!;
  const ev = event("workspace.plan_upgraded", { workspaceName: "Impronta Models", toPlan: "agency" });
  const r = recipient("workspace_member");
  // Even if the dispatcher (wrongly) passed an unsubscribe URL, a REQUIRED-category
  // template must not surface one — the render ignores it.
  const el = entry.email!.render({
    event: ev,
    recipient: r,
    brand,
    unsubscribeUrl: "https://tulala.digital/unsub?t=x",
  }) as ReactElement<{ agencyName: string; toPlan: string; unsubscribeUrl?: string; categoryLabel?: string }>;
  assert.equal(el.props.agencyName, "Impronta Models");
  assert.equal(el.props.toPlan, "Agency");
  assert.equal(el.props.unsubscribeUrl, undefined, "billing email must not carry an unsubscribe URL");
  assert.equal(el.props.categoryLabel, undefined, "billing email must not carry a category footer");
  assert.match(entry.email!.subject(ev, r), /Agency/);
  assert.match(entry.in_app!.title(ev, r), /Agency/);
});

test("workspace.plan_downgraded: reuses SubscriptionCanceled as a paid→paid change (isFullCancel=false)", () => {
  const entry = findCatalogEntryById("workspace.plan_downgraded")!;
  const ev = event("workspace.plan_downgraded", {
    workspaceName: "Impronta Models",
    fromPlan: "agency",
    toPlan: "studio",
    effectiveAt: "2026-06-01T12:00:00.000Z",
  });
  const el = entry.email!.render({ event: ev, recipient: recipient("workspace_member"), brand }) as ReactElement<{
    fromPlan: string;
    toPlan: string;
    effectiveLabel: string;
  }>;
  assert.equal(el.props.fromPlan, "Agency");
  assert.equal(el.props.toPlan, "Studio"); // NOT "Free" → template renders the plan-change copy
  assert.equal(el.props.effectiveLabel, formatDateLabel("2026-06-01T12:00:00.000Z")); // locale-robust
});

test("workspace.subscription_cancelled: email-only, defaults the target plan to Free", () => {
  const entry = findCatalogEntryById("workspace.subscription_cancelled")!;
  const ev = event("workspace.subscription_cancelled", { workspaceName: "Impronta Models", fromPlan: "studio" });
  const el = entry.email!.render({ event: ev, recipient: recipient("workspace_member"), brand }) as ReactElement<{
    fromPlan: string;
    toPlan: string;
  }>;
  assert.equal(el.props.fromPlan, "Studio");
  assert.equal(el.props.toPlan, "Free"); // missing toPlan → defaults to the canonical Free label
});

// ─── planChangeEventType (pure plan-delta → event-type mapping) ────────────────

test("planChangeEventType: maps the plan delta to the right billing event (or null)", () => {
  // First paid subscription (no/unknown prior) → upgrade.
  assert.equal(planChangeEventType(null, "studio"), "workspace.plan_upgraded");
  assert.equal(planChangeEventType("free", "agency"), "workspace.plan_upgraded");
  assert.equal(planChangeEventType("studio", "agency"), "workspace.plan_upgraded");
  // Higher → lower paid tier → downgrade.
  assert.equal(planChangeEventType("agency", "studio"), "workspace.plan_downgraded");
  assert.equal(planChangeEventType("network", "agency"), "workspace.plan_downgraded");
  // Any → free → full cancellation.
  assert.equal(planChangeEventType("agency", "free"), "workspace.subscription_cancelled");
  // Case/whitespace insensitive.
  assert.equal(planChangeEventType(" Agency ", "Studio"), "workspace.plan_downgraded");
  // No-op transitions.
  assert.equal(planChangeEventType("studio", "studio"), null, "same tier");
  assert.equal(planChangeEventType(null, null), null, "no target");
  assert.equal(planChangeEventType("studio", ""), null, "empty target");
  assert.equal(planChangeEventType("studio", "enterprise"), null, "unrecognised paid tier");
});

// ─── render helpers ────────────────────────────────────────────────────────────

test("formatMoneyCents: minor units + ISO code → display amount, drops cleanly on missing input", () => {
  assert.equal(formatMoneyCents(225000, "eur"), "EUR 2,250.00");
  assert.equal(formatMoneyCents(4900, "EUR"), "EUR 49.00");
  assert.equal(formatMoneyCents(1000, null), "10.00"); // no code → bare amount, never "null 10.00"
  assert.equal(formatMoneyCents(1000, ""), "10.00");
  assert.equal(formatMoneyCents(null, "eur"), ""); // missing amount → "" so the FieldTable row drops
  assert.equal(formatMoneyCents(undefined, "eur"), "");
});

test("planLabel: title-cases known tiers, passes unknown through, empty for null", () => {
  assert.equal(planLabel("agency"), "Agency");
  assert.equal(planLabel("FREE"), "Free");
  assert.equal(planLabel(" studio "), "Studio");
  assert.equal(planLabel("network"), "Network");
  assert.equal(planLabel("enterprise"), "enterprise"); // unknown → passthrough, not dropped
  assert.equal(planLabel(null), "");
  assert.equal(planLabel(undefined), "");
});

// ─── audience resolver guard branches (deterministic, DB-free) ─────────────────

test("transactionPayer: resolves the authenticated payer, the guest payer, or nobody", async () => {
  assert.deepEqual(await transactionPayer(event("payment.received", { payerUserId: "u-9" })), [
    { kind: "user", userId: "u-9", role: "client" },
  ]);
  assert.deepEqual(
    await transactionPayer(event("payment.received", { payerEmail: "pay@x.com", contactName: "Sofia" })),
    [{ kind: "guest", email: "pay@x.com", displayName: "Sofia", role: "client" }],
  );
  assert.deepEqual(await transactionPayer(event("payment.received", {})), []); // no payer at all
});

test("payoutReceiverTalent: returns [] without a payout account id (DB-free guard)", async () => {
  assert.deepEqual(await payoutReceiverTalent(event("payment.payout_settled", {}), {} as never), []);
});

test("workspaceOwner: returns [] without a tenant scope (DB-free guard)", async () => {
  const noTenant: NotificationEvent = {
    type: "workspace.plan_upgraded",
    tenantId: null,
    eventId: "plan:guard",
    payload: { toPlan: "agency" },
  };
  assert.deepEqual(await workspaceOwner(noTenant, {} as never), []);
});
