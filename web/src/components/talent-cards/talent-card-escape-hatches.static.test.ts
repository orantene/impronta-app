import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Escape-hatch guard (P3) — the canonical <TalentCard> grows OPTIONAL hooks so
 * the client-dashboard surfaces (Discover / Favorites / Shortlists) can adopt
 * it WITHOUT losing their interaction model:
 *   - rootMode "link" | "button" (+ onActivate)  → drawer-open vs navigate
 *   - availabilitySlot / secondaryActionSlot / badgeSlot → inject affordances
 *   - cssVars → inline per-tenant `--token-card-*` palette
 *
 * Two invariants this guards:
 *   1. The new props exist on the shape (so callers type-check), and default to
 *      the prior behavior (rootMode defaults to "link").
 *   2. The keystone is NOT regressed: the class + both data-card-style literals
 *      survive the polymorphic-root refactor (mirrors the keystone test, kept
 *      here too so a future edit to the root swap can't silently drop them).
 *
 * Source-text (not render) so it stays dependency-free in the tsx --test lane —
 * no next/image / jsdom runtime.
 */

const here = dirname(fileURLToPath(import.meta.url));
const cardSrc = readFileSync(join(here, "TalentCard.tsx"), "utf8");
const shapeSrc = readFileSync(join(here, "talent-card-shape.ts"), "utf8");

test("shape declares the escape-hatch props", () => {
  for (const prop of [
    "rootMode?: TalentCardRootMode",
    "onActivate?: () => void",
    "cssVars?: Record<string, string>",
    "availabilitySlot?: ReactNode",
    "secondaryActionSlot?: ReactNode",
    "badgeSlot?: ReactNode",
  ]) {
    assert.ok(
      shapeSrc.includes(prop),
      `TalentCardProps must declare \`${prop}\` so client shells type-check`,
    );
  }
});

test("rootMode union is exactly link | button", () => {
  assert.match(
    shapeSrc,
    /TalentCardRootMode\s*=\s*"link"\s*\|\s*"button"/,
    "rootMode must be the link|button union the shells switch on",
  );
});

test("rootMode defaults to 'link' (existing callers keep navigating)", () => {
  assert.match(
    cardSrc,
    /rootMode\s*=\s*"link"/,
    "TalentCard must default rootMode to 'link' so every existing caller is unchanged",
  );
});

test("button root carries role=button + keyboard activation", () => {
  // The polymorphic root must give the button mode real button semantics:
  // role, tabIndex, click + Enter/Space activation.
  assert.match(cardSrc, /role:\s*"button"/);
  assert.match(cardSrc, /onKeyDown/);
  assert.match(cardSrc, /e\.key === "Enter" \|\| e\.key === " "/);
});

test("all three slots are rendered with a fallback to the built-in", () => {
  // availabilitySlot overrides the built-in line on BOTH branches (?? fallback).
  const availOverrides = cardSrc.match(/availabilitySlot \?\?/g) ?? [];
  assert.ok(
    availOverrides.length >= 2,
    `availabilitySlot must override the built-in line on both render branches; found ${availOverrides.length}`,
  );
  assert.ok(cardSrc.includes("badgeSlot"), "badgeSlot must be rendered");
  assert.ok(
    cardSrc.includes("secondaryActionSlot"),
    "secondaryActionSlot must be rendered",
  );
});

test("KEYSTONE survives the refactor — class + both data-card-style literals", () => {
  const occurrences = cardSrc.match(/\$\{TALENT_CARD_CLASS\}/g) ?? [];
  assert.ok(
    occurrences.length >= 2,
    `keystone class must stay on both roots; found ${occurrences.length}`,
  );
  assert.match(cardSrc, /data-card-style="editorial"/);
  assert.match(cardSrc, /data-card-style="portrait"/);
});
