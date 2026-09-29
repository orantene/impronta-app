// LocaleField (PR 7, talent languages): the dashboard's translatable input.
// Pins the spec's load-bearing rules: one language = a plain input; the
// secondary tab never pre-fills the primary text (it is only a placeholder);
// dots report status; the AI button hands its result back as a draft edit.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { LocaleField } from "@/components/admin/shell/internal/primitives/locale-field";
import { resetAiTranslateSessionForTests } from "@/components/locale-field/use-ai-translate";
import type { LocalizedMap } from "@/lib/i18n/resolve-localized";
import { testRender } from "../../helpers/test-render";

vi.mock("@/components/locale-field/translate-action", () => ({
  translateTalentField: vi.fn(async ({ text }: { text: string }) => ({
    ok: true,
    text: `EN(${text})`,
    cached: false,
  })),
}));

function Harness({ initial, locales }: { initial: LocalizedMap; locales: string[] }) {
  const [value, setValue] = useState<LocalizedMap>(initial);
  return (
    <>
      <LocaleField
        label="Service name"
        value={value}
        locales={locales}
        primary="es"
        ai={{ field: "offering_title" }}
        onChange={(locale, next) => setValue((v) => ({ ...v, [locale]: next }))}
      />
      <output data-testid="json">{JSON.stringify(value)}</output>
    </>
  );
}

afterEach(() => {
  cleanup();
  resetAiTranslateSessionForTests();
});

describe("LocaleField", () => {
  it("renders a plain input with no tabs for a single language", () => {
    testRender(<Harness initial={{ es: "Corte" }} locales={["es"]} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: /with AI/i })).toBeNull();
    expect((screen.getByLabelText("Service name") as HTMLInputElement).value).toBe("Corte");
  });

  it("opens the secondary EMPTY with the primary as placeholder, and dots report status", () => {
    testRender(<Harness initial={{ es: "Corte" }} locales={["es", "en"]} />);
    const en = screen.getByRole("tab", { name: "English, missing" });
    expect(screen.getByRole("tab", { name: "Spanish, translated" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(en);
    const input = screen.getByLabelText("Service name") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Corte");
    fireEvent.change(input, { target: { value: "Haircut" } });
    expect(screen.getByRole("tab", { name: "English, translated" })).toBeTruthy();
    expect(screen.getByTestId("json").textContent).toBe(JSON.stringify({ es: "Corte", en: "Haircut" }));
  });

  it("arrow keys move between tabs (roving tabindex)", () => {
    testRender(<Harness initial={{ es: "Corte" }} locales={["es", "en"]} />);
    const es = screen.getByRole("tab", { name: /Spanish/ });
    expect(es.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(es, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /English/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("AI fills the secondary as a draft edit and announces it", async () => {
    testRender(<Harness initial={{ es: "Corte" }} locales={["es", "en"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Translate to English with AI" }));
    await waitFor(() =>
      expect(screen.getByTestId("json").textContent).toBe(JSON.stringify({ es: "Corte", en: "EN(Corte)" })),
    );
    expect(screen.getByText("Translated to English. Review it before saving.")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /English/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("marks a translation outdated after the primary changes", () => {
    testRender(<Harness initial={{ es: "Corte", en: "Cut" }} locales={["es", "en"]} />);
    const input = screen.getByLabelText("Service name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Corte largo" } });
    expect(screen.getByRole("tab", { name: "English, needs review" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Translate to English with AI" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
