import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  AWAITING_TALENT,
  AWAITING_TALENT_EXPIRY_HOURS,
  awaitingTalentCutoffIso,
  awaitingTalentExpired,
  isOfferClientVisible,
  isOfferOutstanding,
} from "./offer-awaiting-talent";
import { assertStatusOfferInvariant } from "./inquiry-status-offer-invariant";
import { deriveWorkspaceAlerts } from "./inquiry-alerts";

const NOW = Date.parse("2026-10-09T12:00:00Z");

test("awaiting_talent is outstanding for staff/talent and invisible to the client", () => {
  assert.equal(isOfferOutstanding("sent"), true);
  assert.equal(isOfferOutstanding(AWAITING_TALENT), true);
  assert.equal(isOfferOutstanding("draft"), false);
  assert.equal(isOfferClientVisible(AWAITING_TALENT), false);
  assert.equal(isOfferClientVisible("draft"), false);
  assert.equal(isOfferClientVisible("sent"), true);
  assert.equal(isOfferClientVisible("accepted"), true);
});

test("the client offer reader never lists awaiting_talent (the visible set is the allow-list)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/messaging/client-link.ts"), "utf8");
  const line = src.split("\n").find((l) => l.includes("CLIENT_VISIBLE_OFFER_STATUSES = new Set"))!;
  assert.ok(line, "allow-list present");
  assert.doesNotMatch(line, /awaiting_talent|draft/);
});

test("72 h boundary: waiting since 71 h is not expired, 72 h is", () => {
  const since = (h: number) => new Date(NOW - h * 3600_000).toISOString();
  assert.equal(AWAITING_TALENT_EXPIRY_HOURS, 72);
  assert.equal(awaitingTalentExpired(since(71), NOW), false);
  assert.equal(awaitingTalentExpired(since(72), NOW), true);
  assert.equal(awaitingTalentExpired(null, NOW), false);
  assert.equal(awaitingTalentCutoffIso(NOW), new Date(NOW - 72 * 3600_000).toISOString());
});

test("awaiting_talent pairs with an offer_pending inquiry, like sent", () => {
  assert.doesNotThrow(() => assertStatusOfferInvariant("offer_pending", "awaiting_talent"));
  assert.throws(() => assertStatusOfferInvariant("coordination", "awaiting_talent"));
});

test("pending approvals alert fires for an awaiting_talent offer", () => {
  const out = deriveWorkspaceAlerts({
    isLocked: false,
    shortfall: [],
    approvals: { pending: 1, accepted: 0, rejected: 0 },
    currentOfferId: "o1",
    currentOfferStatus: "awaiting_talent",
    isOfferReady: false,
    hasPrimaryCoordinator: true,
    unreadCount: 0,
    workspaceStatus: "offer_pending",
  } as never);
  assert.ok(out.alerts.some((a) => a.key === "approvals_pending"));
});
