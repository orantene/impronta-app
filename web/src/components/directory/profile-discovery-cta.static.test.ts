import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";

/**
 * TUL-1084: the hub profile's discovery CTA band ("Abrir tu lista", "Ver más
 * talento", "Contactar directamente") read `--impronta-muted`, which is the
 * dark-scope #a1a1aa on a light page: 2.0 to 2.6:1. It now reads `--plt-muted`.
 */
describe("profile discovery CTA contrast (TUL-1084)", () => {
  const root = process.cwd();
  const cta = readFileSync(join(root, "src/components/directory/profile-discovery-cta.tsx"), "utf8");
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

  function tl(name: string): string {
    const m = css.match(new RegExp(`--tl-${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(m, `missing --tl-${name} in globals.css`);
    return m![1]!.toLowerCase();
  }

  it("the muted CTA text uses the light profile tokens, not the dark-scope --impronta ones", () => {
    assert.doesNotMatch(cta, /text-\[var\(--impronta-(muted|foreground)\)\]/);
    assert.doesNotMatch(cta, /hover:text-\[var\(--impronta-foreground\)\]/);
    assert.equal((cta.match(/text-\[var\(--plt-muted\)\] hover:text-\[var\(--plt-ink\)\]/g) ?? []).length, 3);
  });

  it("--plt-muted (via --tl-muted) clears AA 4.5:1 on every surface the band sits on", () => {
    const ink = tl("muted");
    for (const surface of ["#ffffff", tl("surface"), tl("bone"), tl("surface-deep")]) {
      const ratio = contrastRatio(ink, surface);
      assert.ok(ratio != null && ratio >= 4.5, `muted ${ink} on ${surface}: ${ratio}`);
    }
  });

  it("the gold Save button keeps --impronta-gold / --impronta-gold-ink (light scope would be 4.4:1)", () => {
    assert.match(cta, /bg-\[var\(--impronta-gold\)\] text-\[var\(--impronta-gold-ink\)\]/);
  });
});
