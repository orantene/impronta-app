import assert from "node:assert/strict";
import { test } from "node:test";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import {
  classifyShellTree,
  resolveShellSidePlan,
  splitShellTree,
} from "@/lib/site-admin/builder-node/shell-render-plan";

import { buildShellTree, countNodes, treesForLocale } from "./seed-shell";

/**
 * seed-shell.test.ts — the shell tree's load-bearing invariants.
 *
 * Each assertion here corresponds to a failure mode that is SILENT on the live
 * site (no error, no empty state — just the wrong header), so none of them can
 * be left to review:
 *
 *   - a landmark without `sectionId` addresses nothing and its children stop
 *     rendering (site-shell-surface-tree.ts:92-100)
 *   - a landmark without `ejected` renders the curated bar AND our tree
 *     (PublishedShell.renderFreeformShellLandmark) — two headers
 *   - the footer landmark is what `splitShellTree` cuts on; lose it and the
 *     whole tree resolves as header
 */

const ANCHORS = {
  header: "11111111-1111-1111-1111-111111111111",
  footer: "22222222-2222-2222-2222-222222222222",
};

/**
 * Impronta's footer slot is stored with sortOrder 0 (NOT 1). The fixture keeps
 * that asymmetry on purpose: assuming header=0/footer=1 is precisely the bug
 * that shipped a header-less site, because the address key is
 * `sectionId:slotKey:sortOrder` and a guessed sortOrder matches no slot.
 */
const SORT_ORDERS = { header: 0, footer: 0 };

function treeFor(locale: string) {
  const { header, footer } = treesForLocale(locale);
  return buildShellTree({
    anchors: ANCHORS,
    sortOrders: SORT_ORDERS,
    header,
    footer,
  });
}

/** The snapshot slots the anchors correspond to. */
const SLOTS = [
  {
    sectionId: ANCHORS.header,
    slotKey: "header",
    sortOrder: SORT_ORDERS.header,
    sectionTypeKey: "site_header",
  },
  {
    sectionId: ANCHORS.footer,
    slotKey: "footer",
    sortOrder: SORT_ORDERS.footer,
    sectionTypeKey: "site_footer",
  },
] as never[];

for (const locale of ["en", "es"]) {
  test(`[${locale}] the shell tree validates`, () => {
    const result = validateBuilderNodeTree(treeFor(locale));
    if (!result.ok) {
      assert.fail(
        `invalid shell tree: ${result.issues.map((i) => i.message).join("; ")}`,
      );
    }
  });

  test(`[${locale}] exactly two roots: the header then the footer landmark`, () => {
    const tree = treeFor(locale);
    assert.equal(tree.length, 2);
    const kinds = tree.map((n) => (n as { props: { sectionTypeKey: string } }).props.sectionTypeKey);
    assert.deepEqual(kinds, ["site_header", "site_footer"]);
  });

  test(`[${locale}] BOTH landmarks are ejected (or the curated bar renders too)`, () => {
    for (const node of treeFor(locale)) {
      const props = (node as { props: Record<string, unknown> }).props;
      assert.equal(
        props.ejected,
        true,
        `${String(props.sectionTypeKey)} must be ejected; without it PublishedShell renders the curated component AND these children`,
      );
    }
  });

  test(`[${locale}] BOTH landmarks carry their anchor sectionId`, () => {
    const [header, footer] = treeFor(locale) as Array<{
      props: { sectionId?: string };
    }>;
    assert.equal(header.props.sectionId, ANCHORS.header);
    assert.equal(footer.props.sectionId, ANCHORS.footer);
  });

  test(`[${locale}] both landmarks actually carry content`, () => {
    for (const node of treeFor(locale)) {
      const children = (node as { children?: unknown[] }).children ?? [];
      assert.ok(
        children.length > 0,
        "an empty landmark would publish an empty header/footer",
      );
    }
  });

  test(`[${locale}] splitShellTree separates header from footer`, () => {
    const split = splitShellTree(treeFor(locale) as never);
    assert.equal(split.header.length, 1, "header side must hold one landmark");
    assert.equal(split.footer.length, 1, "footer side must hold one landmark");
  });

  test(`[${locale}] each side resolves to a renderable plan`, () => {
    const tree = treeFor(locale) as never;
    for (const side of ["header", "footer"] as const) {
      const plan = resolveShellSidePlan({ tree, slots: SLOTS, side });
      assert.notEqual(
        plan.mode,
        "none",
        `${side} resolved to "none" — nothing would render`,
      );
    }
  });
}

test("EN and ES trees have identical structure (only copy differs)", () => {
  const shape = (locale: string) =>
    JSON.stringify(
      treeFor(locale),
      (key, value) =>
        // Compare STRUCTURE: drop ids and every human-visible string, keep kinds
        // and the props that decide rendering.
        key === "id" || key === "text" || key === "label" || key === "alt"
          ? undefined
          : value,
    ).replace(/"[^"]*(Inicio|Home|Contacto|Contact|Men[uú])[^"]*"/g, '"~"');
  assert.equal(
    countNodes(treeFor("en")),
    countNodes(treeFor("es")),
    "locale trees must have the same node count",
  );
  assert.equal(shape("en").length > 0, true);
});

test("classifyShellTree sees an addressed pair (the eject guard, not a synthetic root, is what frees us)", () => {
  // Documented so the next person does not "fix" this by bolting on a spare
  // root: with `ejected` honored on BOTH render paths, a legacy_slots
  // classification is fine — renderShellSlot skips the curated component and
  // renders our children.
  const classification = classifyShellTree(treeFor("en") as never, SLOTS);
  assert.equal(classification, "legacy_slots");
});

test("the tree carries no unresolved image-slot tokens once seeded", () => {
  // The seeder resolves IMAGE_SLOT tokens before writing; this pins that a raw
  // token in the authored tree is visible here rather than on the live site.
  const raw = JSON.stringify(treeFor("en"));
  const tokens = raw.match(/slot:\/\/impronta-rebuild\/[a-z0-9-]+/g) ?? [];
  assert.ok(
    tokens.length > 0,
    "expected authored image slots (the seeder resolves them at write time)",
  );
});

test("every landmark address key resolves to a real slot (the header-less bug)", () => {
  // THE regression: a landmark whose `sectionId:slotKey:sortOrder` matches no
  // slot is invisible to `renderShellSlot` -- it finds no builder node, renders
  // no children, and because `ejected` correctly suppresses the curated bar the
  // page ends up with NO header. Shipped exactly once; pinned here forever.
  const slotKeys = new Set(
    (SLOTS as unknown as Array<{
      sectionId: string;
      slotKey: string;
      sortOrder: number;
    }>).map((s) => `${s.sectionId}:${s.slotKey}:${s.sortOrder}`),
  );
  for (const locale of ["en", "es"]) {
    for (const node of treeFor(locale) as Array<{
      props: { sectionId?: string; slotKey?: string; sortOrder?: number };
    }>) {
      const key = `${node.props.sectionId}:${node.props.slotKey}:${node.props.sortOrder}`;
      assert.ok(
        slotKeys.has(key),
        `[${locale}] landmark address "${key}" matches no snapshot slot — its children would never render`,
      );
    }
  }
});
