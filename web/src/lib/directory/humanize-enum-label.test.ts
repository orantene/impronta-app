import { describe, expect, it } from "vitest";
import { humanizeEnumLabel } from "./humanize-enum-label";

describe("humanizeEnumLabel", () => {
  it("converts underscores to spaces and title-cases", () => {
    expect(humanizeEnumLabel("dark_brown")).toBe("Dark Brown");
    expect(humanizeEnumLabel("light_blonde")).toBe("Light Blonde");
  });

  it("converts hyphens to spaces and title-cases", () => {
    expect(humanizeEnumLabel("full-time")).toBe("Full Time");
  });

  it("applies overrides for known special cases", () => {
    expect(humanizeEnumLabel("salt_and_pepper")).toBe("Salt & Pepper");
    expect(humanizeEnumLabel("blue_green")).toBe("Blue-Green");
    expect(humanizeEnumLabel("non_binary")).toBe("Non-Binary");
    expect(humanizeEnumLabel("semi_exclusive")).toBe("Semi-Exclusive");
    expect(humanizeEnumLabel("uk_based")).toBe("UK-Based");
  });

  it("is idempotent on already-humanized strings", () => {
    expect(humanizeEnumLabel("Dark Brown")).toBe("Dark Brown");
    expect(humanizeEnumLabel("Available")).toBe("Available");
  });

  it("handles empty strings gracefully", () => {
    expect(humanizeEnumLabel("")).toBe("");
    expect(humanizeEnumLabel("  ")).toBe("");
  });

  it("title-cases generic unknown slugs", () => {
    expect(humanizeEnumLabel("new_category")).toBe("New Category");
    expect(humanizeEnumLabel("some_random_value")).toBe("Some Random Value");
  });
});
