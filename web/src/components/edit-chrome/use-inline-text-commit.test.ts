import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import {
  runCommitBuilderNodeText,
  runCommitText,
  type InlineBuilderNodeTextTarget,
} from "./use-inline-text-commit";

// W1-L3 — pure commit semantics for the inline canvas editor. The APPLIED
// boolean these return gates the optimistic canvas repaint: true must mean
// "the draft really changed" (repaint), false must mean "nothing changed"
// (leave the canvas alone). Blur AND Escape both route through these.

type Banner = { kind: "error"; text: string };

function sectionDeps(tree: Record<string, unknown> | null) {
  const banners: Banner[] = [];
  const drafts: Array<Record<string, unknown> | null> = [];
  const dirties: boolean[] = [];
  return {
    deps: {
      draftPropsRef: { current: tree },
      setBanner: (b: Banner) => banners.push(b),
      setDraftProps: (d: Record<string, unknown> | null) => drafts.push(d),
      setDirty: (d: boolean) => dirties.push(d),
    },
    banners,
    drafts,
    dirties,
  };
}

test("commitText: applies a unique-match edit, marks dirty, returns true", () => {
  const { deps, banners, drafts, dirties } = sectionDeps({ title: "Old copy" });
  const applied = runCommitText(deps, "Old copy", "New copy");
  assert.equal(applied, true);
  assert.equal(banners.length, 0);
  assert.deepEqual(drafts, [{ title: "New copy" }]);
  assert.deepEqual(dirties, [true]);
});

test("commitText: unchanged text is a no-op (false, no draft write, no banner)", () => {
  const { deps, banners, drafts } = sectionDeps({ title: "Same" });
  assert.equal(runCommitText(deps, "Same", "Same"), false);
  assert.equal(drafts.length, 0);
  assert.equal(banners.length, 0);
});

