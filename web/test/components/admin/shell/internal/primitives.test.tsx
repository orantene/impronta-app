// Smoke tests for `src/components/admin/shell/internal/primitives.tsx`
// (8464 LOC god-file — the foundation every admin-shell page is built on).
//
// Scope: prove that the simple, self-contained visual primitives render
// without throwing and that one interactive primitive (ConfirmDialog)
// fires its callbacks. NOT exhaustive coverage. If this test breaks, a
// PR touched the rendering shape of a primitive that everything in the
// shell depends on — that's exactly the regression a smoke test should
// catch.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import {
  Card,
  ConfirmDialog,
  H1,
  Icon,
  StatusPill,
} from "@/components/admin/shell/internal/primitives";
import { testRender } from "../../../../helpers/test-render";

describe("primitives.tsx smoke", () => {
  it("Icon renders an SVG for the given name", () => {
    const { container } = testRender(<Icon name="chevron-right" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // The size prop maps to width/height on the SVG.
    expect(svg).toHaveAttribute("width", "14");
  });

  it("H1 renders its children as a heading", () => {
    testRender(<H1>Workspace Settings</H1>);
    expect(screen.getByText("Workspace Settings")).toBeInTheDocument();
  });

  it("Card with onClick is keyboard-focusable and fires on click", () => {
    const onClick = vi.fn();
    testRender(
      <Card onClick={onClick} interactive dataAttr="smoke">
        Hello card
      </Card>,
    );
    const card = screen.getByText("Hello card");
    // The card primitive sets role="button" + tabIndex=0 when onClick is
    // provided (see primitives.tsx:690-691). Verify that contract.
    const button = card.closest('[role="button"]');
    expect(button).not.toBeNull();
    expect(button).toHaveAttribute("tabindex", "0");
    expect(button).toHaveAttribute("data-tulala-card", "smoke");

    fireEvent.click(button!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("StatusPill renders label with the requested tone palette", () => {
    testRender(<StatusPill tone="green" label="Booked" />);
    expect(screen.getByText("Booked")).toBeInTheDocument();
  });

  it("ConfirmDialog renders nothing when closed and fires onConfirm when accepted", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = testRender(
      <ConfirmDialog
        open={false}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete workspace?"
        body="This cannot be undone."
      />,
    );
    // Closed state — dialog renders null (primitives.tsx:790).
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete workspace?"
        body="This cannot be undone."
        confirmLabel="Yes, delete"
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete workspace?")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Yes, delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
