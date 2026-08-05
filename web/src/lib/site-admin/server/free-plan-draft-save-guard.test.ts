import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertFreePlanAllowsNestedBuilderMutation } from "@/lib/site-admin/builder-node/free-plan-builder-tree-guard";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import { loadResolvedBuilderTreeBaselineForPageVersion } from "./draft-revision-builder-tree";

/**
 * REGRESSION (2026-08-04) — the free-plan draft-save guard false-blocked the
 * FIRST edit after a publish.
 *
 * `enforceFreePlanNestedBuilderDraftGuard` compares the incoming tree against a
 * BASELINE of "what this page already has". That baseline was loaded with a
 * `kind = 'draft'` filter on `cms_page_revisions`. After a publish the
 * version-matched revision is `kind='published'` (homepage) or absent entirely
 * (cms pages), so the filter matched nothing, the baseline collapsed to the
 * caller's legacy-slot derivation, every nested node in a Free workspace's
 * seeded starter design counted as newly inserted, and an otherwise UNCHANGED
 * tree was rejected with an upgrade nag while the canvas visibly reverted.
 *
 * NOTE ON SCOPE: `isAdvancedElementLibraryEnabledForPlan` currently returns
 * true for every plan (pre-launch, no paywall), so
 * `enforceFreePlanNestedBuilderDraftGuard` short-circuits before it ever loads
 * a baseline — which is why a guard-level test would pass no matter what the
 * loader does. These tests therefore exercise the two pieces that actually
 * decide the outcome: the baseline loader, and the comparison the guard runs on
 * its result. They stay meaningful the moment the paywall is switched on.
 */

function sectionWithChildren(children: unknown[]): BuilderNodeTree {
  return [
    {
      id: "sec-a",
      kind: "section",
      props: {
        sectionTypeKey: "hero",
        // Must be a real UUID or validateBuilderNodeTree rejects the whole
        // tree and the resolver silently falls back to legacy slots.
        sectionId: "11111111-1111-4111-8111-111111111111",
        slotKey: "main",
        sortOrder: 0,
      },
      children,
    },
  ] as unknown as BuilderNodeTree;
}

/** A seeded starter design: one section wrapping nested (non-section) nodes. */
function starterTree(): BuilderNodeTree {
  return sectionWithChildren([
    { id: "sec-a:heading:headline", kind: "heading", props: { level: 1, text: "Hi" } },
    { id: "sec-a:paragraph:copy", kind: "paragraph", props: { text: "Welcome" } },
  ]);
}

function treeWithExtraNode(): BuilderNodeTree {
  return sectionWithChildren([
    { id: "sec-a:heading:headline", kind: "heading", props: { level: 1, text: "Hi" } },
    { id: "sec-a:paragraph:copy", kind: "paragraph", props: { text: "Welcome" } },
    // Library-inserted block — the thing the guard actually exists to stop.
    { id: "sec-a:paragraph:newly-inserted", kind: "paragraph", props: { text: "New" } },
  ]);
}

type RevisionFixture = {
  kind: "draft" | "published" | "rollback";
  version: number;
  builderTree: BuilderNodeTree;
};

/**
 * Mock `cms_page_revisions`. It applies the same version predicate the loader
 * uses (`eq` for the version-matched pass, `lte` for the fallback pass) and
 * records every column the loader filters on, so a re-introduced `kind` filter
 * is caught rather than silently ignored.
 */
function mockRevisions(revisions: RevisionFixture[]): {
  client: SupabaseClient;
  filteredColumns: string[];
} {
  const filteredColumns: string[] = [];

  function query() {
    let versionEq: number | null = null;
    let versionLte: number | null = null;
    const q = {
      select: () => q,
      eq: (col: string, value: unknown) => {
        filteredColumns.push(col);
        if (col === "version") versionEq = Number(value);
        return q;
      },
      lte: (col: string, value: unknown) => {
        filteredColumns.push(col);
        if (col === "version") versionLte = Number(value);
        return q;
      },
      order: () => q,
      limit: () => q,
      returns: () => {
        const matching = revisions
          .filter((r) =>
            versionEq !== null
              ? r.version === versionEq
              : versionLte !== null
                ? r.version <= versionLte
                : true,
          )
          .sort((a, b) => b.version - a.version);
        return Promise.resolve({
          data: matching.map((r) => ({ snapshot: { builderTree: r.builderTree } })),
        });
      },
    };
    return q;
  }

  return {
    client: { from: () => query() } as unknown as SupabaseClient,
    filteredColumns,
  };
}

