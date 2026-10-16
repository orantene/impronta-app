/**
 * ⚠️ PATH-CRITICAL: must live under web/test/ — vitest collects test files
 * only from there, and jsdom only runs there.
 *
 * The language menu is the one control that must always offer a way OUT of the
 * current locale, so its rows are worth pinning: correct targets, correct
 * active marking, and a flag that decorates rather than replaces the name.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";

afterEach(cleanup);

/** `label-content-name-mismatch`: the accessible name must contain the visible text. */
function assert_contains(name: string, visible: string) {
  expect(name.toLowerCase()).toContain(visible);
}

import { MarketingLanguageMenu } from "@/components/marketing/marketing-language-menu";

function open(activeLocale: string, pathnameWithoutLocale = "/") {
  render(
    <MarketingLanguageMenu
      activeLocale={activeLocale}
      pathnameWithoutLocale={pathnameWithoutLocale}
      label="Language"
    />,
  );
  // The button's name starts with its visible text, the locale code (WCAG 2.5.3, TUL-1084).
  fireEvent.click(screen.getByRole("button", { name: `${activeLocale.toUpperCase()} Language` }));
  return screen.getByRole("menu");
}

describe("MarketingLanguageMenu", () => {
  test("closed by default, opens on click", () => {
    render(
      <MarketingLanguageMenu activeLocale="en" pathnameWithoutLocale="/" label="Language" />,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "EN Language" }));
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  test("the button's accessible name contains its visible locale code (WCAG 2.5.3)", () => {
    for (const code of ["en", "es"]) {
      cleanup();
      render(<MarketingLanguageMenu activeLocale={code} pathnameWithoutLocale="/" label="Language" />);
      const button = screen.getByRole("button", { name: new RegExp(code, "i") });
      const visible = (button.textContent ?? "").trim().toLowerCase();
      assert_contains(button.getAttribute("aria-label") ?? "", visible);
    }
  });

  test("each row shows a flag alongside the written language name", () => {
    const menu = open("en");
    const rows = within(menu).getAllByRole("menuitem");
    const byText = Object.fromEntries(rows.map((r) => [r.textContent ?? "", r]));

    // Flag is decoration; the written name must still be there. On Windows the
    // flag degrades to regional-indicator letters, so the name is what carries
    // the meaning.
    expect(Object.keys(byText).some((t) => t.includes("English"))).toBe(true);
    expect(Object.keys(byText).some((t) => t.includes("Español"))).toBe(true);
    expect(Object.keys(byText).some((t) => t.includes("🇺🇸"))).toBe(true);
    expect(Object.keys(byText).some((t) => t.includes("🇲🇽"))).toBe(true);
  });

  test("the flag is hidden from assistive tech", () => {
    const menu = open("en");
    const flags = menu.querySelectorAll('[aria-hidden="true"]');
    const flagText = [...flags].map((f) => f.textContent).join("");
    expect(flagText).toContain("🇺🇸");
    expect(flagText).toContain("🇲🇽");
  });

  test("marks the active locale and links the other one out", () => {
    const menu = open("es", "/pricing");
    const rows = within(menu).getAllByRole("menuitem");

    const spanish = rows.find((r) => r.textContent?.includes("Español"))!;
    const english = rows.find((r) => r.textContent?.includes("English"))!;

    expect(spanish.getAttribute("aria-current")).toBe("true");
    expect(english.getAttribute("aria-current")).toBeNull();

    // Default locale is unprefixed; the non-default one carries its prefix.
    expect(english.getAttribute("href")).toBe("/pricing");
    expect(spanish.getAttribute("href")).toBe("/es/pricing");
  });

  test("stays a plain anchor so the locale rewrite happens server-side", () => {
    const menu = open("en");
    for (const row of within(menu).getAllByRole("menuitem")) {
      expect(row.tagName).toBe("A");
    }
  });
});
