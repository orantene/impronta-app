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

    const embed = childNodes(column).find((c) => c.kind === "section_embed");
    assert.ok(embed);
    const config = (embed!.props as { config?: Record<string, unknown> }).config;
    assert.equal(config?.headline, "");
    assert.equal(config?.eyebrow, "");
    assert.equal(config?.seeAllLabel, "");
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
    const embed = childNodes(childNodes(migrated)[0]).find(
      (c) => c.kind === "section_embed",
    );
    assert.ok(embed);
    assert.equal(
      (embed!.props as { config?: Record<string, unknown> }).config?.headline,
      "",
    );
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
