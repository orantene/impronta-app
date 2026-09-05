import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTRAST_INK,
  CONTRAST_ON_DARK,
  contrastRatio,
  foregroundForPrimary,
  relativeLuminance,
} from "./contrast-pair";
import { designTokensToCssVars } from "./resolve";

/**
 * The defect: `.site-theme-tenant-override` re-pinned `--primary` and not
 * `--primary-foreground`, so a brandless tenant's button label was #0a0a0a on
 * the #111111 registry-default primary — about 1.05:1.
 *
 * These assert the RATIO, not the chosen hex. Pinning "primary #111111 gives
 * white" would pass just as happily if the rule inverted for mid-tones; the
 * thing that must hold is that whatever we pick is readable.
 */

const WCAG_AA_NORMAL = 4.5;

test("the exact reported failure is fixed, measured as a ratio", () => {
  // #111111 is the registry default for color.primary; #0a0a0a is what the
  // base class supplied as the foreground.
  const before = contrastRatio("#111111", "#0a0a0a");
  assert.ok(before !== null && before < 1.2, `before: ${before}`);

  const after = contrastRatio("#111111", foregroundForPrimary("#111111")!);
  assert.ok(
    after !== null && after >= 7,
    `the default primary must be comfortably readable, got ${after}`,
  );
});

test("every arm we pick clears AA on real brand colours", () => {
  // Includes El Paisa's red and a deliberately awkward mid-tone band, which is
  // where a fixed lightness threshold picks the losing arm.
  const primaries = [
    "#111111", // registry default
    "#e63946", // El Paisa
    "#ffffff",
    "#000000",
    "#c6a14e", // impronta gold
    "#7d5a3c",
    "#4a403a",
    "#808080", // the genuinely ambiguous midpoint
    "#767676",
    "#0F4F3E",
    "#e8d8c3",
  ];

  for (const primary of primaries) {
    const fg = foregroundForPrimary(primary);
    assert.ok(fg, `no foreground derived for ${primary}`);
    const ratio = contrastRatio(primary, fg)!;
    assert.ok(
      ratio >= WCAG_AA_NORMAL,
      `${primary} on ${fg} is only ${ratio.toFixed(2)}:1`,
    );
  }
});

test("we pick the arm that actually WINS, not a threshold guess", () => {
  // The whole reason this measures rather than thresholds. For each primary the
  // chosen foreground must be at least as good as the alternative.
  for (const primary of ["#808080", "#767676", "#7d5a3c", "#e8d8c3"]) {
    const chosen = foregroundForPrimary(primary)!;
    const other = chosen === CONTRAST_ON_DARK ? CONTRAST_INK : CONTRAST_ON_DARK;
    const chosenRatio = contrastRatio(primary, chosen)!;
    const otherRatio = contrastRatio(primary, other)!;
    assert.ok(
      chosenRatio >= otherRatio,
      `${primary}: chose ${chosen} (${chosenRatio.toFixed(2)}) over ${other} (${otherRatio.toFixed(2)})`,
    );
  }
});

test("an unmeasurable primary yields NO foreground, rather than a guess", () => {
  // Absence must stay structurally distinct from a value: an unknown primary
  // leaves the var unset so the existing cascade is untouched, instead of
  // stamping a colour over a design nobody asked us to change.
  for (const junk of [
    "currentColor",
    "var(--brand)",
    "linear-gradient(#fff,#000)",
    "",
    "#12",
    "rgb(1,2,3)",
  ]) {
    assert.equal(foregroundForPrimary(junk), null, `junk: ${junk}`);
    assert.equal(relativeLuminance(junk), null, `junk lum: ${junk}`);
  }
});

test("the projection emits the pair only when the primary is measurable", () => {
  const withPrimary = designTokensToCssVars({ "color.primary": "#e63946" });
  assert.equal(withPrimary["--token-color-primary"], "#e63946");
  assert.ok(
    withPrimary["--token-color-primary-on"],
    "a measurable primary must project its foreground",
  );

  const unmeasurable = designTokensToCssVars({ "color.primary": "currentColor" });
  assert.equal(
    "--token-color-primary-on" in unmeasurable,
    false,
    "an unmeasurable primary must leave the foreground var unset",
  );

  const none = designTokensToCssVars({});
  assert.equal("--token-color-primary-on" in none, false);
});

test("shorthand hex is handled — a tenant may well type #fff", () => {
  assert.equal(foregroundForPrimary("#fff"), CONTRAST_INK);
  assert.equal(foregroundForPrimary("#000"), CONTRAST_ON_DARK);
});
