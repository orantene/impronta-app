// The contextual upgrade prompt, end to end, through the real chain.
//
// WHY THIS TEST IS SHAPED LIKE THIS
// ─────────────────────────────────
// The bug it replaces was pure wiring: a modal whose primary CTA called a
// `useState` plan setter and toasted "upgrade applied" while `agencies.plan_tier`
// stayed `free` and Stripe was never contacted. No function was wrong — the
// wrong component was mounted. So this test refuses to render the modal
// directly with hand-made props. It mounts the providers in the same order the
// shell mounts them, opens the prompt through `useAdminShell()`'s
// `openUpgrade()` (the entry point all ~45 call sites use), and clicks the CTA
// a user would click. The only thing stubbed is the server action itself.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// `vi.mock` is hoisted above every const in this file, so the spy has to be
// created inside `vi.hoisted` and read back out.
const { startWorkspaceUpgrade } = vi.hoisted(() => ({
  startWorkspaceUpgrade: vi.fn(async () => ({
    ok: true as const,
    redirectUrl: "https://checkout.stripe.com/c/pay/test-session",
  })),
}));

vi.mock(
  "@/app/(workspace)/[tenantSlug]/admin/account/stripe-billing-actions",
  () => ({ startWorkspaceUpgrade }),
);

vi.mock("@/lib/server-actions/admin-billing", () => ({
  changeWorkspacePlan: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
  usePathname: () => "/acme/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  AdminShellProvider,
  useAdminShell,
} from "@/components/admin/shell/internal/state";
import { UpgradeModalProvider } from "@/components/admin/site-control-center/upgrade-context";
import { ShellUpgradeModal } from "@/components/admin/shell/internal/shell-upgrade-modal";

/**
 * Stands in for a locked card. Calls exactly what `WorkspacePageView` calls for
 * the Custom domain row.
 */
function LockedCustomDomainCard() {
  const { openUpgrade } = useAdminShell();
  return (
    <button
      type="button"
      onClick={() =>
        openUpgrade({
          feature: "Custom domain",
          why: "Run the site on your own domain.",
          requiredPlan: "agency",
        })
      }
    >
      Unlock custom domain
    </button>
  );
}

function mountShell() {
  return render(
    // Same nesting as admin-shell-client.tsx: the provider is an ANCESTOR of
    // AdminShellProvider, because the shell context calls useUpgradeModal().
    <UpgradeModalProvider>
      <AdminShellProvider tenantSlug="acme">
        <LockedCustomDomainCard />
        <ShellUpgradeModal />
      </AdminShellProvider>
    </UpgradeModalProvider>,
  );
}

function openPrompt() {
  fireEvent.click(screen.getByRole("button", { name: "Unlock custom domain" }));
}

describe("contextual upgrade prompt", () => {
  it("opens the real plan modal and names the feature and the tier", async () => {
    mountShell();

    // Nothing is open until the locked card is clicked.
    expect(screen.queryByText("Choose your plan")).not.toBeInTheDocument();

    openPrompt();

    // The REAL modal. The deleted one's heading was "Upgrade to {plan}" and it
    // never rendered a four-tier grid.
    expect(await screen.findByText("Choose your plan")).toBeInTheDocument();

    // The contextual framing survived the hop from openUpgrade() into the
    // modal, so this is not a generic plan picker.
    expect(screen.getByText("Custom domain needs Agency")).toBeInTheDocument();
    expect(
      screen.getByText("Run the site on your own domain."),
    ).toBeInTheDocument();

    // ...and the tier that unlocks the feature is the one marked in the grid.
    const required = document.querySelector("[data-upgrade-required-plan]");
    expect(required?.getAttribute("data-upgrade-required-plan")).toBe("agency");
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });

  it("routes the primary CTA to the Stripe checkout action, not to local state", async () => {
    startWorkspaceUpgrade.mockClear();
    mountShell();
    openPrompt();

    fireEvent.click(
      await screen.findByRole("button", { name: "Upgrade to Agency" }),
    );

    // The assertion the deleted modal could never have passed: a real server
    // action, called with the plan and the tenant slug.
    await waitFor(() => expect(startWorkspaceUpgrade).toHaveBeenCalledTimes(1));
    const [plan, slug] = startWorkspaceUpgrade.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect(plan).toBe("agency");
    expect(slug).toBe("acme");
  });

  it("does not move the tenant's tier locally when the CTA is clicked", async () => {
    startWorkspaceUpgrade.mockClear();
    mountShell();
    openPrompt();

    fireEvent.click(
      await screen.findByRole("button", { name: "Upgrade to Agency" }),
    );
    await waitFor(() => expect(startWorkspaceUpgrade).toHaveBeenCalled());

    // The deleted modal set the shell's plan right here and toasted a welcome.
    // The tier only moves when Stripe (via the webhook) says it did, so
    // reopening the prompt must still show Free as the current plan.
    openPrompt();
    const currentBadge = await screen.findByText("Current");
    const card = currentBadge.closest("[data-upgrade-required-plan], div");
    expect(card?.textContent).toContain("Free");
    expect(
      screen.queryByText(/upgrade applied/i),
    ).not.toBeInTheDocument();
  });
});
