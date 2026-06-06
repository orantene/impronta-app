// Marathon W3-T5 — in-app HSV picker mount + interaction contract.
//
// ⚠️ PATH-CRITICAL: must live under web/test/ (vitest collects only
// `test/**/*.test.tsx`; jsdom only runs here).
//
// Proves the self-contained HsvPicker that REPLACES the OS `<input type="color">`
// (so color-picking stays on the branded surface) actually mounts and emits a
// 6-char hex on a deterministic keyboard interaction. Pointer-drag math depends
// on getBoundingClientRect (0×0 in jsdom), so we drive the keyboard slider —
// which is also the a11y path the change adds.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { HsvPicker } from "@/components/edit-chrome/kit/hsv-picker";

describe("HsvPicker", () => {
  it("renders the SV square + hue strip as accessible sliders (no native input[type=color])", () => {
    const { container, getByLabelText } = render(
      <HsvPicker value="#ff0000" onChange={() => {}} />,
    );
    expect(getByLabelText("Saturation and brightness")).toBeTruthy();
    expect(getByLabelText("Hue")).toBeTruthy();
    // The whole point of W3-T5: no OS color chrome.
    expect(container.querySelector('input[type="color"]')).toBeNull();
  });

  it("emits a 6-char hex when the saturation/value slider is nudged by keyboard", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <HsvPicker value="#808080" onChange={onChange} />,
    );
    const square = getByLabelText("Saturation and brightness");
    fireEvent.keyDown(square, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalled();
    const emitted = onChange.mock.calls.at(-1)?.[0] as string;
    expect(emitted).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("emits a different hex when the hue slider is nudged", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <HsvPicker value="#ff0000" onChange={onChange} />,
    );
    const hue = getByLabelText("Hue");
    fireEvent.keyDown(hue, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalled();
    const emitted = onChange.mock.calls.at(-1)?.[0] as string;
    expect(emitted).toMatch(/^#[0-9a-f]{6}$/);
    // Moving hue off pure red must change the color.
    expect(emitted).not.toBe("#ff0000");
  });

  it("re-syncs from an external value change", () => {
    const { getByLabelText, rerender } = render(
      <HsvPicker value="#ff0000" onChange={() => {}} />,
    );
    // Red → hue 0.
    expect(getByLabelText("Hue").getAttribute("aria-valuenow")).toBe("0");
    rerender(<HsvPicker value="#0000ff" onChange={() => {}} />);
    // Blue → hue 240.
    expect(getByLabelText("Hue").getAttribute("aria-valuenow")).toBe("240");
  });
});
