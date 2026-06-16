/**
 * WS-A A2 — the legacy site-header selection special-case predicate.
 *
 * The highest-risk A2 change is making `SITE_HEADER_SELECTION_ID` go inert on
 * the `site_shell` SURFACE so shell child nodes stay selectable, WITHOUT
 * changing the homepage/slot (flag-off) behavior. These tests pin both halves.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SITE_HEADER_SELECTION_ID,
  isLegacySiteHeaderSelection,
} from "./selection-id";

test("[A2] legacy path: synthetic header id triggers the special-case (parity)", () => {
  // homepage / slot surfaces (incl. flag-off) — byte-identical to the prior check.
  for (const surfaceKind of ["homepage", "cms_page", "talent_page", "platform_lab"]) {
    assert.equal(
      isLegacySiteHeaderSelection({
        selectedSectionId: SITE_HEADER_SELECTION_ID,
        surfaceKind,
      }),
      true,
      `synthetic header id should special-case on ${surfaceKind}`,
    );
  }
});

test("[A2] legacy path: a normal section id never triggers the special-case", () => {
  assert.equal(
    isLegacySiteHeaderSelection({
      selectedSectionId: "sec-abc-123",
      surfaceKind: "homepage",
    }),
    false,
  );
  assert.equal(
    isLegacySiteHeaderSelection({
      selectedSectionId: null,
      surfaceKind: "homepage",
    }),
    false,
  );
});

test("[A2] shell surface: the special-case goes INERT even for the synthetic id", () => {
  // On the fully-freeform shell surface header/footer are normal nodes — the
  // synthetic special-case must NOT fire, so they route through the normal
  // selectable inspector.
  assert.equal(
    isLegacySiteHeaderSelection({
      selectedSectionId: SITE_HEADER_SELECTION_ID,
      surfaceKind: "site_shell",
    }),
    false,
  );
  assert.equal(
    isLegacySiteHeaderSelection({
      selectedSectionId: "shell-header-node",
      surfaceKind: "site_shell",
    }),
    false,
  );
});
