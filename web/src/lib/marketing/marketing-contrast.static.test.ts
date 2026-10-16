import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";

/** TUL-518 / J3 (+ A1-3): marketing + auth muted text and free badge clear WCAG AA 4.5:1. */
describe("marketing contrast (TUL-518)", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const header = readFileSync(
    join(process.cwd(), "src/components/marketing/header.tsx"),
    "utf8",
  );
  const footer = readFileSync(
    join(process.cwd(), "src/components/marketing/footer.tsx"),
    "utf8",
  );
  const authFooter = readFileSync(
    join(process.cwd(), "src/app/(auth)/auth-shell-chrome.tsx"),
    "utf8",
  );

  function tlHex(name: string): string {
    const re = new RegExp(`--tl-${name}:\\s*(#[0-9a-fA-F]{6})`);
    const m = css.match(re);
    assert.ok(m, `missing --tl-${name} hex in globals.css`);
    return m![1]!.toLowerCase();
  }

  it("muted on bone clears AA 4.5:1", () => {
    const ratio = contrastRatio(tlHex("muted"), tlHex("bone"));
    assert.ok(ratio != null && ratio >= 4.5, `muted/bone ratio ${ratio}`);
  });

  it("muted on surface-deep clears AA 4.5:1 (footer column headings)", () => {
    const ratio = contrastRatio(tlHex("muted"), tlHex("surface-deep"));
    assert.ok(ratio != null && ratio >= 4.5, `muted/surface-deep ratio ${ratio}`);
  });

  it("sage on bone clears AA 4.5:1 (For hubs eyebrow)", () => {
    const ratio = contrastRatio(tlHex("sage"), tlHex("bone"));
    assert.ok(ratio != null && ratio >= 4.5, `sage/bone ratio ${ratio}`);
  });

  it("free/gratis badge uses ink on accent (not white)", () => {
    assert.match(header, /color:\s*["']?var\(--tl-ink\)/);
    assert.doesNotMatch(
      header,
      /background:\s*["']var\(--plt-accent\)["'][\s\S]{0,120}color:\s*["']#fff["']/,
    );
    const inkOnAccent = contrastRatio(tlHex("ink"), tlHex("accent"));
    assert.ok(inkOnAccent != null && inkOnAccent >= 4.5, `ink/accent ratio ${inkOnAccent}`);
  });

  it("footer column headings and auth tagline use muted (not muted-soft)", () => {
    assert.match(footer, /style=\{\{\s*color:\s*"var\(--plt-muted\)"\s*\}\}/);
    assert.doesNotMatch(
      footer,
      /plt-mono[\s\S]{0,120}--plt-muted-soft/,
    );
    // Auth tagline is the second muted paragraph (brandLine + tagline).
    assert.match(
      authFooter,
      /brand\.tagline[\s\S]{0,200}color:\s*"var\(--plt-muted\)"/,
    );
    assert.doesNotMatch(
      authFooter,
      /brand\.tagline[\s\S]{0,200}--plt-muted-soft/,
    );
  });

  it("E1-3176: warning token clears AA 4.5:1 on bone (Coming soon pills)", () => {
    const ratio = contrastRatio(tlHex("warning"), tlHex("bone"));
    assert.ok(ratio != null && ratio >= 4.5, `warning/bone ratio ${ratio}`);
  });

  it("E1-3176: /start Continue uses solid disabled colors (not opacity-40)", () => {
    const ui = readFileSync(join(process.cwd(), "src/components/onboarding/ui.tsx"), "utf8");
    const start = ui.indexOf("export function PrimaryButton");
    const end = ui.indexOf("export function SecondaryButton");
    assert.ok(start >= 0 && end > start, "PrimaryButton/SecondaryButton markers missing");
    const primary = ui.slice(start, end);
    assert.match(primary, /color-mix\(in srgb, var\(--tl-forest\) 35%, var\(--tl-bone\)\)/);
    assert.doesNotMatch(primary, /disabled:opacity-40/);
  });

  it("E1-3176: Agencies & hubs preview eyebrow uses solid on-inverse", () => {
    const network = readFileSync(
      join(process.cwd(), "src/components/marketing/network-section.tsx"),
      "utf8",
    );
    assert.match(network, /preview\.eyebrow[\s\S]{0,200}--plt-on-inverse/);
    assert.doesNotMatch(network, /rgba\(241,\s*237,\s*227,\s*0\.72\)/);
  });
});
