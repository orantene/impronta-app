/**
 * The trial door card says the plan, the price and the day the card is
 * charged in one sentence, offers exactly one button and "Not now", and
 * reports the shown/dismissed events. Rendered with a fixed offer; the
 * server action that resolves the offer is mocked out.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as Dialog from "@radix-ui/react-dialog";

const track = vi.fn();
vi.mock("@/lib/analytics/track-client", () => ({ trackProductEvent: (...args: unknown[]) => track(...args) }));
vi.mock("@/lib/server-actions/trial-door", () => ({ loadTrialDoorOffer: vi.fn() }));
vi.mock("@/i18n/use-dashboard-locale", () => ({ useDashboardLocale: () => "en" }));

import { TrialDoorCard } from "@/components/billing/trial-door-card";

const OFFER = {
  door: "custom_domain",
  planKey: "agency" as const,
  planName: "Agency",
  monthlyPriceCents: 7900,
  trialDays: 14,
  chargeDateIso: "2026-10-01T10:00:00.000Z",
};

function mount(offer: typeof OFFER | null | undefined, onStart = vi.fn(), onNotNow = vi.fn()) {
  return render(
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Content>
          <TrialDoorCard door="custom_domain" feature="Custom domain" offer={offer} pending={false} onStart={onStart} onNotNow={onNotNow} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>,
  );
}

describe("TrialDoorCard", () => {
  it("says plan, price and charge day in one sentence and offers one button", () => {
    track.mockClear();
    const onStart = vi.fn();
    const { getByTestId, getByText } = mount(OFFER, onStart);
    expect(getByText(/Agency is free for 14 days, then \$79 a month starting October 1\. Cancel any time\./)).toBeTruthy();
    const start = getByTestId("trial-door-start") as HTMLButtonElement;
    expect(start.textContent).toBe("Start 14 days free");
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledWith(OFFER);
    expect(track).toHaveBeenCalledWith("trial_door_shown", { door: "custom_domain", plan: "agency", trial_days: 14 });
  });

  it("without a trial it says charged today", () => {
    const { getByText, getByTestId } = mount({ ...OFFER, trialDays: 0 });
    expect(getByText(/Agency is \$79 a month, charged today\./)).toBeTruthy();
    expect(getByTestId("trial-door-start").textContent).toBe("Get Agency");
  });

  it("Not now closes and the button waits while the offer loads", () => {
    const onNotNow = vi.fn();
    const { getByTestId } = mount(undefined, vi.fn(), onNotNow);
    expect((getByTestId("trial-door-start") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(getByTestId("trial-door-not-now"));
    expect(onNotNow).toHaveBeenCalledTimes(1);
  });
});
