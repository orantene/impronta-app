import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * TUL-39 live FAIL: locked Custom code (and email domain) showed only the
 * "Upgrade to unlock" pill + grey footer text — no button that opens the real
 * Stripe upgrade modal, and locked fields still looked editable.
 *
 * Guard: both entitlement-gated drawers must wire `useUpgradeModal().openUpgrade`
 * into a PrimaryButton footer when locked, and mute disabled field styles.
 */

const SRC = resolve(process.cwd(), "src/components/admin/integrations");

function read(name: string): string {
  return readFileSync(resolve(SRC, name), "utf8");
}

for (const file of ["CustomCodeDrawer.tsx", "EmailDomainDrawer.tsx"] as const) {
  test(`${file}: locked footer opens the real upgrade modal`, () => {
    const src = read(file);
    assert.match(
      src,
      /useUpgradeModal/,
      `${file} must use useUpgradeModal (not a dead muted span)`,
    );
    assert.match(
      src,
      /openUpgrade\s*\(/,
      `${file} must call openUpgrade from the locked footer CTA`,
    );
    assert.match(
      src,
      /PrimaryButton/,
      `${file} locked footer must be a PrimaryButton, not plain text`,
    );
    assert.doesNotMatch(
      src,
      /locked \? \(\s*<span/,
      `${file} must not keep the locked footer as a muted <span>`,
    );
  });

  test(`${file}: locked fields look disabled`, () => {
    const src = read(file);
    assert.match(src, /not-allowed/, `${file} locked inputs need cursor: not-allowed`);
    assert.match(
      src,
      /COLORS\.inkDim/,
      `${file} locked inputs must use muted ink, not full COLORS.ink`,
    );
  });
}
