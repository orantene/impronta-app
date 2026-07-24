/**
 * Talent registration modal — bilingual copy + the locale actually submitted.
 *
 * The modal was English-only on every surface including /es, and its form
 * hardcoded `<input name="locale" value="en">`, so a Spanish visitor who
 * signed up here was silently registered as an English user (which then drives
 * their notification emails). Both are pinned below.
 *
 * jsdom rather than a browser: the modal is client-only and the preview pane
 * never hydrates local dev.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

// The signup server action can't run in jsdom; useActionState only needs it to
// be a function until submit, which these tests never do.
vi.mock("@/app/auth/actions", () => ({ signUpWithEmail: vi.fn() }));

import { TalentRegisterModal } from "@/components/marketing/talent-register-modal";

const noop = () => {};

describe("platform variant", () => {
  it("renders Spanish copy on /es", () => {
    render(<TalentRegisterModal locale="es" onClose={noop} />);

    expect(screen.getByText("Únete como talento · gratis")).toBeInTheDocument();
    expect(screen.getByText(/Tu página de talento,/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear mi página de talento/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuar con Google/ })).toBeInTheDocument();
    expect(screen.getByText("Gratis para siempre")).toBeInTheDocument();
    // and no English leaked through
    expect(screen.queryByText("Free forever")).not.toBeInTheDocument();
    expect(screen.queryByText(/Create my talent page/)).not.toBeInTheDocument();
  });

  it("still renders English by default", () => {
    render(<TalentRegisterModal onClose={noop} />);
    expect(screen.getByText("Join as talent · free")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create my talent page/ })).toBeInTheDocument();
    expect(screen.queryByText("Gratis para siempre")).not.toBeInTheDocument();
  });
});

describe("the locale stamped on the new account", () => {
  // The modal portals to document.body, so query there — not the RTL container.
  const localeField = () =>
    document.body.querySelector('input[name="locale"]') as HTMLInputElement | null;

  it("submits the active locale, not a hardcoded 'en'", () => {
    render(<TalentRegisterModal locale="es" onClose={noop} />);
    expect(localeField()).toHaveValue("es");
  });

  it("submits en on the English surface", () => {
    render(<TalentRegisterModal locale="en" onClose={noop} />);
    expect(localeField()).toHaveValue("en");
  });
});

describe("tenant-branded variant", () => {
  const tenant = {
    slug: "impronta",
    displayName: "Impronta Models",
    logoSvg: null,
    isAuthedTalent: false,
  };

  it("localizes the join copy and keeps the workspace name verbatim", () => {
    render(<TalentRegisterModal locale="es" tenant={tenant} onClose={noop} />);
    expect(screen.getByText("Únete al roster")).toBeInTheDocument();
    // The workspace's own name is a proper noun — never translated.
    expect(screen.getByText("Impronta Models.")).toBeInTheDocument();
    expect(
      screen.getByText(/Crea tu perfil de talento gratis en Tulala/),
    ).toBeInTheDocument();
  });
});
