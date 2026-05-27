import test from "node:test";
import assert from "node:assert/strict";
import { buildNewTalentPickerTaxonomy } from "./new-talent-taxonomy";
import type { LiveTaxonomyParent } from "@/components/admin/shell/internal/use-taxonomy";
import type { TaxonomyNode } from "../../drawer-shared";

function liveParent(): LiveTaxonomyParent {
  const parent = {
    id: "parent-models-id",
    slug: "models",
    label: "Models",
    termType: "parent_category",
    parentId: null,
    level: 1,
    sortOrder: 10,
    isPublicFilter: true,
    isActive: true,
  };
  return {
    raw: parent,
    display: {
      id: "models",
      label: "Models",
      emoji: "",
      minPlan: "free",
      helper: "",
      children: [
        { id: "fashion-model", label: "Fashion Model" },
        { id: "car-show-model", label: "Car Show Model" },
      ],
    },
    talentTypes: [
      {
        id: "leaf-fashion-id",
        slug: "fashion-model",
        label: "Fashion Model",
        termType: "talent_type",
        parentId: "group-fashion-id",
        level: 3,
        sortOrder: 10,
        isPublicFilter: true,
        isActive: true,
      },
      {
        id: "leaf-car-show-id",
        slug: "car-show-model",
        label: "Car Show Model",
        termType: "talent_type",
        parentId: "group-fashion-id",
        level: 3,
        sortOrder: 20,
        isPublicFilter: true,
        isActive: true,
      },
    ],
  };
}

function taxonomyNode(input: Partial<TaxonomyNode> & Pick<TaxonomyNode, "id" | "slug" | "name_en" | "term_type">): TaxonomyNode {
  return {
    name_es: null,
    level: 1,
    parent_id: null,
    is_active: true,
    is_enabled: true,
    show_in_registration: true,
    show_in_directory: true,
    allow_as_primary: true,
    allow_as_secondary: true,
    requires_approval: false,
    display_order: 10,
    custom_label: null,
    custom_label_es: null,
    helper_text: null,
    is_custom: false,
    children: [],
    ...input,
  };
}

test("new talent picker hides tenant-disabled leaf talent types", () => {
  const parent = liveParent();
  const tenantTree: TaxonomyNode[] = [
    taxonomyNode({
      id: "parent-models-id",
      slug: "models",
      name_en: "Models",
      term_type: "parent_category",
      children: [
        taxonomyNode({
          id: "group-fashion-id",
          slug: "fashion-models",
          name_en: "Fashion Models",
          term_type: "category_group",
          parent_id: "parent-models-id",
          level: 2,
          children: [
            taxonomyNode({
              id: "leaf-fashion-id",
              slug: "fashion-model",
              name_en: "Fashion Model",
              term_type: "talent_type",
              parent_id: "group-fashion-id",
              level: 3,
            }),
            taxonomyNode({
              id: "leaf-car-show-id",
              slug: "car-show-model",
              name_en: "Car Show Model",
              term_type: "talent_type",
              parent_id: "group-fashion-id",
              level: 3,
              is_enabled: false,
            }),
          ],
        }),
      ],
    }),
  ];

  const result = buildNewTalentPickerTaxonomy({
    visibleLiveParents: [parent],
    restLiveParents: [],
    tenantTree,
    fallbackAllowedParentIds: new Set(["models"]),
    currentPlan: "agency",
    showMore: false,
  });

  assert.deepEqual(result.visibleParents[0]?.children, [
    { id: "fashion-model", label: "Fashion Model" },
  ]);
});

test("new talent picker keeps legacy tree behavior when no leaf settings are loaded", () => {
  const parent = liveParent();
  const tenantTree: TaxonomyNode[] = [
    taxonomyNode({
      id: "parent-models-id",
      slug: "models",
      name_en: "Models",
      term_type: "parent_category",
      children: [
        taxonomyNode({
          id: "group-fashion-id",
          slug: "fashion-models",
          name_en: "Fashion Models",
          term_type: "category_group",
          parent_id: "parent-models-id",
          level: 2,
        }),
      ],
    }),
  ];

  const result = buildNewTalentPickerTaxonomy({
    visibleLiveParents: [parent],
    restLiveParents: [],
    tenantTree,
    fallbackAllowedParentIds: new Set(["models"]),
    currentPlan: "agency",
    showMore: false,
  });

  assert.equal(result.visibleParents[0]?.children.length, 2);
});
