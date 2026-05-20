// Smoke test for edit-context.tsx (4550 LOC). This is the most under-
// audited high-risk god-file in the codebase — every builder mutation,
// inspector, and publish-preflight check flows through it. We can't
// smoke-test the full provider behaviour without a composition fixture,
// but we CAN prove:
//   1. EditProvider mounts with minimal props (tenantId only).
//   2. The provider's context value is delivered to children via
//      useEditContext() — i.e. the React.createContext / Provider
//      wiring still works.
//   3. useMaybeEditContext() returns null outside the provider (the
//      escape hatch components rely on when mounted on public surfaces).
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  EditProvider,
  useEditContext,
  useMaybeEditContext,
} from "@/components/edit-chrome/edit-context";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
  usePathname: () => "/admin/website",
  useSearchParams: () => new URLSearchParams(),
}));

describe("edit-context.tsx smoke", () => {
  it("useMaybeEditContext returns null outside EditProvider", () => {
    const { result } = renderHook(() => useMaybeEditContext());
    expect(result.current).toBeNull();
  });

  it("useEditContext throws outside EditProvider", () => {
    // Suppress the React error-boundary noise that renderHook prints
    // to console.error when the hook throws — the assertion is the proof.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useEditContext())).toThrow(
      /useEditContext must be used within EditProvider/,
    );
    spy.mockRestore();
  });

  it("EditProvider delivers tenantId + workspacePlan defaults via context", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EditProvider tenantId="tenant-smoke">{children}</EditProvider>
    );
    const { result } = renderHook(() => useEditContext(), { wrapper });
    expect(result.current.tenantId).toBe("tenant-smoke");
    // workspacePlan defaults to null → normalized via builderPlanAllows;
    // the contract is that we always get a string field back.
    expect(typeof result.current.workspacePlan).toBe("string");
    // selectedSectionId is null at first paint.
    expect(result.current.selectedSectionId).toBeNull();
  });
});
