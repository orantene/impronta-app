import assert from "node:assert/strict";
import test from "node:test";

import {
  FORM_SECTION_SLOT,
  applyFormSectionResolution,
  countFormSectionSlots,
  describeMissingFormSection,
} from "./form-section";
import { contactPage } from "./pages/contact";
import { corePagesEs } from "./pages/core-es";

const REAL_ID = "cb91df75-fb5d-4e8d-b66a-c3b575574ae3";

/** Every `form` node anywhere in a tree. */
function formNodes(value: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const node = v as Record<string, unknown>;
    if (node.kind === "form") out.push(node);
    Object.values(node).forEach(walk);
  };
  walk(value);
  return out;
}

/**
 * THE REGRESSION. The seeded contact form shipped with no `sectionId` at all,
 * so the renderer emitted no `__tulala_section` input and the endpoint refused
 * every submission with 400 "Missing section reference." Both locales, live,
 * for as long as the page existed. A form node that carries no section
 * reference is a form that cannot accept a single brief.
 */
test("every seeded form carries a section reference", () => {
  const forms = formNodes(contactPage.tree);
  assert.ok(forms.length > 0, "the contact page must still have a form");
  for (const form of forms) {
    const props = form.props as Record<string, unknown>;
    assert.ok(
      typeof props.sectionId === "string" && props.sectionId.length > 0,
      `form ${String(form.id)} has no sectionId — its submissions would 400`,
    );
  }
});

test("the Spanish twin carries it too", () => {
  // The localizer copies the tree, so a missing binding would be missing in
  // both languages — which is exactly how it shipped.
  const esContact = corePagesEs.find((p) => p.slug === "contact");
  assert.ok(esContact, "no Spanish contact page");
  const forms = formNodes(esContact!.tree);
  assert.ok(forms.length > 0);
  for (const form of forms) {
    const props = form.props as Record<string, unknown>;
    assert.equal(props.sectionId, FORM_SECTION_SLOT);
  }
});

test("resolution swaps the token for the real row id", () => {
  const { tree, unresolved } = applyFormSectionResolution(contactPage.tree, REAL_ID);
  assert.equal(unresolved, 0);
  const forms = formNodes(tree);
  for (const form of forms) {
    assert.equal((form.props as Record<string, unknown>).sectionId, REAL_ID);
  }
});

test("resolution leaves everything else alone", () => {
  const before = JSON.stringify(contactPage.tree).split(FORM_SECTION_SLOT).length - 1;
  assert.ok(before > 0);
  const { tree } = applyFormSectionResolution(contactPage.tree, REAL_ID);
  const a = JSON.stringify(contactPage.tree).replaceAll(FORM_SECTION_SLOT, REAL_ID);
  assert.equal(JSON.stringify(tree), a);
});

test("counting finds nested tokens", () => {
  assert.equal(countFormSectionSlots([{ props: { sectionId: FORM_SECTION_SLOT } }]), 1);
  assert.equal(countFormSectionSlots({ a: { b: [{ c: FORM_SECTION_SLOT }] } }), 1);
  assert.equal(countFormSectionSlots({ a: "something else" }), 0);
});

test("the abort message names the failure and the fix", () => {
  const msg = describeMissingFormSection("impronta");
  assert.match(msg, /impronta/);
  assert.match(msg, /Missing section reference/);
  assert.match(msg, /contact_form/);
});
