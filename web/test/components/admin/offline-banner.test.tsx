// Regression tests for the workspace "Connection lost" banner.
//
// Reported by a real user: the banner sat permanently across the top of the
// workspace on a machine with working internet, covering the header, and
// "Reintentar ahora" did nothing. Root cause was that the component rendered
// straight off `navigator.onLine` — which a VPN, a virtual network adapter,
// or DevTools' Offline throttle all flip to `false` on a healthy machine —
// and only ever cleared on a window `online` event that never came.
//
// These tests pin the four properties that fix depends on:
//   1. a false `navigator.onLine` alone must NOT show the banner
//   2. the banner appears only after a real request to our origin fails
//   3. "Retry now" genuinely re-probes and clears the banner
//   4. it self-heals on a timer, with no click at all
// plus a guard that it is not anchored to the top of the viewport, which is
// what made it occlude the workspace header.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { OfflineBanner } from "@/components/admin/offline-banner";
import { testRender } from "../../helpers/test-render";

/** jsdom exposes `onLine` as a plain own property, so redefining it works. */
function setBrowserOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
    writable: true,
  });
}

const BANNER = "[data-tulala-offline-banner]";
/** The banner text is rendered through the shell dictionary; locale is "en". */
const BANNER_TEXT = /Connection lost/i;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setBrowserOnline(true);
});

describe("OfflineBanner", () => {
  it("stays hidden when the browser claims offline but our origin answers", async () => {
    // The exact false-positive the user hit: navigator.onLine is stuck false
    // (VPN / virtual adapter) while the server is perfectly reachable.
    setBrowserOnline(false);
    fetchMock.mockResolvedValue({ ok: true } as Response);

    const { container } = testRender(<OfflineBanner />);

    // The probe must actually have run — we don't want this passing because
    // the component ignored the offline flag entirely.
    await waitFor(() => { expect(fetchMock).toHaveBeenCalled(); });
    expect(container.querySelector(BANNER)).toBeNull();
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });

  it("appears only once a real request to our origin fails", async () => {
    setBrowserOnline(false);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { container } = testRender(<OfflineBanner />);

    await waitFor(() => {
      expect(container.querySelector(BANNER)).not.toBeNull();
    });
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
    // Probed our own health route, not some third-party origin.
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/health");
  });

  it("is anchored to the bottom, never pinned over the workspace header", async () => {
    setBrowserOnline(false);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { container } = testRender(<OfflineBanner />);
    await waitFor(() => {
      expect(container.querySelector(BANNER)).not.toBeNull();
    });

    const el = container.querySelector(BANNER) as HTMLElement;
    // The original bug was `position: fixed; top: 0; z-index: 9999`, which
    // covered the account menu / search / quick-create for the whole session.
    expect(el.style.position).toBe("fixed");
    expect(el.style.top).toBe("");
    expect(el.style.bottom).not.toBe("");
  });

  it("clears when Retry now finds the server reachable again", async () => {
    setBrowserOnline(false);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { container } = testRender(<OfflineBanner />);
    await waitFor(() => {
      expect(container.querySelector(BANNER)).not.toBeNull();
    });

    // Server comes back, then the user clicks Retry. The old button only
    // flipped its own label for 1.5s and could never dismiss the banner.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true } as Response);
    fireEvent.click(screen.getByRole("button", { name: /Retry now/i }));

    await waitFor(() => {
      expect(container.querySelector(BANNER)).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("self-heals on the re-probe interval with no user interaction", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setBrowserOnline(false);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { container } = testRender(<OfflineBanner />);
    await waitFor(() => {
      expect(container.querySelector(BANNER)).not.toBeNull();
    });

    // Connectivity is restored but Chrome never fires an `online` event —
    // exactly the case that latched the old banner forever.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true } as Response);
    await vi.advanceTimersByTimeAsync(16000);

    await waitFor(() => {
      expect(container.querySelector(BANNER)).toBeNull();
    });
  });
});
