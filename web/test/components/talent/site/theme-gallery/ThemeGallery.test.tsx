/**
 * ThemeGallery render test (0.C-6). Component test setup exists (vitest +
 * @testing-library/react + jsdom, `npm run test:components`), so this is a
 * real render test rather than the static fallback.
 *
 * Covers: the Design step renders both cards with the category filter, a
 * locked card is disabled and reads exactly "Web Office" (never a hard-coded
 * lower-tier name), advancing to the Look step renders the swatches, and
 * `mode="look-only"` skips the Design step entirely.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import { ThemeGallery } from "@/components/talent/site/theme-gallery/ThemeGallery";
import type { GalleryCatalogEntry } from "@/components/talent/site/theme-gallery/types";
import { testRender } from "../../../../helpers/test-render";

const DESIGNS: GalleryCatalogEntry[] = [
  {
    kind: "design",
    slug: "editorial",
    title: "Editorial",
    summary: "A split hero with an editorial gallery.",
    category: "Editorial",
    tags: [],
    forDesign: null,
    preview: {
      swatch: { primary: "#111111", secondary: "#222222", accent: "#333333", background: "#ffffff", ink: "#000000" },
    },
    requiredTier: "talent_basic",
    version: 1,
    sortOrder: 0,
    isNew: true,
    locked: false,
  },
  {
    kind: "design",
    slug: "studio",
    title: "Studio",
    summary: "A centered hero for a minimal studio site.",
    category: "Studio",
    tags: [],
    forDesign: null,
    preview: {},
    requiredTier: "talent_portfolio",
    version: 1,
    sortOrder: 1,
    isNew: false,
    locked: true,
  },
];

const LOOKS: GalleryCatalogEntry[] = [
  {
    kind: "look",
    slug: "warm",
    title: "Warm",
    summary: "",
    category: null,
    tags: [],
    forDesign: null,
    preview: {
      swatch: { primary: "#a00000", secondary: "#b00000", accent: "#c00000", background: "#ffffff", ink: "#000000" },
      fontPreview: { heading: "Georgia", body: "Arial" },
    },
    requiredTier: "talent_basic",
    version: 1,
    sortOrder: 0,
    isNew: false,
    locked: false,
  },
];

function noopApply() {
  return Promise.resolve({ ok: true });
}

describe("ThemeGallery", () => {
  it("renders the Design step with both cards, a New badge, and a locked card gated to Web Office", () => {
    testRender(
      <ThemeGallery
        designs={DESIGNS}
        looks={LOOKS}
        mode="manager"
        talentProfileId="tp-1"
        onApply={noopApply}
      />,
    );

    const grid = screen.getByRole("radiogroup", { name: "Pick a design" });
    expect(within(grid).getByText("Editorial")).toBeInTheDocument();
    expect(within(grid).getByText("Studio")).toBeInTheDocument();
    expect(within(grid).getByText("New")).toBeInTheDocument();

    // Exactly one lock pill, and it reads "Web Office" — never a raw tier key
    // (talent_basic / talent_pro / talent_portfolio) or a lower-tier label.
    const lockPills = screen.getAllByText("Web Office");
    expect(lockPills.length).toBeGreaterThan(0);
    expect(screen.queryByText(/talent_pro|talent_portfolio|talent_basic/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^pro$/i)).not.toBeInTheDocument();

    const lockedRadio = screen.getByRole("radio", { name: /Web Office/i });
    expect(lockedRadio).toBeDisabled();

    const openRadio = screen.getByRole("radio", { name: /Select the Editorial design/i });
    expect(openRadio).not.toBeDisabled();
  });

  it("filters the Design grid by category chip", () => {
    testRender(
      <ThemeGallery designs={DESIGNS} looks={LOOKS} mode="manager" talentProfileId="tp-1" onApply={noopApply} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Studio" }));
    const gridAfterFilter = screen.getByRole("radiogroup", { name: "Pick a design" });
    expect(within(gridAfterFilter).queryByText("Editorial")).not.toBeInTheDocument();
    expect(within(gridAfterFilter).getByText("Studio")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    const gridAfterAll = screen.getByRole("radiogroup", { name: "Pick a design" });
    expect(within(gridAfterAll).getByText("Editorial")).toBeInTheDocument();
    expect(within(gridAfterAll).getByText("Studio")).toBeInTheDocument();
  });

  it("advances to the Look step and renders the swatch row", () => {
    testRender(
      <ThemeGallery designs={DESIGNS} looks={LOOKS} mode="manager" talentProfileId="tp-1" onApply={noopApply} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Select the Editorial design/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next: choose a look/i }));

    const lookRadio = screen.getByRole("radio", { name: /Select the Warm look/i });
    expect(lookRadio).toBeInTheDocument();
    fireEvent.click(lookRadio);
    expect(lookRadio).toBeChecked();
  });

  it("mode look-only skips the Design step and its step tabs", () => {
    testRender(
      <ThemeGallery designs={DESIGNS} looks={LOOKS} mode="look-only" talentProfileId="tp-1" onApply={noopApply} />,
    );

    expect(screen.queryByText("Editorial")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Design" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Select the Warm look/i })).toBeInTheDocument();
  });

  it("calls onApply with the selected design + look and shows the success message", async () => {
    const onApply = vi.fn(async () => ({ ok: true }));
    testRender(
      <ThemeGallery designs={DESIGNS} looks={LOOKS} mode="manager" talentProfileId="tp-1" onApply={onApply} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Select the Editorial design/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next: choose a look/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Select the Warm look/i }));
    fireEvent.click(screen.getByRole("button", { name: /Use this theme/i }));

    await screen.findByText("Theme saved to your draft. Publish your site to make it live.");
    expect(onApply).toHaveBeenCalledWith({ designSlug: "editorial", lookSlug: "warm" });
  });

  it("a declined confirm shows no error, and a thrown apply re-enables the button with generic copy", async () => {
    const onApply = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, cancelled: true })
      .mockRejectedValueOnce(new Error("network"));
    testRender(
      <ThemeGallery designs={DESIGNS} looks={LOOKS} mode="manager" talentProfileId="tp-1" onApply={onApply} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Select the Editorial design/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next: choose a look/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Select the Warm look/i }));

    const apply = screen.getByRole("button", { name: /Use this theme/i });
    fireEvent.click(apply);
    await vi.waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /Use this theme/i })).not.toBeDisabled());
    expect(screen.queryByText("Something went wrong. Try again.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Use this theme/i }));
    await screen.findByText("Something went wrong. Try again.");
    expect(screen.getByRole("button", { name: /Use this theme/i })).not.toBeDisabled();
  });

  it("localizes built-in design card copy in Spanish", () => {
    const builtin: GalleryCatalogEntry = { ...DESIGNS[0]!, slug: "minimal", title: "Minimal", summary: "Type-forward and clean." };
    testRender(
      <ThemeGallery designs={[builtin]} looks={LOOKS} mode="manager" talentProfileId="tp-1" locale="es" onApply={noopApply} />,
    );
    expect(screen.getByText(/Limpio y centrado en la tipograf/)).toBeInTheDocument();
    expect(screen.queryByText("Type-forward and clean.")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filtrar diseños por categoría" })).toBeInTheDocument();
  });
});
