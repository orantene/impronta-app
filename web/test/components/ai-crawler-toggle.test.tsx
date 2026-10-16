// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiCrawlerToggle, type AiCrawlerToggleSave } from "@/components/posts/AiCrawlerToggle";

afterEach(cleanup);

describe("AiCrawlerToggle", () => {
  it("is ON by default and labelled per locale", () => {
    render(<AiCrawlerToggle locale="es" onSave={vi.fn<AiCrawlerToggleSave>()} />);
    const sw = screen.getByRole("switch", { name: "IA puede leer mi sitio" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("flips optimistically and keeps the saved value", async () => {
    let resolve: (v: { ok: true; allowed: boolean }) => void = () => {};
    const onSave = vi.fn<AiCrawlerToggleSave>(() => new Promise((r) => { resolve = r; }));
    render(<AiCrawlerToggle locale="en" onSave={onSave} />);
    const sw = screen.getByRole("switch", { name: "AI can read my site" });
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(onSave).toHaveBeenCalledWith(false);
    resolve({ ok: true, allowed: false });
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(false));
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });

  it("rolls back and shows an inline error on failure", async () => {
    const onSave = vi.fn<AiCrawlerToggleSave>(async () => ({ ok: false, message: "nope" }));
    render(<AiCrawlerToggle locale="en" onSave={onSave} />);
    const sw = screen.getByRole("switch");
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("nope"));
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("rolls back when the action throws", async () => {
    const onSave = vi.fn<AiCrawlerToggleSave>(async () => { throw new Error("x"); });
    render(<AiCrawlerToggle locale="es" onSave={onSave} />);
    const sw = screen.getByRole("switch");
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("No se pudo guardar"));
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });
});
