import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildWorkspaceTemplateRow,
  summarizeWorkspaceTemplateSections,
  summarizeWorkspaceTemplateTypes,
  type WorkspaceTemplateRecord,
} from "./workspace-template-rows";

test("summarizes template sections in stable slot and sort order", () => {
  const sections = summarizeWorkspaceTemplateSections({
    slots: [
      {
        slotKey: "body",
        sortOrder: 20,
        sectionTypeKey: "cta_banner",
        name: "Final conversion",
      },
      {
        slotKey: "hero",
        sortOrder: 0,
        sectionTypeKey: "hero",
        name: "",
      },
      {
        slotKey: "body",
        sortOrder: 10,
        sectionTypeKey: "gallery_strip",
        name: "Work gallery",
      },
    ],
  });

  assert.deepEqual(
    sections.map((section) => ({
      slotKey: section.slotKey,
      sortOrder: section.sortOrder,
      label: section.label,
      name: section.name,
    })),
    [
      {
        slotKey: "body",
        sortOrder: 10,
        label: "Gallery strip",
        name: "Work gallery",
      },
      {
        slotKey: "body",
        sortOrder: 20,
        label: "CTA banner",
        name: "Final conversion",
      },
      {
        slotKey: "hero",
        sortOrder: 0,
        label: "Hero",
        name: "Hero",
      },
    ],
  );
});

test("summarizes malformed template slots with safe fallbacks", () => {
  const sections = summarizeWorkspaceTemplateSections({
    slots: [
      {
        slotKey: "",
        sortOrder: Number.NaN,
        sectionTypeKey: "",
        name: " ",
      },
      {
        slotKey: "body",
        sortOrder: 1,
        sectionTypeKey: "mystery_panel",
      },
      null,
    ],
  });

  assert.deepEqual(
    sections.map((section) => ({
      slotKey: section.slotKey,
      sortOrder: section.sortOrder,
      sectionTypeKey: section.sectionTypeKey,
      label: section.label,
      name: section.name,
    })),
    [
      {
        slotKey: "body",
        sortOrder: 0,
        sectionTypeKey: "unknown",
        label: "unknown",
        name: "unknown",
      },
      {
        slotKey: "body",
        sortOrder: 0,
        sectionTypeKey: "unknown",
        label: "unknown",
        name: "unknown",
      },
      {
        slotKey: "body",
        sortOrder: 1,
        sectionTypeKey: "mystery_panel",
        label: "mystery_panel",
        name: "mystery_panel",
      },
    ],
  );
});

test("summarizes unique template section types and caps gallery badges", () => {
  const typeSummary = summarizeWorkspaceTemplateTypes([
    { label: "Hero" },
    { label: "CTA banner" },
    { label: "Hero" },
    { label: "Gallery strip" },
    { label: "FAQ" },
    { label: "Pricing" },
    { label: "Testimonials" },
  ]);

  assert.deepEqual(typeSummary, [
    "Hero",
    "CTA banner",
    "Gallery strip",
    "FAQ",
    "Pricing",
  ]);
});

test("builds saved template rows with ownership and snapshot metadata", () => {
  const record: WorkspaceTemplateRecord = {
    id: "tpl_1",
    tenant_id: "impronta",
    name: "Impronta editorial",
    description: "  Shared starter  ",
    visibility: "platform",
    created_at: "2026-05-06T12:00:00.000Z",
    snapshot_jsonb: {
      capturedAt: "2026-05-06T11:00:00.000Z",
      slots: [
        {
          slotKey: "hero",
          sortOrder: 0,
          sectionTypeKey: "hero",
          name: "Editorial hero",
        },
        {
          slotKey: "body",
          sortOrder: 10,
          sectionTypeKey: "cta_banner",
          name: "Book now",
        },
      ],
    },
  };

  const row = buildWorkspaceTemplateRow(record, "impronta");

  assert.equal(row.id, "tpl_1");
  assert.equal(row.name, "Impronta editorial");
  assert.equal(row.description, "Shared starter");
  assert.equal(row.visibility, "platform");
  assert.equal(row.sectionCount, 2);
  assert.equal(row.capturedAt, "2026-05-06T11:00:00.000Z");
  assert.equal(row.createdAt, "2026-05-06T12:00:00.000Z");
  assert.equal(row.ownTenant, true);
  assert.deepEqual(row.typeSummary, ["CTA banner", "Hero"]);
});

test("builds template rows defensively when legacy records are sparse", () => {
  const row = buildWorkspaceTemplateRow(
    {
      id: null,
      tenant_id: "other",
      name: "  ",
      description: null,
      visibility: "unexpected",
      created_at: null,
      snapshot_jsonb: null,
    },
    "impronta",
  );

  assert.equal(row.id, "");
  assert.equal(row.name, "Untitled template");
  assert.equal(row.visibility, "private");
  assert.equal(row.sectionCount, 0);
  assert.equal(row.capturedAt, null);
  assert.equal(row.createdAt, "");
  assert.equal(row.ownTenant, false);
  assert.deepEqual(row.sections, []);
  assert.deepEqual(row.typeSummary, []);
});
