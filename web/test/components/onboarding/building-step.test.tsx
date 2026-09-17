/**
 * The building screen must visibly move for the whole 7–28 s build: the
 * progress bar fills, the ring advances down the step list, and the "what is
 * being made" line rotates. Verified under fake timers; the server is never
 * involved (the last step waits on it by design).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

import { BuildingStep } from "@/components/onboarding/steps/building-step";
import { ReadingStep } from "@/components/onboarding/steps/reading-step";

const t = (key: string) => key.split(".").pop() ?? key;

describe("BuildingStep", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("progress fills, the ring advances, and the wait line rotates over time", () => {
    const { getByTestId } = render(<BuildingStep t={t} path="business" />);
    const bar = getByTestId("onb-progress").querySelector("[role=progressbar]") as HTMLElement;
    const steps = getByTestId("onb-loading-steps");
    const wait = () => getByTestId("onb-while-you-wait").textContent;

    expect(Number(bar.getAttribute("aria-valuenow"))).toBe(0);
    expect(steps.getAttribute("data-active")).toBe("1");
    const firstLine = wait();

    act(() => vi.advanceTimersByTime(8000));
    const mid = Number(bar.getAttribute("aria-valuenow"));
    expect(mid).toBeGreaterThan(20);
    expect(mid).toBeLessThan(60);
    expect(steps.getAttribute("data-active")).toBe("2");
    expect(wait()).not.toBe(firstLine);

    act(() => vi.advanceTimersByTime(30000));
    // Past the estimate: creeps but never claims done, and the ring sits on the last step.
    const late = Number(bar.getAttribute("aria-valuenow"));
    expect(late).toBeGreaterThanOrEqual(92);
    expect(late).toBeLessThan(100);
    expect(steps.getAttribute("data-active")).toBe("3");
    expect(steps.querySelectorAll(".animate-spin").length).toBe(1);
  });

  it("done snaps the bar to 100 and ticks every step", () => {
    const { getByTestId } = render(<BuildingStep t={t} path="talent" done />);
    const bar = getByTestId("onb-progress").querySelector("[role=progressbar]") as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(getByTestId("onb-loading-steps").querySelectorAll(".animate-spin").length).toBe(0);
  });
});

describe("ReadingStep", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the ring on the first line at once and moves it each second", () => {
    const { getByTestId } = render(<ReadingStep t={t} input={{ kind: "text", value: "I clean houses" }} />);
    const steps = getByTestId("onb-loading-steps");
    expect(steps.getAttribute("data-active")).toBe("0");
    expect(steps.querySelectorAll(".animate-spin").length).toBe(1);
    act(() => vi.advanceTimersByTime(2100));
    expect(steps.getAttribute("data-active")).toBe("2");
  });
});
