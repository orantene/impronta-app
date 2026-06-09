import assert from "node:assert/strict";
import test from "node:test";

import { resolveLayerDisplayName } from "@/components/edit-chrome/freeform-layer-name";
import type { BuilderNode } from "@/lib/site-admin/builder-node";

import {
  assertTemplateLayerLabels,
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
  assert.equal(root!.kind, "container");
  assert.equal(root!.props.layerLabel, "Hero Centered Section");
  assert.equal(sectionTemplateContainsKind(root!, "section_embed"), false);
  assertTemplateLayerLabels("hero-centered", [
    "Intro Text",
    "Title",
    "Description",
    "Button Group",
    "Primary Button",
  ]);
});

test("hero-split template exposes split layout layers", () => {
  const root = buildAddGallerySectionTemplate("hero-split");
  assert.ok(root);
  assert.equal(root!.kind, "container");
  assert.equal(root!.props.layerLabel, "Hero Split Image Section");
  assertTemplateLayerLabels("hero-split", [
    "Title",
    "Description",
    "Primary Button",
    "Background Image",
  ]);
});

test("hero-minimal template exposes title and primary button", () => {
  assertTemplateLayerLabels("hero-minimal", [
    "Title",
    "Description",
    "Primary Button",
  ]);
});

test("hero-search template is freeform with search form and chips", () => {
  const root = buildAddGallerySectionTemplate("hero-search");
  assert.ok(root);
  assert.equal(root!.kind, "container");
  assert.equal(root!.props.layerLabel, "Hero Search Section");
  assert.equal(sectionTemplateContainsKind(root!, "section_embed"), false);
  assertTemplateLayerLabels("hero-search", [
    "Intro Text",
    "Title",
    "Subtitle",
    "Search Form",
    "Button Group",
    "Location Chips",
    "Stats Text",
  ]);
  assert.equal(sectionTemplateContainsKind(root!, "form"), true);
});

test("about templates expose intro and description layers", () => {
  assertTemplateLayerLabels("about", ["Intro Text", "Title", "Description"]);
  assertTemplateLayerLabels("about-split", [
    "Title",
    "Description",
    "Background Image",
  ]);
  assertTemplateLayerLabels("about-stats", [
    "Title",
    "Description",
    "Stat Card",
    "Stat Value",
    "Stat Label",
  ]);
});

test("services templates expose service layers", () => {
  assertTemplateLayerLabels("services", [
    "Title",
    "Description",
    "Service Card",
    "Service Title",
    "Service Description",
  ]);
  assertTemplateLayerLabels("services-list", [
    "Title",
    "Service Item 1",
    "Service Item 2",
    "Service Item 3",
  ]);
});

test("gallery templates expose image layers", () => {
  assertTemplateLayerLabels("gallery", [
    "Title",
    "Description",
    "Gallery Grid",
    "Gallery Image 1",
  ]);
  assertTemplateLayerLabels("gallery-strip", [
    "Title",
    "Description",
    "Gallery Strip",
    "Gallery Image 1",
  ]);
});

test("connected wrapper templates include labeled embed child", () => {
  const featured = buildAddGallerySectionTemplate("featured-talent-wrapper");
  assert.ok(featured);
  assert.equal(sectionTemplateContainsKind(featured!, "section_embed"), true);
  assertTemplateLayerLabels("featured-talent-wrapper", [
    "Intro Text",
    "Title",
    "Subtitle",
    "See All Link",
    "Talent Grid",
  ]);

  const roster = buildAddGallerySectionTemplate("roster-wrapper");
  assert.ok(roster);
  assertTemplateLayerLabels("roster-wrapper", [
    "Title",
    "Description",
    "Directory Grid",
  ]);

  const discipline = buildAddGallerySectionTemplate("talent-discipline-wrapper");
  assert.ok(discipline);
  assert.equal(sectionTemplateContainsKind(discipline!, "section_embed"), true);
  assertTemplateLayerLabels("talent-discipline-wrapper", [
    "Intro Text",
    "Title",
    "See All Link",
    "Discipline Grid",
  ]);
});

