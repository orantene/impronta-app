/**
 * GRK-037 — Hablar FAB fill never paints near-black on dark headers.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_ACCENT,
  LAUNCHER_ACCENT_MIN_LUMINANCE,
  launcherAccentFill,
} from "./mini-chat-styles";

describe("launcherAccentFill (GRK-037)", () => {
  test("near-black brand accents fall back to DEFAULT_ACCENT", () => {
    assert.equal(launcherAccentFill("#000000"), DEFAULT_ACCENT);
    assert.equal(launcherAccentFill("#0a0a0a"), DEFAULT_ACCENT);
    assert.equal(launcherAccentFill("#111"), DEFAULT_ACCENT);
    assert.equal(LAUNCHER_ACCENT_MIN_LUMINANCE, 0.18);
  });

  test("brand colours above the floor pass through lowercase", () => {
    assert.equal(launcherAccentFill("#0E7C66"), "#0e7c66");
    assert.equal(launcherAccentFill("#33507a"), "#33507a");
    assert.equal(launcherAccentFill(null), DEFAULT_ACCENT);
    assert.equal(launcherAccentFill("not-a-color"), DEFAULT_ACCENT);
  });
});
