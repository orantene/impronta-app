/**
 * The booking promise must degrade with the surface.
 *
 * `appointments-plan-policy` caps a free talent at "request" and
 * `loadInstantBookEligibility` only arms on an agency host, so an offering row
 * saying `bookingMode: "instant"` can sit on a surface that cannot confirm
 * anything. `asSellable` is the single point where that is reconciled, and
 * everything the visitor sees hangs off its result: the CTA wording, the
 * dispatched event intent and the booking sheet's final button.
 *
 * It is three lines with an early return. That is exactly the shape that
 * passes review while being subtly wrong, which is why it is tested directly
 * rather than only through the page.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentOffering } from "@/lib/talent/offerings-types";

import { asSellable, railFor } from "./MaisonMenu";

function offering(bookingMode: TalentOffering["bookingMode"]): TalentOffering {
  // Only the field under test matters; the cast keeps this from restating the
  // whole ~30-field model, which would make the test a maintenance burden that
  // breaks on every unrelated schema addition (as the prototype seed just did).
  return { id: "o1", title: "Service", bookingMode } as TalentOffering;
}

describe("asSellable", () => {
  it("leaves an instant offering alone on a surface that CAN confirm", () => {
    const o = offering("instant");
    assert.equal(asSellable(o, "instant").bookingMode, "instant");
  });

  it("degrades an instant offering to request when the surface cannot confirm", () => {
    assert.equal(asSellable(offering("instant"), "request").bookingMode, "request");
    assert.equal(asSellable(offering("instant"), "inquire").bookingMode, "request");
  });

  it("never UPGRADES an offering the talent has set to request", () => {
    // The surface being able to confirm is permission, not instruction: if she
    // chose to review every booking, an agency host must not override that.
    assert.equal(asSellable(offering("request"), "instant").bookingMode, "request");
  });

  it("does not mutate the offering it is given", () => {
    const o = offering("instant");
    asSellable(o, "request");
    assert.equal(o.bookingMode, "instant");
  });

  it("returns the SAME object when nothing needs to change", () => {
    // Identity matters: the row list is re-derived on every render, and a new
    // object each time would defeat any memoisation downstream.
    const o = offering("request");
    assert.equal(asSellable(o, "request"), o);
  });
});

describe("railFor", () => {
  const detail = (intent: "request" | "instant") => ({ intent }) as never;
  const svc = (over: Record<string, unknown> = {}) =>
    ({ kind: "service", durationMinutes: 60, variants: [], addOns: [], ...over }) as never;

  it("sends an instant offering to the instant rail", () => {
    assert.equal(railFor(svc(), detail("instant"), "instant"), "tulala:offering-instant");
  });

  it("uses the slot rail for a plain timed service on a surface that mounts it", () => {
    assert.equal(railFor(svc(), detail("request"), "request"), "tulala:offering-slot");
  });

  it("does NOT use the slot rail on an inquire surface", () => {
    // profile-view mounts ProfileSlotPickerChrome only when bookingMode is not
    // "inquire", so a slot event there has no listener and the click dies.
    assert.equal(railFor(svc(), detail("request"), "inquire"), "tulala:offering-request");
  });

  it("does NOT use the slot rail for an offering with options", () => {
    // BookableComposer's slot listener drops variants and addOns, so a booking
    // made this way would carry the base configuration and the base price.
    const withVariants = svc({ variants: [{ id: "v1", label: "L", amountCents: 100 }] });
    assert.equal(railFor(withVariants, detail("request"), "request"), "tulala:offering-request");
    const withAddOns = svc({ addOns: [{ id: "a1", label: "A", amountCents: 50 }] });
    assert.equal(railFor(withAddOns, detail("request"), "request"), "tulala:offering-request");
  });

  it("does not use the slot rail for a product or an untimed service", () => {
    assert.equal(railFor(svc({ kind: "product" }), detail("request"), "request"), "tulala:offering-request");
    assert.equal(railFor(svc({ durationMinutes: 0 }), detail("request"), "request"), "tulala:offering-request");
  });
});
