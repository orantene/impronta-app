/**
 * The slot bridge is the part of the inspector adoption that can be WRONG in a
 * way a screenshot will not show: a chip lighting while a free override is in
 * effect, or a token click leaving the free length behind so the page does not
 * move. Both are unit-testable without React, so they are tested here.
 */

import { describe, expect, it } from "vitest";

import { GAP_PRESETS, RADIUS_PRESETS } from "../field-kit";
import {
  oneSlotFieldValue,
  oneSlotPatch,
  twoSlotFieldValue,
  twoSlotPatch,
} from "./field-value-bridge";

describe("two-slot fields (token + free)", () => {
  it("is unset when neither slot is written", () => {
    expect(twoSlotFieldValue(undefined, undefined)).toEqual({ kind: "unset" });
  });

  it("lights the token chip when only the token is written", () => {
    expect(twoSlotFieldValue("md", undefined)).toEqual({ kind: "preset", id: "md" });
  });

  it("shows the FREE length when both are written — the renderer layers free last", () => {
    expect(twoSlotFieldValue("md", "13px")).toEqual({
      kind: "custom",
      numeric: { value: 13, unit: "px" },
    });
  });

  it("clears the free slot when a chip is clicked", () => {
    expect(twoSlotPatch({ kind: "preset", id: "lg" })).toEqual({
      token: "lg",
      free: undefined,
    });
  });

  it("clears the token slot when an exact value is typed", () => {
    expect(twoSlotPatch({ kind: "custom", numeric: { value: 13, unit: "px" } })).toEqual({
      token: undefined,
      free: "13px",
    });
  });

  it("clears both slots when the field is unset", () => {
    expect(twoSlotPatch({ kind: "unset" })).toEqual({ token: undefined, free: undefined });
  });

  it("round-trips a radius token through the real preset table", () => {
    const patch = twoSlotPatch({ kind: "preset", id: "sm" });
    expect(RADIUS_PRESETS.some((p) => p.id === patch.token)).toBe(true);
    expect(twoSlotFieldValue(patch.token, patch.free)).toEqual({
      kind: "preset",
      id: "sm",
    });
  });
});

describe("one-slot fields (a free length with preset shortcuts)", () => {
  it("is unset when the key is empty", () => {
    expect(oneSlotFieldValue(undefined, GAP_PRESETS)).toEqual({ kind: "unset" });
  });

  it("writes the preset's OWN css, not a px re-rounding", () => {
    // GAP `m` is 1.25rem in the renderer. Writing "20px" instead would re-scale
    // the page at any root size other than 16px.
    expect(oneSlotPatch({ kind: "preset", id: "M" }, GAP_PRESETS)).toBe("1.25rem");
  });

  it("re-lights the chip after writing it — rem storage vs px caption", () => {
    const css = oneSlotPatch({ kind: "preset", id: "M" }, GAP_PRESETS);
    expect(oneSlotFieldValue(css, GAP_PRESETS)).toEqual({ kind: "preset", id: "M" });
  });

  it("lights a chip for an equivalent px value typed by hand", () => {
    // 1.25rem === 20px at the root size the captions are computed against.
    expect(oneSlotFieldValue("20px", GAP_PRESETS)).toEqual({ kind: "preset", id: "M" });
  });

  it("keeps a value no preset owns as an explicit custom", () => {
    expect(oneSlotFieldValue("13px", GAP_PRESETS)).toEqual({
      kind: "custom",
      numeric: { value: 13, unit: "px" },
    });
  });

  it("clears the key when unset", () => {
    expect(oneSlotPatch({ kind: "unset" }, GAP_PRESETS)).toBeUndefined();
  });
});
