/**
 * shell-inspector-writes-node.test.ts
 *
 * THE PROPERTY: after a shell inspector save, the store the RENDERER reads
 * reflects the operator's new value — whichever store that happens to be.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `resolveShellLandmarkSectionProps` (shipped, live) makes a landmark node's
 * inline `props.sectionProps` beat the `cms_page_sections` slot on both render
 * paths. The SiteHeaderInspector and SiteFooterInspector autosave to
 * `cms_sections.props_jsonb` — the slot side. So the moment Phase 8B seeds
 * inline props, every inspector save is written, acknowledged, and INVISIBLE:
 * the operator changes the header variant on a live agency's site, sees a
 * success state, and the page never changes.
 *
 * Each test below drives the save and then asks the REAL renderer precedence
 * function what the live site would show. That is deliberate — asserting "the
 * mirror wrote the node" would pass even if the renderer read somewhere else.
 * Every assertion here is about what a visitor sees.
 *
 * WHAT THIS CANNOT COVER, AND WHAT COVERS IT INSTEAD
 * --------------------------------------------------
 * `site-header/actions.ts` and `site-footer/actions.ts` are `"use server"`
 * modules the node test runner cannot import at all (the constraint recorded in
 * `reference_server_only_import_breaks_test_lanes`). So this file proves the
 * MECHANISM against a fake Supabase, and the static guards at the bottom prove
 * the two actions are actually wired to it, in the right order.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  applyShellLandmarkSectionProps,
  readShellLandmarkInlineSectionProps,
  resolveShellLandmarkSectionProps,
  type ShellSideKey,
} from "@/lib/site-admin/builder-node/shell-render-plan";
import {
  mirrorShellLandmarkSectionProps,
  readShellLandmarkOwnedProps,
} from "@/lib/site-admin/edit-mode/shell-landmark-props-persist";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

const TENANT = "tenant-1";
const SHELL_PAGE = "shell-page-1";

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A shell landmark node. `sectionProps: undefined` means SLOT-OWNED. */
function landmark(
  side: ShellSideKey,
  sectionProps: Record<string, unknown> | undefined,
  children: BuilderNode[] = [],
): BuilderNode {
  const props: Record<string, unknown> = {
    sectionTypeKey: side === "header" ? "site_header" : "site_footer",
    slotKey: side,
    sortOrder: 0,
    sectionId: `sec-${side}`,
  };
  if (sectionProps !== undefined) props.sectionProps = sectionProps;
  return {
    id: `node-${side}`,
    kind: "section",
    props,
    children,
  } as unknown as BuilderNode;
}

/** A plain operator-added root (an announcement bar, say). */
function operatorRoot(id: string): BuilderNode {
  return { id, kind: "box", props: {}, children: [] } as unknown as BuilderNode;
}

/** The snapshot slot the legacy `cms_page_sections` anchor row produces. */
function slotFor(side: ShellSideKey, props: Record<string, unknown>) {
  return {
    slotKey: side,
    sortOrder: 0,
    sectionId: `sec-${side}`,
    sectionTypeKey: side === "header" ? "site_header" : "site_footer",
    props,
  };
}

// ── A fake Supabase holding both stores ─────────────────────────────────────

interface FakeDb {
  /** `cms_sections.props_jsonb`, keyed by side. */
  rows: Record<string, Record<string, unknown>>;
  /** `cms_pages.blocks` — the shell's freeform draft tree. */
  blocks: BuilderNodeTree | null;
  updates: number;
  failUpdate?: boolean;
}

/**
 * The narrow slice of the Supabase client surface the persist module touches:
 * `.from("cms_pages").select("blocks").eq().eq().maybeSingle()` for the read,
 * and `.from("cms_pages").update({blocks}).eq().eq()` for the write.
 */
function fakeSupabase(db: FakeDb) {
  return {
    from(table: string) {
      assert.equal(table, "cms_pages", "persist module read an unexpected table");
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        async maybeSingle() {
          return { data: db.blocks === null ? null : { blocks: db.blocks } };
        },
        update(patch: { blocks: BuilderNodeTree }) {
          db.updates += 1;
          if (!db.failUpdate) db.blocks = patch.blocks;
          const done = {
            eq() {
              return done;
            },
            then(
              resolve: (v: { error: { message: string } | null }) => unknown,
            ) {
              return Promise.resolve(
                db.failUpdate ? { error: { message: "boom" } } : { error: null },
              ).then(resolve);
            },
          };
          return done;
        },
      };
      return chain;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double
  } as any;
}

