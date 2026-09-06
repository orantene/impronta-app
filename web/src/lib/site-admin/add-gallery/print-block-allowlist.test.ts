import assert from "node:assert/strict";
import { test } from "node:test";

import { filterAddGalleryItems } from "./registry";
import { PRINT_BLOCK_KINDS } from "@/lib/site-admin/builder-core/config";

// Piece B slice 1c — the print palette. The print vocabulary spans two tabs:
// Blocks (title/caption/logo/background = heading/paragraph/image/container) and
// Data (the QR block is a connected node). The allow-list must offer ONLY those
// kinds on each, must still surface the QR block, and must drop web blocks the
// exporter cannot honour.

const PRINT_TABS = ["blocks", "data"] as const;

function printPalette() {
  return PRINT_TABS.flatMap((tab) =>
    filterAddGalleryItems({ tab, blockAllowList: PRINT_BLOCK_KINDS }),
  );
}

test("PRINT_BLOCK_KINDS is the ruled vocabulary (bg + QR + title + caption + logo)", () => {
  assert.deepEqual([...PRINT_BLOCK_KINDS].sort(), [
    "container",
    "heading",
    "image",
    "paragraph",
    "qr_code",
  ]);
});

test("the print palette offers only kinds in the vocabulary, across both tabs", () => {
  const items = printPalette();
  const allowed = new Set(PRINT_BLOCK_KINDS);
  assert.ok(items.length > 0, "expected some print blocks to survive the filter");
  for (const it of items) {
    assert.ok(
      it.nativeKind != null && allowed.has(it.nativeKind),
      `card ${it.id} has kind ${it.nativeKind ?? "(none)"} — not in the print vocabulary`,
    );
  }
});

test("the QR block survives the print filter, and web-only blocks do not", () => {
  const kinds = new Set(printPalette().map((it) => it.nativeKind));
  assert.ok(kinds.has("qr_code"), "QR block must be in the print palette");
  assert.ok(!kinds.has("session_picker"), "session_picker must not print");
  assert.ok(!kinds.has("button"), "button must not print");
  assert.ok(!kinds.has("social_feed"), "social_feed must not print");
});

test("no allow-list ⇒ the Blocks tab is unrestricted (web surfaces unchanged)", () => {
  const unrestricted = filterAddGalleryItems({ tab: "blocks" });
  const restricted = filterAddGalleryItems({
    tab: "blocks",
    blockAllowList: PRINT_BLOCK_KINDS,
  });
  assert.ok(
    unrestricted.length > restricted.length,
    "the print filter must remove at least some blocks",
  );
});
