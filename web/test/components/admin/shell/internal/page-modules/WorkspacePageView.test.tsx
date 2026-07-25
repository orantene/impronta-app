// Smoke test for the WorkspacePageView god-file. The component is a
// function-of-context — it reads everything from useAdminShell(), so the
// smoke test mounts it inside the real AdminShellProvider and verifies
// that the settings shell ("Settings" title + flat group nav) renders
// without throwing.
//
// Why a real provider rather than a hand-rolled mock: the provider
// already includes a "mock fixture" mode (initialBridgeData defaults
// to null → 100% mock behaviour, per the prop comment). That's exactly
// what we want for a smoke test — a real Provider with synthesised
// state, not a partial fake.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { WorkspacePageView } from "@/components/admin/shell/internal/page-modules/WorkspacePageView";
import { testRenderWithShell } from "../../../../../helpers/test-render";

// next/navigation is reached during provider boot (router.prefetch,
// useRouter). Stub the minimum so AdminShellProvider can run.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
  usePathname: () => "/admin/workspace",
  useSearchParams: () => new URLSearchParams(),
}));

describe("WorkspacePageView smoke", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the Settings page chrome inside AdminShellProvider", () => {
    const { container } = testRenderWithShell(<WorkspacePageView />);
    // PageHeader title — "Settings" is hard-coded at WorkspacePageView.tsx:196.
    expect(screen.getByText("Settings")).toBeInTheDocument();
    // Flat left nav — the tabs-plus-accordions layout was replaced by one
    // group per row, marked with `data-tulala-settings-nav`. Scope the
    // query so we don't collide with content-pane headings of the same name.
    const nav = container.querySelector("[data-tulala-settings-nav]");
    expect(nav).not.toBeNull();
    const navText = nav!.textContent ?? "";
    expect(navText).toContain("Workspace");
    expect(navText).toContain("Roster & profile fields");
    expect(navText).toContain("Integrations");
    expect(navText).toContain("Advanced");
  });
});
