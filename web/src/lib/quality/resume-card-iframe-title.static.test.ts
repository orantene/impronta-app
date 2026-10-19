import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SRC = readFileSync(join(process.cwd(), "src/components/talent/website-reward/MaisonWebsiteResumeCard.tsx"), "utf8");

describe("Today resume card thumbnail iframe has an accessible title (a11y P3)", () => {
  it("is titled in ES and EN, never empty", () => {
    assert.doesNotMatch(SRC, /<iframe\s+title=""/);
    assert.match(SRC, /title=\{locale === "es" \? "Vista previa del sitio" : "Website preview"\}/);
  });
});