test("markets-wrapper template exposes freeform header layers and grid-only embed", () => {
  const markets = buildAddGallerySectionTemplate("markets-wrapper");
  assert.ok(markets);
  assert.equal(sectionTemplateContainsKind(markets!, "section_embed"), true);
  assertTemplateLayerLabels("markets-wrapper", [
    "Intro Text",
    "Title",
    "See All Link",
    "Markets Grid",
  ]);

  // location-discovery-wrapper is an alias — same template
  const alias = buildAddGallerySectionTemplate("location-discovery-wrapper");
  assert.ok(alias);
  assert.equal(sectionTemplateContainsKind(alias!, "section_embed"), true);
  assertTemplateLayerLabels("location-discovery-wrapper", [
    "Intro Text",
    "Title",
    "See All Link",
    "Markets Grid",
  ]);
});

test("connected native templates agency-logo and inquiry-cta", () => {
  assertTemplateLayerLabels("agency-logo", ["Title", "Logo Row", "Logo 1"]);
  assertTemplateLayerLabels("inquiry-cta", [
    "Title",
    "Description",
    "Primary Button",
  ]);
});

test("testimonials-trio template exposes quote cards as freeform layers", () => {
  const root = buildAddGallerySectionTemplate("testimonials-trio");
  assert.ok(root);
  assert.equal(root!.kind, "container");
  assert.equal(root!.props.layerLabel, "Testimonials Section");
  assert.equal(sectionTemplateContainsKind(root!, "section_embed"), false);
  const labels = collectSectionTemplateLayerLabels(root!);
  assert.ok(labels.includes("Intro Text"));
  assert.ok(labels.includes("Title"));
  assert.ok(labels.includes("Testimonial Grid"));
  assert.ok(labels.includes("Testimonial Card"));
  assert.ok(labels.includes("Quote Mark"));
  assert.ok(labels.includes("Quote Text"));
  assert.ok(labels.includes("Client Name"));
  assert.ok(labels.includes("Client Role"));
});

test("cta-banner template is native freeform with CTA layers", () => {
  const root = buildAddGallerySectionTemplate("cta-banner");
  assert.ok(root);
  assert.equal(root!.kind, "container");
  assert.equal(root!.props.layerLabel, "CTA Banner Section");
  assert.equal(sectionTemplateContainsKind(root!, "section_embed"), false);
  assertTemplateLayerLabels("cta-banner", [
    "Intro Text",
    "Title",
    "Description",
    "Button Group",
    "Primary Button",
    "Reassurance Text",
  ]);
});

test("cta-split template exposes split CTA layers", () => {
  assertTemplateLayerLabels("cta-split", [
    "Title",
    "Description",
    "Primary Button",
  ]);
});

test("faq-accordion template exposes accordion Q&A as freeform layers", () => {
  const root = buildAddGallerySectionTemplate("faq-accordion");
  assert.ok(root);
  assert.equal(root!.kind, "container");
  assert.equal(root!.props.layerLabel, "FAQ Section");
  assert.equal(sectionTemplateContainsKind(root!, "section_embed"), false);
  assert.equal(sectionTemplateContainsKind(root!, "accordion"), true);
  const labels = collectSectionTemplateLayerLabels(root!);
  assert.ok(labels.includes("FAQ Accordion"));
  assert.ok(labels.includes("Answer"));
});

test("contact-form template exposes labeled form layer", () => {
  const root = buildAddGallerySectionTemplate("contact-form");
  assert.ok(root);
  assert.equal(root!.kind, "container");
  assert.equal(root!.props.layerLabel, "Contact Form Section");
  assertTemplateLayerLabels("contact-form", [
    "Intro Text",
    "Title",
    "Description",
    "Contact Form",
  ]);
  assert.equal(sectionTemplateContainsKind(root!, "form"), true);
});
