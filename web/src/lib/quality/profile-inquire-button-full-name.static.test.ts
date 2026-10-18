/**
 * TUL-1024 / TUL-1075 (Batch 13, 15): the hero "Inquire about ..." button still
 * read the FIRST word of the name ('Consultar sobre QA-B1' for 'QA-B1 Limpieza
 * Test'). #3845 pinned the footer CTA only. The button label must use the full
 * display name (the button already ellipsizes, so a long name cannot overflow).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/talent-profile-inquire-button.tsx"), "utf8");

test("the hero inquire button label interpolates the full display name", () => {
  assert.match(src, /t\("public\.profileCta\.inquireAbout"\), \{ name: displayName \}/);
  assert.doesNotMatch(src, /t\("public\.profileCta\.inquireAbout"\), \{ name: firstName \}/);
});

test("the button keeps its ellipsis so a long full name cannot overflow", () => {
  assert.match(src, /textOverflow: "ellipsis"/);
});
