/**
 * Chrome-preserving adapters around resolveNodeCapabilities.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *   npx tsx --test src/components/edit-chrome/selection-layer-node-caps.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveNodeCapabilities } from "@/lib/site-admin/builder-node/node-capabilities";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { resolveSectionUnlockGate } from "./section-unlock-gate";
import {
  capabilityContext,
  chromeInsertChildKinds,
  chromeSectionUnlockGate,
  isSectionShell,
  isStructuralOrSelfLocked,
} from "./selection-layer-node-caps";

const DESKTOP = capabilityContext({
  device: "desktop",
  advancedElementLibraryEnabled: true,
  canInsertRawHtmlElements: false,
  multiNodeSelectionActive: false,
});

function heading(locked?: boolean): BuilderNode {
  return {
    id: "n-heading",
    kind: "heading",
    locked,
    props: { text: "Hello", level: 2 },
  };
}

function container(locked?: boolean): BuilderNode {
  return {
    id: "n-container",
    kind: "container",
    locked,
    props: { layout: "stack" },
    children: [],
  };
}

function section(sectionTypeKey: string, ejected?: boolean): BuilderNode {
  return {
    id: "sec-1",
    kind: "section",
    props: { sectionTypeKey, ejected },
    children: [],
  };
}

function roleHeadline(): BuilderNode {
  return heading();
}

test("capabilityContext maps tablet/mobile through and everything else to desktop", () => {
  assert.equal(
    capabilityContext({
      device: "tablet",
      advancedElementLibraryEnabled: true,
      canInsertRawHtmlElements: false,
      multiNodeSelectionActive: false,
    }).device,
    "tablet",
  );
  assert.equal(
    capabilityContext({
      device: "mobile",
      advancedElementLibraryEnabled: true,
      canInsertRawHtmlElements: false,
      multiNodeSelectionActive: false,
    }).device,
    "mobile",
  );
  assert.equal(
    capabilityContext({
      device: "wide",
      advancedElementLibraryEnabled: true,
      canInsertRawHtmlElements: false,
      multiNodeSelectionActive: false,
    }).device,
    "desktop",
  );
});

test("isSectionShell matches kind === section", () => {
  assert.equal(isSectionShell(section("hero"), DESKTOP), true);
  assert.equal(isSectionShell(heading(), DESKTOP), false);
  assert.equal(isSectionShell(container(), DESKTOP), false);
});

test("isStructuralOrSelfLocked matches section OR role OR self-locked", () => {
  assert.equal(isStructuralOrSelfLocked(heading(), DESKTOP), false);
  assert.equal(isStructuralOrSelfLocked(heading(true), DESKTOP), true);
  assert.equal(isStructuralOrSelfLocked(section("hero"), DESKTOP), true);
  assert.equal(
    isStructuralOrSelfLocked(
      { ...roleHeadline(), id: "sec:heading:headline" },
      DESKTOP,
    ),
    true,
  );
});

test("chromeInsertChildKinds keeps chrome kinds for a locked container", () => {
  const unlocked = chromeInsertChildKinds(container(), DESKTOP);
  const locked = chromeInsertChildKinds(container(true), DESKTOP);
  const pinLocked = resolveNodeCapabilities(container(true), DESKTOP);
  assert.ok(unlocked.length > 0);
  assert.deepEqual(locked, unlocked);
  assert.deepEqual(pinLocked.insertChildKinds, []);
});

test("chromeSectionUnlockGate matches resolveSectionUnlockGate on section types", () => {
  for (const key of [
    "cta_banner",
    "hero",
    "marquee",
    "site_header",
    "blank_section",
    "anchor_nav",
  ]) {
    const caps = resolveNodeCapabilities(section(key), DESKTOP);
    assert.equal(
      chromeSectionUnlockGate(caps),
      resolveSectionUnlockGate(key),
      key,
    );
  }
});
