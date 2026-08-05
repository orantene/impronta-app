// Vitest-authored unit tests for the inspector's responsive-field-state helpers.
//
// ⚠️ PATH-CRITICAL: must live under web/test/ (vitest collects only
// `test/**/*.test.tsx`).
//
// B2 (2026-08-04) — this file used to sit beside its source at
// `src/components/edit-chrome/inspectors/responsive-field-state.test.ts`, where
// the `tsx --test` builder lanes picked it up and it exploded with "Vitest
// cannot be imported in a CommonJS module using require()". It was quarantined
// rather than fixed. It is not broken — it was simply in the wrong runner's
// tree. Moved here so it actually RUNS (under `npm run test:components`)
// instead of being excluded; the assertions are unchanged.
import { describe, expect, it } from "vitest";

import {
  countPresentationOverrides,
  countStyleOverrides,
  getNodePresentationOverrideDevice,
  getPresentationOverrideDevice,
  getStyleOverrideDevice,
  patchFieldForDevice,
} from "@/components/edit-chrome/inspectors/responsive-field-state";

describe("responsive-field-state", () => {
  it("detects presentation override device", () => {
    const presentation = {
      paddingTop: "l",
      breakpoints: {
        tablet: { paddingTop: "m" },
        mobile: { visibility: "hidden" },
      },
    };
    expect(getPresentationOverrideDevice(presentation, "paddingTop")).toBe("tablet");
    expect(getPresentationOverrideDevice(presentation, "visibility")).toBe("mobile");
    expect(getPresentationOverrideDevice(presentation, "container")).toBeNull();
  });

  it("counts presentation overrides per device", () => {
    const presentation = {
      breakpoints: {
        tablet: { paddingTop: "m", paddingBottom: "s" },
        mobile: { visibility: "hidden" },
      },
    };
    expect(countPresentationOverrides(presentation, "tablet")).toBe(2);
    expect(countPresentationOverrides(presentation, "mobile")).toBe(1);
  });

  it("detects style override device", () => {
    const style = {
      fontSize: "16px",
      responsive: {
        tablet: { fontSize: "14px" },
      },
    };
    expect(getStyleOverrideDevice(style, "fontSize")).toBe("tablet");
    expect(getStyleOverrideDevice(style, "align")).toBeNull();
  });

  it("counts style overrides", () => {
    const style = {
      responsive: {
        mobile: { visibility: "hidden" as const, fontSize: "12px" },
      },
    };
    expect(countStyleOverrides(style, "mobile")).toBe(2);
  });

  it("detects node presentation override device", () => {
    const nodePresentation = {
      breakpoints: {
        tablet: { fontSizePx: 24 },
      },
    };
    expect(getNodePresentationOverrideDevice(nodePresentation, "fontSizePx")).toBe(
      "tablet",
    );
  });

  it("patchFieldForDevice routes desktop vs breakpoint bucket", () => {
    expect(patchFieldForDevice("desktop", "paddingTop", "l")).toEqual({
      paddingTop: "l",
    });
    expect(patchFieldForDevice("tablet", "paddingTop", "m")).toEqual({
      breakpoints: { tablet: { paddingTop: "m" } },
    });
  });
});
