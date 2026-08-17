/**
 * The site-header selection special-case predicate.
 *
 * HISTORY — why these assertions look the way they do:
 *
 * WS-A A2 gated the special-case on `surfaceKind !== "site_shell"`, assuming
 * the sentinel id "is never produced" on the shell surface. Production
 * falsified that: a tenant whose `__site_shell__` page is still SLOT-composed
 * (empty `blocks`, header/footer attached via `cms_page_sections`) renders
 * through `PublishedShell` even when the shell SURFACE is active, and
 * `PublishedShell` emits the sentinel for the header slot. With the surface
 * gate, the selection fell through to the generic section loader → a
 * guaranteed "Section not found" → the header was uneditable on exactly the
 * surface built to edit it (found live on Impronta, 2026-08-17).
 *
 * The sentinel itself is now the whole gate. It is emitted in exactly one
 * place (PublishedShell's slot render); freeform landmark nodes carry node
 * UUIDs and a header `section_embed` carries the embedded row's REAL id, so
 * the sentinel can never collide with node-level editing on a freeform shell.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SITE_HEADER_SELECTION_ID,
  isLegacySiteHeaderSelection,
} from "./selection-id";

test("the synthetic header id triggers the special-case on every surface", () => {
  // Slot surfaces (the original parity set) AND the shell surface: the
  // sentinel only exists when PublishedShell slot-rendered the header, so it
  // must route to <SiteHeaderInspector> wherever it appears.
  for (const surfaceKind of [
    "homepage",
    "cms_page",
    "talent_page",
    "platform_lab",
    "site_shell",
  ]) {
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

test("a normal section/node id never triggers the special-case", () => {
  for (const surfaceKind of ["homepage", "site_shell"]) {
    assert.equal(
      isLegacySiteHeaderSelection({ selectedSectionId: "sec-abc-123", surfaceKind }),
      false,
      `real id must not special-case on ${surfaceKind}`,
    );
    assert.equal(
      isLegacySiteHeaderSelection({ selectedSectionId: null, surfaceKind }),
      false,
      `null selection must not special-case on ${surfaceKind}`,
    );
  }
  // A freeform shell's header landmark node (a node id, not the sentinel)
  // must stay on the normal node inspector — the A2 concern, still pinned.
  assert.equal(
    isLegacySiteHeaderSelection({
      selectedSectionId: "shell-header-node",
      surfaceKind: "site_shell",
    }),
    false,
  );
});