test("commitText: not-found original fails loudly and returns false", () => {
  const { deps, banners, drafts } = sectionDeps({ title: "Something else" });
  assert.equal(runCommitText(deps, "Missing copy", "New"), false);
  assert.equal(drafts.length, 0);
  assert.equal(banners.length, 1);
  assert.match(banners[0].text, /Couldn't find this text/);
});

test("commitText: ambiguous original (2 occurrences) fails loudly and returns false", () => {
  const { deps, banners, drafts } = sectionDeps({ a: "Dup", b: "Dup" });
  assert.equal(runCommitText(deps, "Dup", "New"), false);
  assert.equal(drafts.length, 0);
  assert.equal(banners.length, 1);
  assert.match(banners[0].text, /more than once/);
});

test("commitText: no draft tree loaded yet returns false silently", () => {
  const { deps, banners } = sectionDeps(null);
  assert.equal(runCommitText(deps, "Old", "New"), false);
  assert.equal(banners.length, 0);
});

// ── builder-node path ────────────────────────────────────────────────────

function nodeDeps(input: {
  tree: BuilderNodeTree;
  patchOk?: boolean;
  patchError?: string;
  defaultLocale?: string;
}) {
  const banners: Banner[] = [];
  const reported: string[] = [];
  const patches: Array<{ nodeId: string; patch: Record<string, unknown> }> = [];
  return {
    deps: {
      builderTreeRef: { current: input.tree },
      defaultLocale: input.defaultLocale ?? "en",
      patchBuilderNodeProps: async (
        nodeId: string,
        patch: Record<string, unknown>,
      ) => {
        patches.push({ nodeId, patch });
        return input.patchOk === false
          ? { ok: false, error: input.patchError }
          : { ok: true };
      },
      reportMutationError: (m: string) => reported.push(m),
      setBanner: (b: Banner) => banners.push(b),
    },
    banners,
    reported,
    patches,
  };
}

const HEADING_TREE: BuilderNodeTree = [
  { id: "h1", kind: "heading", props: { text: "Old heading", level: 2 } },
];

const TARGET: InlineBuilderNodeTextTarget = {
  id: "h1",
  propKey: "text",
  locale: "en",
};

test("commitBuilderNodeText: default-locale edit patches the base prop and returns true", async () => {
  const { deps, patches, banners } = nodeDeps({ tree: HEADING_TREE });
  const applied = await runCommitBuilderNodeText(deps, TARGET, "Old heading", "New heading");
  assert.equal(applied, true);
  assert.equal(banners.length, 0);
  assert.deepEqual(patches, [{ nodeId: "h1", patch: { text: "New heading" } }]);
});

test("commitBuilderNodeText: unchanged text is a no-op (false, no patch)", async () => {
  const { deps, patches } = nodeDeps({ tree: HEADING_TREE });
  assert.equal(await runCommitBuilderNodeText(deps, TARGET, "Same", "Same"), false);
  assert.equal(patches.length, 0);
});

test("commitBuilderNodeText: empty text is rejected with a banner (false, no patch)", async () => {
  const { deps, patches, banners } = nodeDeps({ tree: HEADING_TREE });
  assert.equal(await runCommitBuilderNodeText(deps, TARGET, "Old heading", "   "), false);
  assert.equal(patches.length, 0);
  assert.equal(banners.length, 1);
  assert.match(banners[0].text, /cannot be saved empty/);
});

test("commitBuilderNodeText: failed save reports + banners and returns false", async () => {
  const { deps, banners, reported } = nodeDeps({
    tree: HEADING_TREE,
    patchOk: false,
    patchError: "Version conflict",
  });
  const applied = await runCommitBuilderNodeText(deps, TARGET, "Old heading", "New heading");
  assert.equal(applied, false);
  assert.deepEqual(reported, ["Version conflict"]);
  assert.equal(banners.length, 1);
  assert.equal(banners[0].text, "Version conflict");
});

test("commitBuilderNodeText: secondary-locale edit on a localizable prop writes the i18n overlay", async () => {
  const { deps, patches } = nodeDeps({ tree: HEADING_TREE, defaultLocale: "en" });
  const applied = await runCommitBuilderNodeText(
    deps,
    { ...TARGET, locale: "es" },
    "Old heading",
    "Nuevo título",
  );
  assert.equal(applied, true);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].nodeId, "h1");
  const i18n = patches[0].patch.i18n as Record<string, Record<string, unknown>>;
  assert.equal(i18n.es.text, "Nuevo título");
  // The base prop is untouched — the patch carries ONLY the overlay.
  assert.equal("text" in patches[0].patch, false);
});

test("commitBuilderNodeText: section_embed config edit patches config[key] with a plain string", async () => {
  const tree: BuilderNodeTree = [
    {
      id: "se1",
      kind: "section_embed",
      props: {
        sectionTypeKey: "hero",
        config: { eyebrow: "Old eyebrow", other: "kept" },
      },
    },
  ];
  const { deps, patches } = nodeDeps({ tree });
  const applied = await runCommitBuilderNodeText(
    deps,
    { id: "se1", propKey: "text", sectionEmbedConfigKey: "eyebrow", locale: "en" },
    "Old eyebrow",
    "New eyebrow",
  );
  assert.equal(applied, true);
  assert.deepEqual(patches, [
    { nodeId: "se1", patch: { config: { eyebrow: "New eyebrow", other: "kept" } } },
  ]);
});

test("commitBuilderNodeText: section_embed target that is not an embed fails loudly (false)", async () => {
  const { deps, patches, banners } = nodeDeps({ tree: HEADING_TREE });
  const applied = await runCommitBuilderNodeText(
    deps,
    { id: "h1", propKey: "text", sectionEmbedConfigKey: "eyebrow", locale: "en" },
    "Old",
    "New",
  );
  assert.equal(applied, false);
  assert.equal(patches.length, 0);
  assert.equal(banners.length, 1);
  assert.match(banners[0].text, /Couldn't find this Tulala component/);
});
