import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  LockBadge,
  LockedFieldWrapper,
  LockedFieldsBanner,
  useLockedFields,
} from "./locked-fields";
import {
  isDataLockPath,
  isStyleLockPath,
  styleLockedPathsOf,
  dataLockedPathsOf,
  layoutLockedPathsOf,
} from "./inspector-lock-scopes";

// ── Per-tab scope filters ────────────────────────────────────────────────────
//
// INS-1 — the same locked node must surface its lock in the Style, Layout AND
// Data tab (today only Content shows it). A node locked across all three scopes
// is the cross-tab parity fixture: `style.textColor` (Style), `layout` +
// `gap` (Layout), `dataBinding` (Data). Each tab's scope filter must pick up its
// own dot-path so each panel renders a disabled/badged affordance, not just
// Content.

const ALL_TABS_LOCKED = [
  "style.textColor", // Style tab
  "layout", // Layout tab
  "gap", // Layout tab
  "dataBinding", // Data tab
] as const;

test("a locked dot-path is surfaced in Style, Layout AND Data (not just Content)", () => {
  // Style tab shows the style lock and ONLY the style lock.
  assert.deepEqual(styleLockedPathsOf(ALL_TABS_LOCKED), ["style.textColor"]);

  // Data tab shows the data lock and ONLY the data lock.
  assert.deepEqual(dataLockedPathsOf(ALL_TABS_LOCKED), ["dataBinding"]);

  // Layout tab shows the structural locks (everything that is not a data path),
  // so the locked layout props AND the responsive style scope are all surfaced.
  const layoutPaths = layoutLockedPathsOf(ALL_TABS_LOCKED);
  assert.ok(layoutPaths.includes("layout"));
  assert.ok(layoutPaths.includes("gap"));
  assert.ok(layoutPaths.includes("style.textColor"));
  assert.ok(!layoutPaths.includes("dataBinding"));

  // Cross-tab parity: every applicable tab surfaces at least one locked path for
  // the same node — the affordance is no longer Content-only.
  assert.ok(styleLockedPathsOf(ALL_TABS_LOCKED).length > 0, "Style surfaces a lock");
  assert.ok(layoutLockedPathsOf(ALL_TABS_LOCKED).length > 0, "Layout surfaces a lock");
  assert.ok(dataLockedPathsOf(ALL_TABS_LOCKED).length > 0, "Data surfaces a lock");
});

test("scope predicates classify the canonical dot-paths", () => {
  assert.ok(isStyleLockPath("style.textColor"));
  assert.ok(isStyleLockPath("style"));
  assert.ok(!isStyleLockPath("layout"));

  assert.ok(isDataLockPath("dataBinding"));
  assert.ok(isDataLockPath("fieldBindings.label"));
  assert.ok(isDataLockPath("visibilityCondition"));
  assert.ok(!isDataLockPath("style.textColor"));
});

test("scope filters drop malformed / empty lock entries", () => {
  const noisy = ["", "style.textColor", "  ", "dataBinding"] as unknown as string[];
  assert.deepEqual(styleLockedPathsOf(noisy), ["style.textColor"]);
  assert.deepEqual(dataLockedPathsOf(noisy), ["dataBinding"]);
  assert.deepEqual(styleLockedPathsOf(null), []);
  assert.deepEqual(dataLockedPathsOf(undefined), []);
});

// ── useLockedFields hook (pure shape) ────────────────────────────────────────

test("useLockedFields resolves isLocked + isLockedBranch + lockedPaths", () => {
  // The hook has no React state/effects, so calling it directly is a valid pure
  // resolution of its return shape.
  const api = useLockedFields({ lockedProps: ["style.textColor", "gap"] });
  assert.equal(api.hasAnyLock, true);
  assert.deepEqual([...api.lockedPaths], ["style.textColor", "gap"]);
  assert.ok(api.isLocked("style.textColor"));
  assert.ok(!api.isLocked("style.bg"));
  assert.ok(api.isLockedBranch("style"), "branch lock detects nested leaf");
  assert.ok(api.isLocked("gap"));

  const none = useLockedFields(null);
  assert.equal(none.hasAnyLock, false);
  assert.deepEqual([...none.lockedPaths], []);
});

// ── Rendered affordance (disabled + badged DOM) ──────────────────────────────

test("LockBadge renders the 🔒 lock glyph", () => {
  const html = renderToStaticMarkup(React.createElement(LockBadge));
  assert.ok(html.includes("🔒"), "badge shows the lock glyph");
  assert.ok(html.includes("Locked"), "badge shows the Locked label");
});

test("LockedFieldWrapper disables + badges children when locked", () => {
  const child = React.createElement("input", { "data-test-field": "" });
  const lockedHtml = renderToStaticMarkup(
    React.createElement(LockedFieldWrapper, { locked: true }, child),
  );
  // Disabled affordance: non-interactive wrapper + aria-disabled + the badge.
  assert.ok(lockedHtml.includes('aria-disabled="true"'), "marks the group disabled");
  assert.ok(lockedHtml.includes("pointer-events:none"), "blocks interaction");
  assert.ok(lockedHtml.includes("data-locked-field"), "tags the locked field");
  assert.ok(lockedHtml.includes("🔒"), "renders the lock badge");

  // Pass-through when unlocked: no wrapper chrome, child renders untouched.
  const openHtml = renderToStaticMarkup(
    React.createElement(LockedFieldWrapper, { locked: false }, child),
  );
  assert.ok(!openHtml.includes("aria-disabled"), "unlocked field is interactive");
  assert.ok(!openHtml.includes("🔒"), "unlocked field has no badge");
  assert.ok(openHtml.includes("data-test-field"), "child still rendered");
});

test("LockedFieldsBanner renders the locked paths + explanation, empty when none", () => {
  const html = renderToStaticMarkup(
    React.createElement(LockedFieldsBanner, {
      paths: ["style.textColor"],
      noun: "styles",
    }),
  );
  assert.ok(html.includes("🔒"), "banner shows lock glyph");
  assert.ok(html.includes("style.textColor"), "banner lists the locked path");
  assert.ok(html.includes("styles"), "banner uses the tab-scoped noun");
  assert.ok(html.includes("Locked by the platform admin"));

  const empty = renderToStaticMarkup(
    React.createElement(LockedFieldsBanner, { paths: [] }),
  );
  assert.equal(empty, "", "no banner when nothing is locked");
});