/**
 * One inspector autosave, in the order the real actions perform it: write the
 * `cms_sections` row (what `saveSectionDraftAction` does), then mirror onto the
 * landmark node. `mirror: false` reproduces the code on `main`.
 */
async function inspectorSave(
  db: FakeDb,
  side: ShellSideKey,
  nextProps: Record<string, unknown>,
  opts: { mirror: boolean } = { mirror: true },
) {
  db.rows[side] = nextProps;
  if (!opts.mirror) return { ok: true as const, mirrored: false };
  return mirrorShellLandmarkSectionProps(fakeSupabase(db), {
    tenantId: TENANT,
    shellPageId: SHELL_PAGE,
    side,
    nextProps,
  });
}

/** What the LIVE SITE would render for this side, per the shipped resolver. */
function whatTheSiteShows(db: FakeDb, side: ShellSideKey) {
  const node = (db.blocks ?? []).find(
    (n) =>
      (n as { props?: { sectionTypeKey?: string } }).props?.sectionTypeKey ===
      (side === "header" ? "site_header" : "site_footer"),
  );
  return resolveShellLandmarkSectionProps(
    node ?? null,
    slotFor(side, db.rows[side] ?? {}),
  );
}

// ── The regression this change exists to prevent ────────────────────────────

test("[N1] a node-owned header: the inspector's edit reaches the live site", async () => {
  // A Phase 8B shell — the landmark carries its config inline.
  const db: FakeDb = {
    rows: { header: { variant: "standard" } },
    blocks: [landmark("header", { variant: "standard" })],
    updates: 0,
  };

  // Sanity: before the edit, site and inspector agree.
  assert.equal(whatTheSiteShows(db, "header").variant, "standard");

  const res = await inspectorSave(db, "header", { variant: "centered" });
  assert.deepEqual(res, { ok: true, mirrored: true });

  // THE ASSERTION. On `main` — row write only, no mirror — this is still
  // "standard": the operator saw "saved" and the site never changed.
  assert.equal(
    whatTheSiteShows(db, "header").variant,
    "centered",
    "The header inspector's save did not reach the renderer. The landmark node " +
      "owns its `sectionProps`, so `resolveShellLandmarkSectionProps` reads the " +
      "TREE; a write that only touches `cms_sections.props_jsonb` is invisible.",
  );
});

test("[N2] the same, for the footer inspector", async () => {
  const db: FakeDb = {
    rows: { footer: { columns: 3 } },
    blocks: [landmark("footer", { columns: 3 })],
    updates: 0,
  };
  await inspectorSave(db, "footer", { columns: 4 });
  assert.equal(
    whatTheSiteShows(db, "footer").columns,
    4,
    "The footer inspector carries the identical bug and needs the identical fix.",
  );
});

test("[N3] WITHOUT the mirror the save is silently invisible — the bug, pinned", async () => {
  const db: FakeDb = {
    rows: { header: { variant: "standard" } },
    blocks: [landmark("header", { variant: "standard" })],
    updates: 0,
  };
  // `mirror: false` is exactly what `main` does today.
  await inspectorSave(db, "header", { variant: "centered" }, { mirror: false });

  assert.equal(db.rows.header.variant, "centered", "the row WAS written");
  assert.equal(
    whatTheSiteShows(db, "header").variant,
    "standard",
    "This pins the failure mode: the row is written, the action returns ok, and " +
      "the live site still renders the old value. If this ever flips to " +
      "'centered', the renderer precedence changed and this whole module is " +
      "solving a problem that no longer exists.",
  );
});

// ── Ownership is followed, never created ────────────────────────────────────

test("[N4] a slot-owned landmark is left alone — no cms_pages write at all", async () => {
  // Every shell alive today: no inline `sectionProps` anywhere.
  const db: FakeDb = {
    rows: { header: { variant: "standard" } },
    blocks: [landmark("header", undefined)],
    updates: 0,
  };
  const before = db.blocks;

  const res = await inspectorSave(db, "header", { variant: "centered" });
  assert.deepEqual(res, { ok: true, mirrored: false });
  assert.equal(db.updates, 0, "a slot-owned shell must take ZERO cms_pages writes");
  assert.equal(db.blocks, before, "the tree must be the same object, untouched");

  // And the edit still reaches the site, via the slot.
  assert.equal(whatTheSiteShows(db, "header").variant, "centered");
});

