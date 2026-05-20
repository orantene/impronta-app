// Smoke tests for the profile-shell-internal god-file (7263 LOC). Many
// of the exports are full drawers that need the AdminShellProvider +
// real fixtures + router; for a smoke gate we target the pure helpers
// and the small TruthChip primitive — those are what the rest of the
// god-file is built on, and they're the cheapest "did the build still
// produce a working module" probe.
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import {
  TruthChip,
  sourceLabel,
  visMeta,
} from "@/components/admin/shell/internal/drawers/profile-shell/profile-shell-internal";
import { testRender } from "../../../../../../helpers/test-render";
import type { ResolvedField } from "@/lib/server-actions/admin-taxonomy";

describe("profile-shell-internal.tsx smoke", () => {
  it("visMeta returns Public / Admin / Hidden palettes", () => {
    expect(visMeta("public").label).toBe("Public");
    expect(visMeta("admin").label).toBe("Admin-only");
    expect(visMeta("hidden").label).toBe("Hidden");
    // Every variant carries bg + fg colors (defensive — these are read
    // raw into inline styles downstream so a missing key is a render
    // failure, not a type failure).
    for (const v of ["public", "admin", "hidden"] as const) {
      expect(visMeta(v).bg).toBeTruthy();
      expect(visMeta(v).fg).toBeTruthy();
    }
  });

  it("sourceLabel describes tier + brought-in path", () => {
    // Minimal ResolvedField fixture — only the fields sourceLabel reads.
    const tierBase = {
      tier: "universal" as const,
      brought_in_by: { kind: "tier" as const },
    } as unknown as ResolvedField;
    expect(sourceLabel(tierBase)).toBe("Universal");

    const groupBase = {
      tier: "global" as const,
      brought_in_by: { kind: "group" as const, group_slug: "fit" },
      field_group_label: "Fit & Measurements",
    } as unknown as ResolvedField;
    expect(sourceLabel(groupBase)).toBe("Global · via Fit & Measurements group");

    const typeBase = {
      tier: "type" as const,
      brought_in_by: { kind: "type" as const },
    } as unknown as ResolvedField;
    expect(sourceLabel(typeBase)).toBe("Type-specific · via talent-type recommendation");
  });

  it("TruthChip renders its text with bg+fg colors and optional title", () => {
    testRender(
      <TruthChip text="PUBLIC" bg="#E8F5EE" fg="#1F5C42" title="visible to client" />,
    );
    const chip = screen.getByText("PUBLIC");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute("title", "visible to client");
    // Inline-style contract — downstream renders depend on the chip
    // honouring its bg/fg props verbatim.
    expect(chip).toHaveStyle({ background: "#E8F5EE", color: "#1F5C42" });
  });
});
