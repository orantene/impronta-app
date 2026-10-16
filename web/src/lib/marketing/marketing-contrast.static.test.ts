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

  // ── TUL-1084: Lighthouse accessibility on the talent profile (/es/t/<code>, 390) ──

  const languageMenu = readFileSync(
    join(process.cwd(), "src/components/marketing/marketing-language-menu.tsx"),
    "utf8",
  );

  /** Blend `fg` at `alpha` over `bg` (both #rrggbb) into the colour the eye sees. */
  function blend(fg: string, bg: string, alpha: number): string {
    const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const mix = [0, 1, 2].map((i) => Math.round(alpha * ch(fg, i) + (1 - alpha) * ch(bg, i)));
    return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  it("--plt-muted-soft (profile + marketing tertiary text) clears AA on every light surface", () => {
    const m = css.match(/--plt-muted-soft:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(m, "--plt-muted-soft must be a literal hex (the --tl alias is 2.74:1 on bone)");
    const ink = m![1]!.toLowerCase();
    for (const surface of [tlHex("bone"), tlHex("surface"), tlHex("surface-deep"), "#ffffff"]) {
      const ratio = contrastRatio(ink, surface);
      assert.ok(ratio != null && ratio >= 4.5, `muted-soft ${ink} on ${surface}: ${ratio}`);
    }
  });

  it("the header logo descriptor (9px, translucent ink) clears AA on bone", () => {
    const m = header.match(/--plt-ink-strong\)",\s*opacity:\s*([0-9.]+)/);
    assert.ok(m, "descriptor opacity not found in header.tsx");
    const seen = blend(tlHex("ink-strong"), tlHex("bone"), Number(m![1]));
    const ratio = contrastRatio(seen, tlHex("bone"));
    assert.ok(ratio != null && ratio >= 4.5, `descriptor at opacity ${m![1]}: ${ratio}`);
  });

  it("label-in-name: the logo link and the language button names contain their visible text", () => {
    // Visible text of the logo lockup = wordmark + descriptor line.
    assert.match(header, /aria-label=\{`\$\{PLATFORM_BRAND\.name\} \$\{copy\.brand\.descriptor\}`\}/);
    // Visible text of the language button = the active locale code.
    assert.match(languageMenu, /aria-label=\{`\$\{activeLocale\.toUpperCase\(\)\} \$\{label\}`\}/);
  });

  it("footer column labels are not headings (they skipped a level), and name their lists", () => {
    assert.doesNotMatch(footer, /<h4\b/);
    assert.match(footer, /id=\{`mkt-footer-col-\$\{colIndex\}`\}/);
    assert.match(footer, /aria-labelledby=\{`mkt-footer-col-\$\{colIndex\}`\}/);
  });
});
