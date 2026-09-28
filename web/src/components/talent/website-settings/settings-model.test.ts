import assert from "node:assert/strict";
import { test } from "node:test";

import type { SellingDefaults } from "@/lib/talent/services-settings-actions";
import {
  canBookInstantly,
  changeCount,
  countCustom,
  defaultModeImpact,
  diffDraft,
  effectiveServiceMode,
  needsOwnDeposit,
  valueSource,
  withPosture,
  type SettingsDraft,
} from "./settings-model";

const defaults: SellingDefaults = {
  depositPct: 30,
  cancelHours: 24,
  rescheduleHours: 24,
  where: ["studio"],
  travelRadiusKm: null,
  travelFeeCents: null,
  bufferBeforeMin: 10,
  bufferAfterMin: 15,
  minNoticeMin: 120,
  bookingPosture: "instant",
  whoPrimaryCta: "confirm_now",
};

const saved: SettingsDraft = {
  defaults,
  services: {
    a: { bookingMode: "instant", depositPct: null, cancellationHours: null },
    b: { bookingMode: "request", depositPct: 50, cancellationHours: null },
    c: { bookingMode: "request", depositPct: 0, cancellationHours: 48 },
  },
};

test("null means inherited; any number, zero included, is the service's own", () => {
  assert.equal(valueSource(null), "inherited");
  assert.equal(valueSource(undefined), "inherited");
  assert.equal(valueSource(0), "custom");
  assert.equal(countCustom(saved.services, "depositPct"), 2);
  assert.equal(countCustom(saved.services, "cancellationHours"), 1);
});

test("a service's own mode wins; null inherits the default (report §1)", () => {
  assert.equal(effectiveServiceMode("instant", "inquiry"), "instant");
  assert.equal(effectiveServiceMode("request", "instant"), "request");
  assert.equal(effectiveServiceMode(null, "inquiry"), "inquiry");
  assert.equal(effectiveServiceMode(null, "instant"), "instant");
});

test("instant needs one exact price", () => {
  assert.equal(canBookInstantly({ priceDisplay: "exact", amountCents: 0 }), true);
  assert.equal(canBookInstantly({ priceDisplay: "from", amountCents: 500 }), false);
  assert.equal(canBookInstantly({ priceDisplay: "exact", amountCents: null }), false);
  assert.equal(canBookInstantly({ priceDisplay: "exact", priceType: "custom", amountCents: 100 }), false);
});

test("dirty diff counts defaults and services; posture + its CTA coercion is one change", () => {
  assert.equal(changeCount(saved, saved), 0);
  const draft: SettingsDraft = {
    defaults: { ...withPosture(defaults, "inquiry"), bufferBeforeMin: 20 },
    services: {
      ...saved.services,
      b: { ...saved.services.b, depositPct: null },
      c: { ...saved.services.c, bookingMode: "instant" },
    },
  };
  assert.equal(draft.defaults.whoPrimaryCta, "contact");
  assert.deepEqual(diffDraft(saved, draft), {
    defaults: ["bookingPosture", "whoPrimaryCta", "bufferBeforeMin"],
    services: ["b", "c"],
  });
  assert.equal(changeCount(saved, draft), 4);
});

test("minimum notice is never part of the F1 diff (display only)", () => {
  const draft: SettingsDraft = { ...saved, defaults: { ...defaults, minNoticeMin: 999 } };
  assert.equal(changeCount(saved, draft), 0);
});

test("instant + deposit reserve keeps its own deposit", () => {
  assert.equal(needsOwnDeposit({ bookingMode: "instant", reserveMode: "deposit" }), true);
  assert.equal(needsOwnDeposit({ bookingMode: "request", reserveMode: "deposit" }), false);
  assert.equal(needsOwnDeposit({ bookingMode: "instant", reserveMode: "free" }), false);
});

test("pendingChangeLabels names only what is still unsaved (partial save)", async () => {
  const { pendingChangeLabels } = await import("./settings-model");
  const base = { defaults: {} as never, services: { a: { bookingMode: null, depositPct: null, cancellationHours: null } } };
  const draft = { defaults: {} as never, services: { a: { bookingMode: "instant" as const, depositPct: null, cancellationHours: null } } };
  const sw = { acceptingBookings: true, acceptingInquiries: true, chatEnabled: true };
  const labels = { defaults: "Your defaults", bookings: "Accept new bookings", chat: "Chat & inquiries" };
  assert.deepEqual(
    pendingChangeLabels({ saved: base, draft, savedSwitches: sw, draftSwitches: { ...sw, acceptingBookings: false }, serviceTitle: () => "Manicure", labels }),
    ["Manicure", "Accept new bookings"],
  );
  assert.deepEqual(
    pendingChangeLabels({ saved: draft, draft, savedSwitches: sw, draftSwitches: sw, serviceTitle: () => "x", labels }),
    [],
  );
});

test("defaultModeImpact counts services that follow the default vs their own", () => {
  assert.deepEqual(
    defaultModeImpact({
      a: { bookingMode: null, depositPct: null, cancellationHours: null },
      b: { bookingMode: "request", depositPct: null, cancellationHours: null },
      c: { bookingMode: null, depositPct: 10, cancellationHours: null },
    }),
    { follows: 2, own: 1 },
  );
});
