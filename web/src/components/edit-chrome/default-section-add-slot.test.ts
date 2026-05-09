import test from "node:test";
import assert from "node:assert/strict";

import type {
  CompositionSectionRef,
  CompositionSlotDef,
} from "@/lib/site-admin/edit-mode/composition-actions";
import { defaultSectionAddSlot } from "./default-section-add-slot";

function slotDef(
  key: string,
  overrides: Partial<CompositionSlotDef> = {},
): CompositionSlotDef {
  return {
    key,
    label: key,
    required: false,
    allowedSectionTypes: null,
    ...overrides,
  };
}

function ref(sectionId: string, sortOrder: number): CompositionSectionRef {
  return {
    sectionId,
    sortOrder,
    sectionTypeKey: "hero",
    name: "Test",
  };
}

test("defaultSectionAddSlot prefers empty required slot", () => {
  const defs = [
    slotDef("hero", { required: true, allowedSectionTypes: ["hero"] }),
    slotDef("primary", { required: false }),
  ];
  const slots: Record<string, CompositionSectionRef[]> = {
    hero: [],
    primary: [ref("a", 0)],
  };
  assert.equal(defaultSectionAddSlot(defs, slots), "hero");
});

test("defaultSectionAddSlot picks first flexible slot when no empty required", () => {
  const defs = [
    slotDef("hero", { required: true, allowedSectionTypes: ["hero"] }),
    slotDef("primary", { required: false }),
  ];
  const slots: Record<string, CompositionSectionRef[]> = {
    hero: [ref("h", 0)],
    primary: [],
  };
  assert.equal(defaultSectionAddSlot(defs, slots), "primary");
});

test("defaultSectionAddSlot falls back to first slot key", () => {
  const defs = [
    slotDef("hero", {
      required: true,
      allowedSectionTypes: ["hero"],
    }),
  ];
  const slots: Record<string, CompositionSectionRef[]> = {
    hero: [ref("h", 0)],
  };
  assert.equal(defaultSectionAddSlot(defs, slots), "hero");
});
