/**
 * TUL-386 — marketing body muted + free/gratis badge must clear WCAG AA 4.5:1.
 *
 * Live QA measured ~40 body blocks at 4.44:1 (#6b7065 on --tl-bone) and the
 * header free badge at 2.46:1 (white on --tl-accent). One shared muted token
 * and ink-on-accent for the badge fix both.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";

const GLOBALS = "src/app/globals.css";
const HEADER = "src/components/marketing/header.tsx";

function readMutedHex(css: string): string {
  const m = css.match(/--tl-muted:\s*(#[0-9a-fA-F]{6})\s*;/);
  assert.ok(m, "--tl-muted hex missing from marketing palette");
  return m![1]!.toLowerCase();
}

function readBoneHex(css: string): string {
  const m = css.match(/--tl-bone:\s*(#[0-9a-fA-F]{6})\s*;/);
  assert.ok(m, "--tl-bone hex missing from marketing palette");
  return m![1]!.toLowerCase();
}

function readAccentHex(css: string): string {
  const m = css.match(/--tl-accent:\s*(#[0-9a-fA-F]{6})\s*;/);
  assert.ok(m, "--tl-accent hex missing from marketing palette");
  return m![1]!.toLowerCase();
}

function readInkHex(css: string): string {
  const m = css.match(/--tl-ink:\s*(#[0-9a-fA-F]{6})\s*;/);
  assert.ok(m, "--tl-ink hex missing from marketing palette");
  return m![1]!.toLowerCase();
}

test("marketing --tl-muted clears 4.5:1 on --tl-bone (body grey token)", () => {
  const css = readFileSync(GLOBALS, "utf8");
  const muted = readMutedHex(css);
  const bone = readBoneHex(css);
  const ratio = contrastRatio(muted, bone);
  assert.ok(ratio != null, "contrastRatio returned null");
  assert.ok(
    ratio! >= 4.5,
    `--tl-muted ${muted} on --tl-bone ${bone} is ${ratio!.toFixed(2)}:1 (need ≥4.5)`,
  );
});

test("header free/gratis badge uses ink on accent, not white", () => {
  const header = readFileSync(HEADER, "utf8");
  const inkOnAccent = [
    ...header.matchAll(
      /background:\s*"var\(--plt-accent\)"[\s\S]{0,240}color:\s*"var\(--plt-ink\)"[\s\S]{0,120}freeBadge/g,
    ),
  ];
  assert.equal(
    inkOnAccent.length,
    2,
    "desktop + mobile free badges must paint var(--plt-ink) on accent",
  );
  assert.doesNotMatch(
    header,
    /background:\s*"var\(--plt-accent\)"[\s\S]{0,80}color:\s*"#fff"/,
    "free badge must not use white on accent (2.46:1)",
  );

  const css = readFileSync(GLOBALS, "utf8");
  const accent = readAccentHex(css);
  const ink = readInkHex(css);
  const ratio = contrastRatio(ink, accent);
  assert.ok(ratio != null && ratio >= 4.5, `ink on accent ${ratio}`);
});