test("[N5] the inspector never PROMOTES a landmark to node-owned", async () => {
  const db: FakeDb = {
    rows: { header: {} },
    blocks: [landmark("header", undefined)],
    updates: 0,
  };
  await inspectorSave(db, "header", { variant: "centered" });
  assert.equal(
    readShellLandmarkInlineSectionProps(db.blocks ?? [], "header"),
    null,
    "Ownership is opted into by authoring the field (Phase 8B's seed), never " +
      "acquired by passing through an inspector save. Promoting here would make " +
      "a tenant's migration state depend on which tab an operator clicked first.",
  );
});

// ── The half-migrated shell ─────────────────────────────────────────────────

test("[N6] a HALF-MIGRATED shell renders correctly on both sides", async () => {
  // Header seeded by 8B; footer not yet. This is the state the migration
  // actually passes through, and both sides must keep working throughout.
  const db: FakeDb = {
    rows: { header: { variant: "standard" }, footer: { columns: 3 } },
    blocks: [landmark("header", { variant: "standard" }), landmark("footer", undefined)],
    updates: 0,
  };

  await inspectorSave(db, "header", { variant: "centered" });
  await inspectorSave(db, "footer", { columns: 4 });

  assert.equal(
    whatTheSiteShows(db, "header").variant,
    "centered",
    "node-owned side must render from the TREE",
  );
  assert.equal(
    whatTheSiteShows(db, "footer").columns,
    4,
    "slot-owned side must still render from the ROW",
  );
  assert.equal(
    db.updates,
    1,
    "exactly one cms_pages write — the header. The footer save must not touch it.",
  );
  // The footer landmark is still slot-owned after both saves.
  assert.equal(readShellLandmarkInlineSectionProps(db.blocks ?? [], "footer"), null);
});

test("[N7] editing one side never disturbs the other side's landmark", async () => {
  const db: FakeDb = {
    rows: { header: { variant: "standard" }, footer: { columns: 3 } },
    blocks: [
      landmark("header", { variant: "standard" }),
      landmark("footer", { columns: 3 }),
    ],
    updates: 0,
  };
  await inspectorSave(db, "header", { variant: "centered" });
  assert.deepEqual(
    readShellLandmarkInlineSectionProps(db.blocks ?? [], "footer"),
    { columns: 3 },
    "a header save rewrote the FOOTER landmark's config",
  );
});

// ── Nothing else in the tree may move ───────────────────────────────────────

test("[N8] the landmark's freeform children and sibling roots survive the write", async () => {
  const child = operatorRoot("child-1");
  const sibling = operatorRoot("announcement-bar");
  const db: FakeDb = {
    rows: { header: { variant: "standard" } },
    blocks: [sibling, landmark("header", { variant: "standard" }, [child])],
    updates: 0,
  };

  await inspectorSave(db, "header", { variant: "centered" });

  const tree = db.blocks ?? [];
  assert.equal(tree.length, 2, "a root disappeared");
  assert.equal(tree[0], sibling, "the operator's sibling root must pass through");
  const header = tree[1] as BuilderNode & { children?: BuilderNode[] };
  assert.deepEqual(
    header.children,
    [child],
    "The landmark's operator-added freeform children are NOT part of " +
      "`sectionProps` and must survive an inspector save untouched — the " +
      "property `site-footer/freeform-children-untouched.static.test.ts` guards " +
      "at the source level.",
  );
  // Identity, not just equality: the child object itself is carried through.
  assert.equal(header.children?.[0], child);
  // The landmark's non-config props are preserved too.
  assert.equal(
    (header.props as { slotKey?: string }).slotKey,
    "header",
    "the landmark's identity props were dropped",
  );
});

// ── Failure must be loud ────────────────────────────────────────────────────

test("[N9] a failed tree write is reported, never swallowed", async () => {
  const db: FakeDb = {
    rows: { header: { variant: "standard" } },
    blocks: [landmark("header", { variant: "standard" })],
    updates: 0,
    failUpdate: true,
  };
  const res = await inspectorSave(db, "header", { variant: "centered" });
  assert.equal(
    res.ok,
    false,
    "A swallowed cms_pages error is the same silent failure wearing a different " +
      "hat: the row saved, the node did not, and the inspector says 'saved'.",
  );
});

test("[N10] a shell with no freeform tree is a clean no-op", async () => {
  const db: FakeDb = { rows: { header: {} }, blocks: null, updates: 0 };
  const res = await inspectorSave(db, "header", { variant: "centered" });
  assert.deepEqual(res, { ok: true, mirrored: false });
  assert.equal(db.updates, 0);
});

