/**
 * W3-AI1 — unit tests for the "Describe your page" AI front-door helpers.
 *
 * Runs via `npx tsx --test` (Node test runner). Pure functions, no DOM: the
 * label derivation, the idle/generating/preview/error state machine, and the
 * deep-link contract (`?ai=1` open signal + the create href) that ties the hub
 * "Describe with AI" entry to the on-page generate → preview → insert flow.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import {
  deriveSectionLabels,
  computeAiFrontDoorPhase,
  shouldOpenAiFrontDoor,
  aiCreatePageHref,
} from "./empty-canvas-ai-front-door";

// A minimal tree stand-in — the helpers only read `kind` + `props.label`.
function tree(
  nodes: Array<{ kind: string; label?: string }>,
): BuilderNodeTree {
  return nodes.map((n, i) => ({
    id: `n${i}`,
    kind: n.kind,
    props: n.label === undefined ? {} : { label: n.label },
  })) as unknown as BuilderNodeTree;
}

test("deriveSectionLabels prefers props.label, falls back to kind", () => {
  const labels = deriveSectionLabels(
    tree([
      { kind: "hero", label: "Hero" },
      { kind: "featured_talent" }, // no label → kind
      { kind: "cta", label: "Book now" },
    ]),
  );
  assert.deepEqual(labels, ["Hero", "featured_talent", "Book now"]);
});

test("deriveSectionLabels treats blank/whitespace labels as missing", () => {
  const labels = deriveSectionLabels(
    tree([
      { kind: "hero", label: "   " },
      { kind: "gallery", label: "" },
    ]),
  );
  assert.deepEqual(labels, ["hero", "gallery"]);
});

test("deriveSectionLabels trims surrounding whitespace on real labels", () => {
  assert.deepEqual(
    deriveSectionLabels(tree([{ kind: "hero", label: "  Welcome  " }])),
    ["Welcome"],
  );
});

test("deriveSectionLabels on an empty tree is an empty list", () => {
  assert.deepEqual(deriveSectionLabels(tree([])), []);
});

test("computeAiFrontDoorPhase: generating wins over everything", () => {
  assert.equal(
    computeAiFrontDoorPhase({ generating: true, hasPreview: true, error: "x" }),
    "generating",
  );
});

test("computeAiFrontDoorPhase: preview wins over a co-present error", () => {
  // A regenerate/apply error is shown inline within the preview, so the phase
  // stays "preview" while a draft exists.
  assert.equal(
    computeAiFrontDoorPhase({ generating: false, hasPreview: true, error: "apply failed" }),
    "preview",
  );
});

test("computeAiFrontDoorPhase: compose-level error with no preview", () => {
  assert.equal(
    computeAiFrontDoorPhase({ generating: false, hasPreview: false, error: "no provider" }),
    "error",
  );
});

test("computeAiFrontDoorPhase: idle otherwise", () => {
  assert.equal(
    computeAiFrontDoorPhase({ generating: false, hasPreview: false, error: null }),
    "idle",
  );
});

test("shouldOpenAiFrontDoor only for the explicit ?ai=1 signal", () => {
  const mk = (v: string | null) => ({ get: (k: string) => (k === "ai" ? v : null) });
  assert.equal(shouldOpenAiFrontDoor(mk("1")), true);
  assert.equal(shouldOpenAiFrontDoor(mk("0")), false);
  assert.equal(shouldOpenAiFrontDoor(mk("true")), false);
  assert.equal(shouldOpenAiFrontDoor(mk(null)), false);
  assert.equal(shouldOpenAiFrontDoor(null), false);
  assert.equal(shouldOpenAiFrontDoor(undefined), false);
});

test("shouldOpenAiFrontDoor reads a real URLSearchParams", () => {
  assert.equal(shouldOpenAiFrontDoor(new URLSearchParams("edit=1&ai=1")), true);
  assert.equal(shouldOpenAiFrontDoor(new URLSearchParams("edit=1")), false);
});

test("aiCreatePageHref primes edit + ai on the new page", () => {
  assert.equal(aiCreatePageHref("about"), "/about?edit=1&ai=1");
  assert.equal(aiCreatePageHref("  services  "), "/services?edit=1&ai=1");
});

test("aiCreatePageHref treats blank/empty slug as the homepage root", () => {
  assert.equal(aiCreatePageHref(""), "/?edit=1&ai=1");
  assert.equal(aiCreatePageHref("   "), "/?edit=1&ai=1");
  assert.equal(aiCreatePageHref(null), "/?edit=1&ai=1");
  assert.equal(aiCreatePageHref(undefined), "/?edit=1&ai=1");
});
