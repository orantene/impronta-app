import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * TUL-1128 (guard for TUL-807): at 390px the sticky "Continuar" footer never
 * covers a form field. The footer is `sticky` (in flow, never fixed), and the
 * step reserves scroll margin on its focusable fields at least as tall as the
 * footer, so a focused input scrolls clear of it.
 */
const dir = join(process.cwd(), "src/components/onboarding/steps");
const read = (f: string) => readFileSync(join(dir, f), "utf8");

/** Tailwind spacing scale: n * 4px. */
const px = (n: number) => n * 4;

function stickyFooterClasses(src: string): string {
  const m = src.match(/className="(sticky bottom-0[^"]*)"/);
  assert.ok(m, "sticky footer found");
  return m[1];
}

function footerHeightPx(classes: string): number {
  const pt = Number(classes.match(/\bpt-(\d+)\b/)?.[1] ?? 0);
  const pb = Number(classes.match(/\bpb-(\d+)\b/)?.[1] ?? 0);
  return px(pt) + px(pb) + 48; // PrimaryButton is h-12
}

test("TUL-1128: PrimaryButton is the 48px (h-12) the footer maths assumes", () => {
  const ui = readFileSync(join(process.cwd(), "src/components/onboarding/ui.tsx"), "utf8");
  const btn = ui.slice(ui.indexOf("export function PrimaryButton"), ui.indexOf("export function SecondaryButton"));
  assert.match(btn, /\bh-12\b/);
});

test("TUL-1128: setup step reserves scroll margin >= the sticky footer height on every field", () => {
  const src = read("setup-step.tsx");
  const footer = footerHeightPx(stickyFooterClasses(src));
  assert.ok(footer > 48 && footer <= 96, `footer height ${footer}px`);
  for (const tag of ["button", "input", "select"]) {
    const m = src.match(new RegExp(`\\[&_${tag}\\]:scroll-mb-(\\d+)`));
    assert.ok(m, `${tag} has scroll-mb`);
    assert.ok(px(Number(m[1])) >= footer, `${tag} scroll-mb ${px(Number(m[1]))}px >= footer ${footer}px`);
  }
});

test("TUL-1128: the footers are sticky in flow, never fixed over the form", () => {
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
    assert.doesNotMatch(read(f), /className="[^"]*\bfixed\b[^"]*\bbottom-0\b/, `${f} has no fixed bottom bar`);
  }
});

test("TUL-1128: the step scroll area keeps bottom padding and safe-area inset", () => {
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/onboarding-module.tsx"), "utf8");
  const pads = src.match(/pb-\[max\(20px,env\(safe-area-inset-bottom\)\)\]/g) ?? [];
  assert.ok(pads.length >= 2, "page and sheet containers reserve bottom padding");
});