// ── The read half ───────────────────────────────────────────────────────────

test("[N11] the inspector DISPLAYS the node's props when the node owns them", async () => {
  // Drift the two stores apart — e.g. a shell template applied on the freeform
  // surface carried inline props the section row never saw.
  const db: FakeDb = {
    rows: { header: { variant: "stale-row-value" } },
    blocks: [landmark("header", { variant: "what-the-site-renders" })],
    updates: 0,
  };
  const owned = await readShellLandmarkOwnedProps(fakeSupabase(db), {
    tenantId: TENANT,
    shellPageId: SHELL_PAGE,
    side: "header",
  });
  assert.deepEqual(
    owned,
    { variant: "what-the-site-renders" },
    "An inspector that displays the ROW while the site renders the NODE shows " +
      "the operator a value that is not on their site, and then saves it back " +
      "over the node on the next autosave.",
  );
});

test("[N12] a slot-owned landmark reports null so the caller falls back to the row", async () => {
  const db: FakeDb = {
    rows: { header: { variant: "standard" } },
    blocks: [landmark("header", undefined)],
    updates: 0,
  };
  assert.equal(
    await readShellLandmarkOwnedProps(fakeSupabase(db), {
      tenantId: TENANT,
      shellPageId: SHELL_PAGE,
      side: "header",
    }),
    null,
  );
});

test("[N13] a non-object inline value is not treated as ownership", () => {
  // Matches `resolveShellLandmarkSectionProps`, which falls through to the slot
  // for a stray null/string rather than handing garbage to a bespoke component.
  for (const junk of [null, "nope", 42, ["a"]] as unknown[]) {
    const tree = [landmark("header", junk as Record<string, unknown>)];
    assert.equal(
      readShellLandmarkInlineSectionProps(tree, "header"),
      null,
      `inline value ${JSON.stringify(junk)} must not count as node ownership`,
    );
    const { changed } = applyShellLandmarkSectionProps(tree, "header", { a: 1 });
    assert.equal(changed, false, "and must not be written over");
  }
});

// ── Static guards: the actions are actually wired to the mechanism ──────────

function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const ACTION_FILES: ReadonlyArray<[ShellSideKey, string]> = [
  ["header", "src/lib/site-admin/site-header/actions.ts"],
  ["footer", "src/lib/site-admin/site-footer/actions.ts"],
];

for (const [side, rel] of ACTION_FILES) {
  const CODE = codeOnly(readFileSync(path.join(process.cwd(), rel), "utf8"));

  test(`[N14-${side}] the save mirrors onto the landmark node`, () => {
    // Match the CALL, not a mention: an `import { mirrorShellLandmarkSectionProps }`
    // left behind after the call was deleted must not satisfy this guard.
    assert.match(
      CODE,
      /await\s+mirrorShellLandmarkSectionProps\(/,
      `${rel} saves \`cms_sections.props_jsonb\` and nothing else. Once the ` +
        `${side} landmark carries inline \`sectionProps\`, that write no longer ` +
        `reaches the live site — see [N3].`,
    );
  });

  test(`[N15-${side}] the mirror runs BEFORE the snapshot re-bake`, () => {
    const mirrorAt = CODE.indexOf("mirrorShellLandmarkSectionProps(");
    const republishAt = CODE.indexOf("republishSiteShellSnapshot(");
    assert.ok(mirrorAt > 0 && republishAt > 0, "both calls must be present");
    assert.ok(
      mirrorAt < republishAt,
      "`republishSiteShellSnapshot` bakes `cms_pages.blocks` into the snapshot " +
        "the renderer reads. Mirroring AFTER it persists the node correctly and " +
        "still shows the operator nothing until some later unrelated publish.",
    );
  });

  test(`[N16-${side}] the mirror's failure is propagated, not ignored`, () => {
    assert.match(
      CODE,
      /const mirror = await mirrorShellLandmarkSectionProps\([\s\S]{0,400}?if \(!mirror\.ok\)/,
      "The mirror result must be checked. An unchecked call turns a failed tree " +
        "write into a success state on a save that changed nothing visible.",
    );
  });

  test(`[N17-${side}] the inspector reads node-first, matching the renderer`, () => {
    assert.match(
      CODE,
      /await\s+readShellLandmarkOwnedProps\(/,
      `${rel} must prefer the landmark's inline \`sectionProps\` when it owns ` +
        `them — the same precedence \`resolveShellLandmarkSectionProps\` applies ` +
        `on the render path. See [N11].`,
    );
  });
}
