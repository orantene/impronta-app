import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildTalentDisciplineDecomposedSection,
  isMonolithicTalentTypeGridEmbed,
  migrateMonolithicTalentTypeGridEmbeds,
} from "./talent-discipline-freeform";
import { resolveSnapshotBuilderTree } from "./snapshot-tree";
import type { BuilderNode } from "./types";

function childNodes(node: BuilderNode | undefined): BuilderNode[] {
  return node?.kind === "container" ? (node.children ?? []) : [];
}

describe("talent-discipline-freeform", () => {
  test("decomposed section exposes freeform text layers and grid-only embed", () => {
    const root = buildTalentDisciplineDecomposedSection({ rootId: "td-root" });
    assert.equal(root.kind, "container");
    assert.equal(root.id, "td-root");
    assert.equal(root.props.layerLabel, "Talent by Discipline Section");

    const column = childNodes(root)[0];
    assert.equal(column?.kind, "container");
    const labels = childNodes(column).map(
      (child) => (child.props as { layerLabel?: string }).layerLabel,
    );
    assert.deepEqual(labels, [
      "Intro Text",
      "Section Head",
      "Discipline Grid",
    ]);

    // Phase 8B — a NATIVE `talent_type_grid` node, not a `section_embed`.
    const grid = childNodes(column).find((c) => c.kind === "talent_type_grid");
    assert.ok(grid);
    assert.equal(
      childNodes(column).some((c) => c.kind === "section_embed"),
      false,
      "no section_embed bridge may survive in the talent-discipline wrapper",
    );
    const props = grid!.props as Record<string, unknown>;
    assert.equal(props.headline, undefined);
    assert.equal(props.eyebrow, undefined);
    assert.equal(props.seeAllLabel, undefined);
    assert.equal(props.config, undefined);
    assert.equal(props.sectionTypeKey, undefined);
    // The preset ships authored cards, so the node stays in `manual` mode and
    // renders exactly the items already on the page.
    assert.equal(props.mode, "manual");
    assert.ok(Array.isArray(props.items) && (props.items as unknown[]).length > 0);
  });

  test("migrateMonolithicTalentTypeGridEmbeds splits legacy embed", () => {
    const legacy: BuilderNode = {
      id: "legacy-disciplines",
      kind: "section_embed",
      props: {
        sectionTypeKey: "talent_type_grid",
        config: {
          eyebrow: "The roster",
          headline: "Talent, by discipline",
          seeAllLabel: "See all",
          items: [],
        },
      },
    };
    assert.equal(isMonolithicTalentTypeGridEmbed(legacy), true);

    const [migrated] = migrateMonolithicTalentTypeGridEmbeds([legacy]);
    assert.equal(migrated.kind, "container");
    assert.equal(migrated.id, "legacy-disciplines");
    // The migration now lands on the NATIVE kind: a legacy monolithic embed
    // decomposes straight into freeform layers + a `talent_type_grid` node, so
    // loading an old snapshot does not reintroduce a bridge.
    const grid = childNodes(childNodes(migrated)[0]).find(
      (c) => c.kind === "talent_type_grid",
    );
    assert.ok(grid);
    assert.equal((grid!.props as Record<string, unknown>).headline, undefined);
  });

  test("resolveSnapshotBuilderTree migrates monolithic embed on load", () => {
    const legacy: BuilderNode = {
      id: "impronta-disciplines",
      kind: "section_embed",
      props: {
        sectionTypeKey: "talent_type_grid",
        config: {
          eyebrow: "The roster",
          headline: "Talent, by discipline",
          seeAllLabel: "See all",
          items: [],
        },
      },
    };
    const resolved = resolveSnapshotBuilderTree({
      slots: [],
      builderTree: [legacy],
    });
    const root = resolved.tree[0];
    assert.equal(root?.kind, "container");
    assert.equal(root?.id, "impronta-disciplines");
    const sectionHead = childNodes(childNodes(root)[0]).find(
      (c) => (c.props as { layerLabel?: string }).layerLabel === "Section Head",
    );
    const title = childNodes(sectionHead).find(
      (c) => (c.props as { layerLabel?: string }).layerLabel === "Title",
    );
    assert.equal(title?.kind, "heading");
  });
});
