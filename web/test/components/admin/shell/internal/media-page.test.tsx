// Smoke test for the media-page god-file (2600 LOC). WorkspaceMediaPage
// is Agency-gated and reads the bridge fixtures from useAdminShell. We
// mount it inside the real provider and confirm the surface renders
// without throwing, hitting the well-known plan-gated empty path
// (provider mock fixture defaults to no media + plan that we can't
// promote to agency without seeding — so the smoke target is the
// "imports + mounts" contract, not the populated grid).
import { describe, expect, it, vi } from "vitest";
import { WorkspaceMediaPage } from "@/components/admin/shell/internal/media-page";
import { testRenderWithShell } from "../../../../helpers/test-render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
  usePathname: () => "/admin/media",
  useSearchParams: () => new URLSearchParams(),
}));

describe("media-page.tsx smoke", () => {
  it("WorkspaceMediaPage mounts inside AdminShellProvider without throwing", () => {
    // The render is the assertion — if any of the 2600-LOC component's
    // import-time or mount-time code throws, this test fails.
    // Capture the rendered tree so we can prove SOMETHING was rendered;
    // we don't probe specific copy because the surface branches on plan
    // tier (Free / Studio / Agency) and bridge fixture availability —
    // both of which can change as the mock fixture evolves.
    const { container } = testRenderWithShell(<WorkspaceMediaPage />);
    expect(container.firstChild).not.toBeNull();
    // textContent is non-empty — i.e. SOMETHING rendered above null.
    expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
  });
});
