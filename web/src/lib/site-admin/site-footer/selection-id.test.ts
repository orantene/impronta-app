/**
 * selection-id.test.ts — the routing predicate for the footer inspector.
 *
 * The risk mirrors the header's: a special-case that fires on the freeform
 * `site_shell` SURFACE would swallow the footer landmark's node-level editing
 * (the paid, zone-level experience) behind a form. And a special-case that
 * fails to fire on the legacy path leaves the footer on the auto-bound
 * ZodSchemaForm, which is exactly the parity gap this lane closes.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  SITE_FOOTER_SECTION_TYPE_KEY,
  isSiteFooterSectionSelection,
} from "./selection-id";

test("[S1] the footer section routes to the inspector on every legacy surface", () => {
  for (const surfaceKind of ["homepage", "cms_page", "talent_page", "platform_lab"]) {
    assert.equal(
      isSiteFooterSectionSelection({
        loadedSectionTypeKey: SITE_FOOTER_SECTION_TYPE_KEY,
        surfaceKind,
      }),
      true,
      `footer should route to the inspector on ${surfaceKind}`,
    );
  }
});

test("[S2] the special-case goes INERT on the freeform site_shell surface", () => {
  // On the shell surface the landmark is a plain freeform node; it must stay
  // selectable and route through the normal node/section inspector so an
  // operator can edit its children.
  assert.equal(
    isSiteFooterSectionSelection({
      loadedSectionTypeKey: SITE_FOOTER_SECTION_TYPE_KEY,
      surfaceKind: "site_shell",
    }),
    false,
  );
});

test("[S3] no other section type is captured", () => {
  for (const key of ["site_header", "hero", "cta_banner", "gallery_strip"]) {
    assert.equal(
      isSiteFooterSectionSelection({
        loadedSectionTypeKey: key,
        surfaceKind: "homepage",
      }),
      false,
      `${key} must not route to the footer inspector`,
    );
  }
});

test("[S4] a null / undefined loaded section never routes", () => {
  // The dock loads asynchronously; while `loadedSection` is null the dock must
  // fall through to its skeleton, not flash an empty footer drawer.
  assert.equal(
    isSiteFooterSectionSelection({
      loadedSectionTypeKey: null,
      surfaceKind: "homepage",
    }),
    false,
  );
  assert.equal(
    isSiteFooterSectionSelection({
      loadedSectionTypeKey: undefined,
      surfaceKind: "homepage",
    }),
    false,
  );
});
