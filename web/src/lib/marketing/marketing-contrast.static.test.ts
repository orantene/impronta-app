import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";

/** TUL-386: marketing muted-on-bone and free/gratis badge must clear WCAG AA 4.5:1. */
describe("marketing contrast (TUL-386)", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const header = readFileSync(
    join(process.cwd(), "src/components/marketing/header.tsx"),
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

  it("free/gratis badge uses ink on accent (not white)", () => {
    assert.match(header, /color:\s*["']?var\(--tl-ink\)/);
    assert.doesNotMatch(
      header,
      /background:\s*["']var\(--plt-accent\)["'][\s\S]{0,80}color:\s*["']#fff["']/,
    );
    const inkOnAccent = contrastRatio(tlHex("ink"), tlHex("accent"));
    assert.ok(inkOnAccent != null && inkOnAccent >= 4.5, `ink/accent ratio ${inkOnAccent}`);
  });
});
