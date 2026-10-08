/**
 * Maison Design payload (PR 2) — validates, prices on, FAQ bind, fonts via Looks.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { DESIGN_ALLOWED_NODE_KINDS, validateDesign } from "../validate";
import { MAISON_BUILTIN_DESIGN, MAISON_BUILTIN_LOOKS } from "./builtins";
import { buildMaisonDesignPayload } from "./design-payload";
import { accordionBindsFaq } from "./faq-bind";

function walk(
  nodes: ReadonlyArray<{ kind: string; props?: Record<string, unknown>; children?: unknown }>,
  visit: (n: { kind: string; props?: Record<string, unknown> }) => void,
): void {
  for (const n of nodes) {
    visit(n);
    if (Array.isArray(n.children)) walk(n.children as typeof nodes, visit);
  }
}

test("Maison Design payload validates (shell + home kit slots)", () => {
  const payload = buildMaisonDesignPayload();
  const check = validateDesign(payload);
  assert.equal(check.ok, true, check.errors.join(" · "));
  assert.equal(MAISON_BUILTIN_DESIGN.buildPayload === buildMaisonDesignPayload, true);
});

test("Maison Design is deterministic across builds", () => {
  const a = JSON.stringify(buildMaisonDesignPayload());
  const b = JSON.stringify(buildMaisonDesignPayload());
  assert.equal(a, b);
});

test("Maison Design includes services_catalog with showPrice true (free-plan prices)", () => {
  const { homeTree } = buildMaisonDesignPayload();
  let found = false;
  walk(homeTree, (n) => {
    if (n.kind === "services_catalog") {
      found = true;
      assert.equal(n.props?.showPrice, true);
      assert.ok(DESIGN_ALLOWED_NODE_KINDS.has("services_catalog"));
    }
  });
  assert.ok(found, "expected services_catalog in homeTree");
});

test("AUD-026: Maison services_catalog sits in a padded side-gutter container", () => {
  const { homeTree } = buildMaisonDesignPayload();
  const services = homeTree.find(
    (n) => (n.props as { slotKey?: string } | undefined)?.slotKey === "services",
  );
  assert.ok(services, "expected services section");
  const style = (services!.props as { style?: { paddingX?: string; maxWidth?: string } }).style;
  assert.equal(style?.paddingX, "m");
  assert.equal(style?.maxWidth, "wide");
  const kids =
    "children" in services! && Array.isArray(services!.children) ? services!.children : [];
  assert.ok(
    kids.some((c) => c.kind === "services_catalog"),
    "catalog must be nested inside the padded container",
  );
});

test("Maison Design FAQ accordion binds talent_faq_items", () => {
  const { homeTree } = buildMaisonDesignPayload();
  let found = false;
  walk(homeTree, (n) => {
    if (n.kind === "accordion" && accordionBindsFaq(n.props as { bindSource?: string })) {
      found = true;
    }
  });
  assert.ok(found, "expected FAQ-bound accordion");
});

test("Maison Design uses phone-responsive stacks on services + contact", () => {
  const { homeTree } = buildMaisonDesignPayload();
  const responsiveSlots: string[] = [];
  for (const section of homeTree) {
    const props = section.props as {
      slotKey?: string;
      responsive?: { mobile?: { layout?: string } };
    };
    if (props.responsive?.mobile?.layout === "stack" && props.slotKey) {
      responsiveSlots.push(props.slotKey);
    }
  }
  assert.ok(responsiveSlots.includes("services"));
  assert.ok(responsiveSlots.includes("contact"));
});

test("Maison Design services band uses surface-raised blush ground", () => {
  const { homeTree } = buildMaisonDesignPayload();
  const services = homeTree.find(
    (n) => (n.props as { slotKey?: string } | undefined)?.slotKey === "services",
  );
  assert.ok(services, "expected services kit section");
  const bg = (services?.props as { style?: { backgroundColor?: string } } | undefined)?.style
    ?.backgroundColor;
  assert.match(
    String(bg ?? ""),
    /token-color-surface-raised|token:color\.surface-raised/,
    "Menu band must bind soft blush (surface-raised), not hard white",
  );
});

test("Maison Looks declare Fraunces + Inter (W16 fonts)", () => {
  for (const look of MAISON_BUILTIN_LOOKS) {
    const tokens = look.buildPayload().tokens;
    assert.match(String(tokens["typography.heading-font-family"]), /Fraunces/i);
    assert.match(String(tokens["typography.body-font-family"]), /Inter/i);
  }
});

test("Maison Design nests reveal + tabs-capable catalog kinds from allowlist", () => {
  const { homeTree } = buildMaisonDesignPayload();
  const kinds = new Set<string>();
  walk(homeTree, (n) => kinds.add(n.kind));
  assert.ok(kinds.has("reveal"));
  assert.ok(kinds.has("services_catalog"));
  assert.ok(kinds.has("accordion"));
  for (const k of ["reveal", "services_catalog", "accordion", "tabs"]) {
    assert.ok(DESIGN_ALLOWED_NODE_KINDS.has(k), k);
  }
});
