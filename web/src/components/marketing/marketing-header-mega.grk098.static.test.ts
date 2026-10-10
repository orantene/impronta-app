/**
 * GRK-098 — closed mega-menu must not enter the keyboard tab order.
 *
 * The regression was `onFocus={onOpen}` on the Platform trigger: Tab focused
 * the button, the panel opened, and the next ~26 Tabs walked feature links
 * instead of reaching the hero CTA on tulala.digital.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const megaSrc = readFileSync(
  join(import.meta.dirname, "marketing-header-mega.tsx"),
  "utf8",
);
const headerSrc = readFileSync(
  join(import.meta.dirname, "header.tsx"),
  "utf8",
);

test("GRK-098: DesktopMegaMenu does not open on focus", () => {
  assert.equal(
    /onFocus=\{onOpen\}/.test(megaSrc),
    false,
    "DesktopMegaMenu must not call onOpen from onFocus (keeps panel out of tab order when closed)",
  );
  assert.match(
    megaSrc,
    /ArrowDown/,
    "keyboard users still get a way to open the panel (ArrowDown)",
  );
});

test("GRK-098: DesktopMenu dropdown matches the same focus contract", () => {
  assert.equal(
    /onFocus=\{onOpen\}/.test(headerSrc),
    false,
    "DesktopMenu must not call onOpen from onFocus either",
  );
});
