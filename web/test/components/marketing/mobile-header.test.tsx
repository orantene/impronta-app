/**
 * Mobile header redesign (2026-07-23) — the header carries the utility
 * cluster (language / support / account) at every width, and the hamburger
 * menu went back to being pure navigation: a real directory search on top,
 * the nav sections, and one clear action — instead of burying language,
 * support and the signed-in account's entire workspace/page list.
 *
 * These tests drive the open states through React directly because neither
 * browser-automation surface can (the preview pane doesn't deliver events to
 * React; headless Chrome races hydration). jsdom + fireEvent is the reliable
 * harness for "what renders when the menu opens".
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { MarketingHeader } from "@/components/marketing/header";
import type { MarketingAccount } from "@/components/marketing/marketing-account-menu";

const ACCOUNT: MarketingAccount = {
  displayName: "QA Admin",
  email: "qa@tulala.digital",
  dashboardHref: "https://app.tulala.digital/dashboard",
  accountHref: "https://app.tulala.digital/account",
  workspaces: [
    {
      slug: "impronta",
      name: "Impronta Models",
      role: "owner",
      href: "https://app.tulala.digital/impronta/admin",
    },
    {
      slug: "riviera",
      name: "Riviera Maya Work",
      role: "owner",
      href: "https://app.tulala.digital/riviera/admin",
    },
  ],
  talentPages: [],
  isTalent: false,
  globalHidden: false,
  talentLinks: null,
  talentUpgradeHref: null,
  isClient: false,
  clientTenants: [],
  clientLinks: null,
};

function openMobileMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
}

describe("mobile menu = search + navigation + one action", () => {
  it("opens with a real directory search that carries the locale", () => {
    render(<MarketingHeader locale="es" pathnameWithoutLocale="/" />);
    openMobileMenu();

    const search = screen.getByRole("search");
    // GET form straight to the locale's directory — the directory reads ?q=.
    expect(search).toHaveAttribute("action", "/es/directory");
    expect(search).toHaveAttribute("method", "get");
    const input = screen.getByRole("searchbox", { name: "Busca talento…" });
    expect(input).toHaveAttribute("name", "q");
  });

  it("no longer buries language, support, or the workspace list in the menu", () => {
    render(
      <MarketingHeader
        locale="en"
        pathnameWithoutLocale="/"
        account={ACCOUNT}
        signOutAction={undefined}
      />,
    );
    openMobileMenu();

    // The old menu rendered every workspace inline. Now the menu holds a
    // single Dashboard action; workspaces live in the avatar popover.
    const menuRegion = screen.getByRole("search").parentElement as HTMLElement;
    expect(menuRegion.textContent).not.toContain("Impronta Models");
    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveAttribute(
      "href",
      ACCOUNT.dashboardHref,
    );
  });

  it("logged out, the menu ends in Sign in + the free CTA", () => {
    render(<MarketingHeader locale="en" pathnameWithoutLocale="/" />);
    openMobileMenu();
    // Sign-in appears twice (desktop chip + menu row) — both are fine.
    expect(
      screen.getAllByRole("button", { name: /Sign in/ }).length,
    ).toBeGreaterThanOrEqual(1);
    const cta = screen
      .getAllByRole("link", { name: /Get started/ })
      .find((a) => a.getAttribute("href") === "/get-started");
    expect(cta).toBeTruthy();
  });
});

describe("header utility popovers work at mobile widths", () => {
  it("globe opens the language card with both locales and a scrim", () => {
    const { container } = render(
      <MarketingHeader locale="en" pathnameWithoutLocale="/" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Language" }));

    expect(screen.getByRole("menu", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /English/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("menuitem", { name: /Español/ })).toHaveAttribute("href", "/es");
    // Mobile scrim exists (hidden at lg+ via class, present in DOM).
    expect(container.querySelector(".fixed.inset-0.z-10")).toBeTruthy();
  });

  it("avatar opens the account card holding the workspaces", () => {
    render(
      <MarketingHeader locale="en" pathnameWithoutLocale="/" account={ACCOUNT} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "QA Admin" }));

    expect(screen.getByRole("menuitem", { name: /Impronta Models/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Riviera Maya Work/ })).toBeInTheDocument();
  });

  it("account trigger collapses to the avatar below lg", () => {
    render(
      <MarketingHeader locale="en" pathnameWithoutLocale="/" account={ACCOUNT} />,
    );
    const trigger = screen.getByRole("button", { name: "QA Admin" });
    const name = [...trigger.querySelectorAll("span")].find((s) =>
      s.textContent?.includes("QA Admin"),
    );
    expect(name?.className).toContain("hidden");
    expect(name?.className).toContain("lg:inline");
  });
});
