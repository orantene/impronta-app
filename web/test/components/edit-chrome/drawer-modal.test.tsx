// A11Y-1 — the shared Drawer primitive is a true modal dialog.
//
// ⚠️ PATH-CRITICAL: must live under web/test/ (vitest collects only
// `test/**/*.test.tsx`; jsdom only runs here).
//
// Proves the ONE shared Drawer primitive — the home every editor drawer across
// all four surfaces (Lab / storefront / talent profile / talent site) mounts
// through — renders role="dialog" + aria-modal="true" when `modal`, installs
// the shared focus trap (focus moves in, Escape → onRequestClose, restore on
// close), and marks the editor chrome behind it `inert`. Because every utility
// drawer (Publish/Theme/Revisions/Page settings/Assets/Collections/Schedule/
// Comments/Media) opts in via `modal`, the assertion here is the structural
// proof that all consumers inherit modality from the single primitive — no
// per-surface fork.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import { Drawer, DrawerHead, DrawerBody } from "@/components/edit-chrome/kit/drawer";

afterEach(cleanup);

function renderBehindChrome() {
  // A stand-in for the editor topbar that should go inert behind a modal drawer.
  const topbar = document.createElement("div");
  topbar.setAttribute("data-edit-topbar", "");
  topbar.innerHTML = '<button type="button">topbar action</button>';
  document.body.appendChild(topbar);
  return () => topbar.remove();
}

describe("Drawer (A11Y-1 modal dialog)", () => {
  it("renders role=dialog + aria-modal when modal, and neither when not", () => {
    const { rerender, getByTestId } = render(
      <Drawer kind="publish" testId="d" open modal onRequestClose={() => {}}>
        <DrawerHead title="Publish" titleId="t" onClose={() => {}} />
        <DrawerBody>body</DrawerBody>
      </Drawer>,
    );
    const aside = getByTestId("d");
    expect(aside.getAttribute("role")).toBe("dialog");
    expect(aside.getAttribute("aria-modal")).toBe("true");

    rerender(
      <Drawer kind="publish" testId="d" open>
        <DrawerHead title="Publish" titleId="t" onClose={() => {}} />
        <DrawerBody>body</DrawerBody>
      </Drawer>,
    );
    const nonModal = getByTestId("d");
    expect(nonModal.getAttribute("role")).toBeNull();
    expect(nonModal.getAttribute("aria-modal")).toBeNull();
  });

  it("moves focus into the drawer when it opens", () => {
    const { getByTestId } = render(
      <Drawer kind="publish" testId="d" open modal onRequestClose={() => {}}>
        <DrawerHead title="Publish" titleId="t" onClose={() => {}} />
        <DrawerBody>
          <button type="button">First action</button>
        </DrawerBody>
      </Drawer>,
    );
    // useModalFocusTrap moves focus to the first focusable INSIDE the drawer on
    // open (the header close button), so focus is captured within the dialog.
    const dialog = getByTestId("d");
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("calls onRequestClose on Escape and stops propagation (no double-dismiss)", () => {
    const onRequestClose = vi.fn();
    const bubbledEscape = vi.fn();
    document.addEventListener("keydown", bubbledEscape);

    render(
      <Drawer kind="publish" testId="d" open modal onRequestClose={onRequestClose}>
        <DrawerHead title="Publish" titleId="t" onClose={() => {}} />
        <DrawerBody>
          <button type="button">Action</button>
        </DrawerBody>
      </Drawer>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    // The trap stops propagation in the capture phase, so the shell's global
    // Escape ladder (a bubble-phase listener) never sees it — single close path.
    expect(bubbledEscape).not.toHaveBeenCalled();

    document.removeEventListener("keydown", bubbledEscape);
  });

  it("marks behind-drawer editor chrome inert while open, and restores on unmount", () => {
    // jsdom doesn't reflect the `inert` IDL property, so assert on the
    // attribute (which the controller also sets) — the reliable cross-env
    // signal. In a real browser the IDL property carries the same state.
    const removeChrome = renderBehindChrome();
    const topbar = document.querySelector<HTMLElement>("[data-edit-topbar]")!;
    expect(topbar.hasAttribute("inert")).toBe(false);

    const { unmount } = render(
      <Drawer kind="publish" testId="d" open modal onRequestClose={() => {}}>
        <DrawerHead title="Publish" titleId="t" onClose={() => {}} />
        <DrawerBody>
          <button type="button">Action</button>
        </DrawerBody>
      </Drawer>,
    );
    expect(topbar.hasAttribute("inert")).toBe(true);

    unmount();
    expect(topbar.hasAttribute("inert")).toBe(false);
    removeChrome();
  });

  it("does NOT make chrome inert for a non-modal drawer (the inspector stays interactive)", () => {
    const removeChrome = renderBehindChrome();
    const topbar = document.querySelector<HTMLElement>("[data-edit-topbar]")!;

    render(
      <Drawer kind="dock" testId="d" open>
        <DrawerHead title="Inspector" titleId="t" onClose={() => {}} />
        <DrawerBody>
          <button type="button">Action</button>
        </DrawerBody>
      </Drawer>,
    );
    expect(topbar.hasAttribute("inert")).toBe(false);
    removeChrome();
  });
});