function loadBaseline(client: SupabaseClient) {
  return loadResolvedBuilderTreeBaselineForPageVersion(client, "tenant-1", "page-1", 7);
}

function nestedIds(tree: BuilderNodeTree): string[] {
  const out: string[] = [];
  const walk = (nodes: unknown[], insideSection: boolean) => {
    for (const raw of nodes) {
      const node = raw as { id: string; kind: string; children?: unknown[] };
      if (node.kind !== "section" && insideSection) out.push(node.id);
      if (Array.isArray(node.children)) {
        walk(node.children, insideSection || node.kind === "section");
      }
    }
  };
  walk(tree as unknown as unknown[], false);
  return out;
}

test("baseline sanity: the fixture tree survives snapshot resolution", async () => {
  // If the resolver dropped these nodes every other assertion here would pass
  // vacuously, so pin it explicitly.
  const { client } = mockRevisions([
    { kind: "draft", version: 7, builderTree: starterTree() },
  ]);
  const baseline = await loadBaseline(client);
  assert.ok(baseline.length > 0, "resolved baseline is non-empty");
  assert.deepEqual(nestedIds(baseline).sort(), [
    "sec-a:heading:headline",
    "sec-a:paragraph:copy",
  ]);
});

test("post-publish homepage: a kind='published' revision at the current version IS the baseline", async () => {
  // Homepage publish writes the version-matched revision with kind='published'.
  // Under the old draft-only filter this returned [] and the unchanged tree
  // below was rejected.
  const { client, filteredColumns } = mockRevisions([
    { kind: "published", version: 7, builderTree: starterTree() },
  ]);

  const baseline = await loadBaseline(client);
  assert.ok(baseline.length > 0, "published revision produced a baseline");
  // The baseline query must not filter on revision kind at all.
  assert.equal(filteredColumns.includes("kind"), false);

  // The real symptom: an UNCHANGED tree now saves cleanly.
  assert.deepEqual(
    assertFreePlanAllowsNestedBuilderMutation(baseline, starterTree()),
    { ok: true },
  );
});

test("post-publish cms page: no revision at the current version falls back to the newest prior one", async () => {
  // The cms-page publish path leaves NO revision row at the matched version,
  // so the baseline has to come from the newest revision at or below it.
  const { client } = mockRevisions([
    { kind: "draft", version: 6, builderTree: starterTree() },
    { kind: "published", version: 5, builderTree: [] as BuilderNodeTree },
  ]);

  const baseline = await loadBaseline(client);
  assert.ok(baseline.length > 0, "prior revision produced a baseline");
  assert.deepEqual(
    assertFreePlanAllowsNestedBuilderMutation(baseline, starterTree()),
    { ok: true },
  );
});

test("rollback revisions also count as a baseline", async () => {
  const { client } = mockRevisions([
    { kind: "rollback", version: 7, builderTree: starterTree() },
  ]);

  const baseline = await loadBaseline(client);
  assert.deepEqual(
    assertFreePlanAllowsNestedBuilderMutation(baseline, starterTree()),
    { ok: true },
  );
});

test("an empty version-matched revision skips to one that has content", async () => {
  const { client } = mockRevisions([
    { kind: "draft", version: 7, builderTree: [] as BuilderNodeTree },
    { kind: "published", version: 7, builderTree: starterTree() },
  ]);

  const baseline = await loadBaseline(client);
  assert.ok(baseline.length > 0, "skipped the empty revision");
});

test("widening the baseline does NOT defeat the guard: a genuinely new nested node still blocks", async () => {
  const { client } = mockRevisions([
    { kind: "published", version: 7, builderTree: starterTree() },
  ]);

  const baseline = await loadBaseline(client);
  const result = assertFreePlanAllowsNestedBuilderMutation(baseline, treeWithExtraNode());
  assert.equal(result.ok, false, "library-inserted block is still rejected");
});

test("no revisions at all yields an empty baseline so the caller's legacy fallback applies", async () => {
  const { client } = mockRevisions([]);
  assert.deepEqual(await loadBaseline(client), []);
});

test("a revision from a FUTURE version is never used as a baseline", async () => {
  const { client } = mockRevisions([
    { kind: "draft", version: 9, builderTree: starterTree() },
  ]);
  assert.deepEqual(await loadBaseline(client), []);
});
