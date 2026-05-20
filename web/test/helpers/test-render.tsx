// test/helpers/test-render.tsx — wraps @testing-library/react's render
// with the minimum set of providers our god-files reach into.
//
// Two render entry-points to keep import costs honest:
//   - testRender()           : bare render. Default for primitives.
//   - testRenderWithShell()  : wraps in <AdminShellProvider>. Default
//                              for any test that touches a component
//                              that calls useAdminShell().
//
// We split rather than gate via flag so simple primitive tests don't
// pay AdminShellProvider's transitive import cost (~30 modules). Tests
// that need next/navigation should also `vi.mock("next/navigation", …)`
// at the top of the test file — the shell prefetches routes on mount.
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { AdminShellProvider } from "@/components/admin/shell/internal/state";

export type TestRenderOptions = RenderOptions;

/**
 * Bare render with no providers. Use for self-contained primitives
 * (Icon, Card, ConfirmDialog) that don't touch admin-shell context.
 */
export function testRender(
  ui: ReactElement,
  options: TestRenderOptions = {},
): RenderResult {
  return render(ui, options);
}

/**
 * Render wrapped in `<AdminShellProvider>` using its built-in mock
 * fixture behaviour (initialBridgeData defaults to null = 100% mock).
 * Use for any component that calls `useAdminShell()`.
 */
export function testRenderWithShell(
  ui: ReactElement,
  options: TestRenderOptions = {},
): RenderResult {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <AdminShellProvider>{children}</AdminShellProvider>
  );
  return render(ui, { wrapper: Wrapper, ...options });
}
