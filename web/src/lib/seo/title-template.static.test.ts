import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

/**
 * The root layout sets `title.template = "%s · Tulala"`, so every title a page
 * returns gets the brand appended. A page that also spells the brand into its
 * own title therefore ships it twice.
 *
 * That shipped. The live homepage read
 * `Tulala · Sell what you do, not what you ship · Tulala` — the brand printed
 * twice on the highest-authority page we own, inside the ~60 characters a
 * search result actually shows. Nothing caught it, because a doubled word is
 * valid HTML, renders fine, and breaks no test.
 *
 * Social cards are the deliberate exception: no template runs on them, so
 * openGraph and twitter titles SHOULD carry the brand.
 */

test("the root title template appends the brand exactly once", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(
    layout,
    /template:\s*`%s · \$\{PLATFORM_BRAND\.name\}`/,
    "The title template changed. If it no longer appends the brand, this guard " +
      "and the page titles that rely on it both need revisiting.",
  );
});

test("the marketing homepage title does not also contain the brand", () => {
  const page = readFileSync("src/app/page.tsx", "utf8");
  const marketing = page.slice(page.indexOf('ctx.kind === "marketing"'));
  const titleLine = marketing
    .split("\n")
    .find((l) => /^\s*const title =/.test(l));

  assert.ok(titleLine, "Could not find the marketing title assignment.");
  assert.ok(
    !titleLine!.includes("PLATFORM_BRAND.name"),
    `The marketing homepage title includes the brand, and the root template ` +
      `appends "${PLATFORM_BRAND.name}" as well, so it renders twice:\n  ${titleLine!.trim()}`,
  );
});
