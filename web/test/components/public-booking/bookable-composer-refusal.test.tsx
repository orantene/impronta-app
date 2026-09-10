// D-100, the client half: a refusal the customer cannot read is the dead end.
//
// WHY THIS TEST IS SHAPED LIKE THIS
// ─────────────────────────────────
// The first pass at D-100 fixed two silent exits in `confirmInstant` and
// pinned them with a source-text test. That was not enough, because the
// refusal paragraph itself lived INSIDE `{instant && slot ? … : null}`, and
// two of the branches that set a refusal also knock out that condition in the
// same update:
//
//   • `slotTaken`  → `setError(res.error)` then `setSlot(null)`. React applies
//     both, `slot` is null on the next render, the whole block unmounts, and
//     "That time was just taken. Pick another time." — the sentence that tells
//     the customer what to do next — is never painted.
//   • `upgrade`    → `setError(res.error)` then `setForceRequest(true)`, and
//     `instant` is derived as `bookingMode === "instant" && !forceRequest`, so
//     the block unmounts again. The drawer opens, but the reason the instant
//     path was refused is never shown.
//
// A source-text assertion cannot see either one: the `setError` calls are all
// present and correct. Only rendering the component and looking for the
// sentence can. So this test drives the real component through the real click
// a customer makes; the only doubles are the slot list (a network read), the
// server action, and the inquiry drawer.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// `vi.mock` is hoisted above every const, so the spy is created in
// `vi.hoisted` and read back out.
const { createInstantBookingAction } = vi.hoisted(() => ({
  createInstantBookingAction: vi.fn(),
}));

vi.mock("@/lib/server-actions/instant-book-action", () => ({
  createInstantBookingAction,
}));

// The real picker fetches availability. Stand in for it with the one thing
// this test needs from it: a control that hands the composer a chosen slot,
// exactly as `SlotPicker` does through `onChange`.
vi.mock("@/components/public-booking/SlotPicker", () => ({
  SlotPicker: ({
    onChange,
  }: {
    onChange: (v: { startsAt: string; endsAt: string; timezone: string } | null) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          startsAt: "2026-09-12T15:00:00.000Z",
          endsAt: "2026-09-12T15:45:00.000Z",
          timezone: "America/Mexico_City",
        })
      }
    >
      pick a time
    </button>
  ),
}));

vi.mock("@/components/inquiry/InquiryDrawer", () => ({
  InquiryDrawer: () => <div data-testid="inquiry-drawer" />,
}));

import { BookableComposer } from "@/components/public-booking/BookableComposer";

const OFFERING = {
  offeringId: "off-gel-manicure",
  durationMinutes: 45,
  timezone: "America/Mexico_City",
  locationLabel: "Impronta Studio",
  talentProfileId: "tal-gel-manicure",
  requireAccountToBook: false,
  reserveMode: "deposit" as const,
  allowPayInPerson: false,
};

function renderComposer() {
  return render(
    <BookableComposer
      tenantSlug="impronta"
      tenantId="ten-impronta"
      agencyName="Impronta"
      offering={OFFERING}
      bookingMode="instant"
      signedIn
    />,
  );
}

/** Picks a time, then presses "Confirm this time" — the whole customer gesture. */
async function pickAndConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "pick a time" }));
  const confirm = await screen.findByRole("button", { name: "Confirm this time" });
  fireEvent.click(confirm);
}

describe("BookableComposer — a refusal the customer can read", () => {
  it("shows the reason when the slot was taken while they were deciding", async () => {
    // The engine's own copy for `slot_taken` (see mapEngineFail).
    createInstantBookingAction.mockResolvedValueOnce({
      ok: false,
      error: "That time was just taken. Pick another time.",
      slotTaken: true,
    });

    renderComposer();
    await pickAndConfirm();

    await waitFor(() => {
      expect(createInstantBookingAction).toHaveBeenCalledTimes(1);
    });

    // THE DEFECT: the refusal is set, the slot is cleared in the same update,
    // and the paragraph that would have shown it unmounts with the block.
    // The customer is left on an unchanged page with nothing to read.
    expect(
      await screen.findByText("That time was just taken. Pick another time."),
    ).toBeInTheDocument();
  });

  it("shows the reason when the plan cannot auto-confirm and it falls back to a request", async () => {
    createInstantBookingAction.mockResolvedValueOnce({
      ok: false,
      error: "This plan cannot auto-confirm. Send a request or upgrade.",
      upgrade: true,
    });

    renderComposer();
    await pickAndConfirm();

    // The drawer opening is not an explanation. `forceRequest` also turns
    // `instant` off, so the sentence has to survive outside that condition.
    expect(
      await screen.findByText("This plan cannot auto-confirm. Send a request or upgrade."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-drawer")).toBeInTheDocument();
  });

  it("still shows a refusal that leaves the slot alone", async () => {
    createInstantBookingAction.mockResolvedValueOnce({
      ok: false,
      error: "We couldn't complete the booking. Please try the inquiry option instead.",
    });

    renderComposer();
    await pickAndConfirm();

    expect(
      await screen.findByText(
        "We couldn't complete the booking. Please try the inquiry option instead.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a sentence when the server action itself rejects", async () => {
    createInstantBookingAction.mockRejectedValueOnce(new Error("network down"));

    renderComposer();
    await pickAndConfirm();

    expect(
      await screen.findByText("We could not confirm that booking. Please try again."),
    ).toBeInTheDocument();
  });

  it("every refusal lands in a live region, so a screen reader hears it too", async () => {
    createInstantBookingAction.mockResolvedValueOnce({
      ok: false,
      error: "That time was just taken. Pick another time.",
      slotTaken: true,
    });

    renderComposer();
    await pickAndConfirm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That time was just taken. Pick another time.");
  });
});
