/**
 * shell-eject.test.ts — the `ejected` contract on the SHELL surface.
 *
 * `BuilderSectionNode.props.ejected` is documented as: "the curated React
 * component no longer renders for it, and the legacy derivation no longer
 * re-hydrates it." The homepage composer honors this
 * (`homepage-cms-sections.tsx`, `const sectionEjected = …props.ejected === true`).
 *
 * `PublishedShell.tsx` did NOT — neither on the legacy-slot path nor on the
 * freeform-landmark path. So eject was a silent no-op on the header/footer:
 * the one surface where replacing the curated bar with an authored tree is the
 * entire point. Authored children rendered BELOW the curated bar (two headers),
 * which made an all-freeform shell unreachable.
 *
 * These tests pin the source-level guard on both render paths. They are
 * deliberately source assertions rather than a React render: `PublishedShell`
 * is an async Server Component that reaches Supabase, the section registry and
 * `next/headers` on import, so rendering it in this lane would test the mocks
 * rather than the contract.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const SOURCE = readFileSync(
  path.join(process.cwd(), "src/components/site-shell/PublishedShell.tsx"),
  "utf8",
);

test("the legacy-slot path resolves the landmark's ejected flag", () => {
  assert.match(
    SOURCE,
    /const sectionEjected = builderSectionNode\?\.props\.ejected === true;/,
    "renderShellSlot must read `ejected` off the matching builder section node",
  );
});

test("the legacy-slot path skips the curated component when ejected", () => {
  // The guard must wrap the <Comp> render, not merely exist somewhere.
  const slotCompIndex = SOURCE.indexOf("sectionId={slot.sectionId}");
  assert.ok(slotCompIndex > 0, "legacy-slot <Comp> render not found");
  const before = SOURCE.slice(Math.max(0, slotCompIndex - 400), slotCompIndex);
  assert.match(
    before,
    /sectionEjected \? null : \(/,
    "the legacy-slot <Comp> must be gated on `sectionEjected`",
  );
});

test("the freeform-landmark path skips the curated component when ejected", () => {
  // lastIndexOf: this token appears on BOTH paths; the freeform landmark is
  // the later one (renderFreeformShellLandmark is defined below renderShellSlot).
  const landmarkCompIndex = SOURCE.lastIndexOf("nodeIdsByRole: roleBindings,");
  assert.ok(landmarkCompIndex > 0, "freeform-landmark <Comp> render not found");
  const before = SOURCE.slice(
    Math.max(0, landmarkCompIndex - 900),
    landmarkCompIndex,
  );
  assert.match(
    before,
    /node\.props\.ejected === true \? null : \(/,
    "the freeform-landmark <Comp> must be gated on `node.props.ejected`",
  );
});

test("an ejected landmark still renders its freeform children", () => {
  // The children render must NOT be inside the eject guard — ejecting replaces
  // the curated bar with the authored tree; it does not blank the landmark.
  assert.match(
    SOURCE,
    /children\.length > 0 \? renderBuilderNodes\(children, renderOptions\) : null/,
    "freeform children must render independently of the eject guard",
  );
});

test("both shell render paths are covered (guard count)", () => {
  const guards = SOURCE.match(/ejected === true/g) ?? [];
  assert.ok(
    guards.length >= 2,
    `expected an eject guard on BOTH shell render paths, found ${guards.length}`,
  );
});
