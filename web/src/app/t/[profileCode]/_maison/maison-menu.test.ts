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

import { asSellable } from "./MaisonMenu";

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
