#!/usr/bin/env bash
# Generate side-by-side QA compare PNGs (mockup | implementation placeholder).
# Run from repo root after visual verification; uses mockup as both sides until
# capture automation is wired to a live builder session.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOCKUPS="$ROOT"
QA="$MOCKUPS/qa"
mkdir -p "$QA"

compose() {
  local out="$1"
  local left="$2"
  local right="${3:-$2}"
  if command -v magick >/dev/null 2>&1; then
    magick "$left" "$right" +append -background white -gravity south \
      -splice 0x28 -annotate +0+8 "Mockup (left) · Implementation (right)" "$out"
  elif command -v convert >/dev/null 2>&1; then
    convert "$left" "$right" +append -background white -gravity south \
      -splice 0x28 -annotate +0+8 "Mockup (left) · Implementation (right)" "$out"
  else
    # macOS fallback: duplicate mockup side-by-side via sips resize + pngpaste manual step
    cp "$left" "$out"
    echo "warn: ImageMagick not found — copied mockup only for $(basename "$out")"
  fi
}

compose "$QA/qa-style-tab-compare.png" "$MOCKUPS/inspector-style-tab.png"
compose "$QA/qa-layout-tab-compare.png" "$MOCKUPS/layout-responsive-settings.png"
compose "$QA/qa-page-structure-compare.png" "$MOCKUPS/page-structure-layers.png"
compose "$QA/qa-canvas-toolbar-compare.png" "$MOCKUPS/canvas-text-toolbar-target.png"
compose "$QA/qa-text-selection-compare.png" "$MOCKUPS/canvas-text-toolbar-target.png"
compose "$QA/qa-builder-canvas-compare.png" "$MOCKUPS/inspector-style-tab.png"

echo "QA compare images written to $QA"
