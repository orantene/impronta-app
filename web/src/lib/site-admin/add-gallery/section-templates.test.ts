import assert from "node:assert/strict";
import test from "node:test";

import { resolveLayerDisplayName } from "@/components/edit-chrome/freeform-layer-name";
import type { BuilderNode } from "@/lib/site-admin/builder-node";

import {
  buildAddGallerySectionTemplate,
  collectSectionTemplateLayerLabels,
  sectionTemplateContainsKind,
} from "./section-templates";

test("layerLabel overrides derived paragraph text in layers tree", () => {
  const node: BuilderNode = {
    id: "p1",
    kind: "paragraph",
    props: { text: "Long body copy…", layerLabel: "Quote Text" },
  };
  assert.equal(resolveLayerDisplayName(node), "Quote Text");
});

test("hero-centered template is native freeform with semantic layer labels", () => {
  const root = buildAddGallerySectionTemplate("hero-centered");
  assert.ok(root);
  assert.equal(root!.props.label, "Hero Centered Section");
  assert.equal(sectionTemplateContainsKind(root!, "section_embed"), false);
  const labels = collectSectionTemplateLayerLabels(root!);
  assert.ok(labels.includes("Title"));
  assert.ok(labels.includes("Description"));
  assert.ok(labels.includes("Button Group"));
  assert.ok(labels.includes("Primary Button"));
});

test("testimonials-trio template exposes quote cards as freeform layers", () => {
  const root = buildAddGallerySectionTemplate("testimonials-trio");
  assert.ok(root);
  assert.equal(root!.props.label, "Testimonials Section");
  assert.equal(sectionTemplateContainsKind(root!, "section_embed"), false);
  const labels = collectSectionTemplateLayerLabels(root!);
  assert.ok(labels.includes("Intro Text"));
  assert.ok(labels.includes("Title"));
  assert.ok(labels.includes("Testimonial Grid"));
  assert.ok(labels.includes("Testimonial Card"));
  assert.ok(labels.includes("Quote Text"));
  assert.ok(labels.includes("Client Name"));
  assert.ok(labels.includes("Client Role"));
});

test("cta-banner template is native freeform with CTA layers", () => {
  const root = buildAddGallerySectionTemplate("cta-banner");
  assert.ok(root);
  assert.equal(root!.props.label, "CTA Banner Section");
  assert.equal(sectionTemplateContainsKind(root!, "section_embed"), false);
  const labels = collectSectionTemplateLayerLabels(root!);
  assert.ok(labels.includes("Intro Text"));
  assert.ok(labels.includes("Title"));
  assert.ok(labels.includes("Description"));
  assert.ok(labels.includes("Button Group"));
  assert.ok(labels.includes("Primary Button"));
  assert.ok(labels.includes("Reassurance Text"));
});

test("faq-accordion template exposes accordion Q&A as freeform layers", () => {
  const root = buildAddGallerySectionTemplate("faq-accordion");
  assert.ok(root);
  assert.equal(root!.props.label, "FAQ Section");
  assert.equal(sectionTemplateContainsKind(root!, "section_embed"), false);
  assert.equal(sectionTemplateContainsKind(root!, "accordion"), true);
  const labels = collectSectionTemplateLayerLabels(root!);
  assert.ok(labels.includes("FAQ Accordion"));
  assert.ok(labels.includes("Answer"));
});

test("hero-search template is freeform with search form and chips", () => {
  const root = buildAddGallerySectionTemplate("hero-search");
  assert.ok(root);
  assert.equal(root!.props.label, "Hero Search Section");
  assert.equal(sectionTemplateContainsKind(root!, "section_embed"), false);
  const labels = collectSectionTemplateLayerLabels(root!);
  assert.ok(labels.includes("Intro Text"));
  assert.ok(labels.includes("Title"));
  assert.ok(labels.includes("Subtitle"));
  assert.ok(labels.includes("Search Form"));
  assert.ok(labels.includes("Button Group"));
  assert.ok(labels.includes("Location Chips"));
  assert.ok(labels.includes("Stats Text"));
  assert.equal(sectionTemplateContainsKind(root!, "form"), true);
});
