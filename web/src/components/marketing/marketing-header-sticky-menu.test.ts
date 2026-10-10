/**
 * live4-02 / TUL-536 — sticky pin for desktop marketing nav menus.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src/components/marketing");

test("sticky menu helper exists and documents live4-02 pin", () => {
  const src = readFileSync(join(ROOT, "marketing-header-sticky-menu.ts"), "utf8");
  assert.match(src, /useStickyDesktopMenu/);
  assert.match(src, /sticky/);
  assert.match(src, /live4-02/);
});

test("DesktopMenu and DesktopMegaMenu wire sticky leave + click", () => {
  const header = readFileSync(join(ROOT, "header.tsx"), "utf8");
  const mega = readFileSync(join(ROOT, "marketing-header-mega.tsx"), "utf8");
  assert.match(header, /useStickyDesktopMenu/);
  assert.match(mega, /useStickyDesktopMenu/);
  // Must not leave-close while pinned (raw onMouseLeave={onClose} on the
  // desktop dropdown wrappers).
  assert.doesNotMatch(
    header,
    /function DesktopMenu[\s\S]*?onMouseLeave=\{onClose\}/,
  );
  assert.doesNotMatch(
    mega,
    /export function DesktopMegaMenu[\s\S]*?onMouseLeave=\{onClose\}/,
  );
});
