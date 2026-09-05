/**
 * Unit coverage for the starter personalisation pass.
 *
 * The WIRING coverage (that the seed and the render-time fallback actually run
 * this) lives in `../server/starter-personalisation-wiring.test.ts` — a pure
 * function that is green here and dead at its call site is the exact failure
 * this feature was written to avoid.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode, BuilderNodeTree } from "./types";
import { PAGE_DESIGNS } from "./page-designs";
import {
  STARTER_BUSINESS_NAME_FALLBACK,
  personaliseStarterBuilderTree,
  personaliseStarterCopy,
} from "./starter-personalisation";

const CTX = { businessName: "Riviera Maya Work", audience: "agency" } as const;

// ── the string grammar ────────────────────────────────────────────────────

test("tagline and city resolve to the tenant's own values when present", () => {
  const ctx = { businessName: "El Paisa", businessTagline: "Parrilla de familia", businessCity: "Glew" };
  assert.equal(personaliseStarterCopy("{{business.tagline}}", ctx), "Parrilla de familia");
  assert.equal(personaliseStarterCopy("{{ Business.City }}", ctx), "Glew");
  assert.equal(personaliseStarterCopy("{{businessCity}} · {{business.name}}", ctx), "Glew · El Paisa");
});

test("a copy node whose ONLY content was an absent fact is PRUNED, not left empty (blank-page guard)", () => {
  // The registry requires paragraph/heading/rich_text text to be non-empty. An
  // emptied node would fail validation downstream and blank the whole page,
  // which is what a name-only restaurant got on 2026-09-05.
  const tree: BuilderNodeTree = [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "stack" },
      children: [
        { id: "eyebrow", kind: "paragraph", props: { text: "{{business.city}}" } },
        { id: "h", kind: "heading", props: { text: "{{business.name}}", level: 1 } },
        { id: "sub", kind: "paragraph", props: { text: "{{business.tagline}}" } },
        { id: "keep", kind: "paragraph", props: { text: "Order from the menu below." } },
      ],
    } as BuilderNode,
  ];
  const out = personaliseStarterBuilderTree(tree, { businessName: "El Paisa" });
  const kids = (out[0] as BuilderNode & { children: BuilderNode[] }).children;
  assert.deepEqual(kids.map((n) => n.id), ["h", "keep"]);
  assert.equal((kids[0].props as { text: string }).text, "El Paisa");
  // With the facts present, nothing is pruned.
  const rich = personaliseStarterBuilderTree(tree, { businessName: "El Paisa", businessCity: "Glew", businessTagline: "Parrilla" });
  assert.equal((rich[0] as BuilderNode & { children: BuilderNode[] }).children.length, 4);
});

test("tagline and city are STRIPPED when absent, never replaced with fixture copy", () => {
  // The defect this guards: a fallback design carried "Modern Mexican Kitchen ·
  // Mexico City" as literal text, so a restaurant in Glew was told it was in
  // Mexico City. An absent fact must render as nothing.
  const ctx = { businessName: "El Paisa" };
  assert.equal(personaliseStarterCopy("{{business.tagline}}", ctx), "");
  assert.equal(personaliseStarterCopy("{{business.city}}", ctx), "");
  assert.equal(personaliseStarterCopy("Welcome to {{business.name}} in {{business.city}}.", ctx), "Welcome to El Paisa in.");
  assert.equal(personaliseStarterCopy("{{business.tagline}}", { businessName: "x", businessTagline: "   " }), "");
});

test("substitutes the business name in both spellings, ignoring case and spacing", () => {
  for (const token of [
    "{{business.name}}",
    "{{ business.name }}",
    "{{Business.Name}}",
    "{{businessName}}",
    "{{ BUSINESSNAME }}",
  ]) {
    assert.equal(
      personaliseStarterCopy(`Welcome to ${token}.`, CTX),
      "Welcome to Riviera Maya Work.",
      token,
    );
  }
});

test("a blank or missing name falls back to a neutral noun, never an empty gap", () => {
  for (const businessName of [null, undefined, "", "   "]) {
    assert.equal(
      personaliseStarterCopy("{{business.name}} is open for bookings.", {
        businessName,
      }),
      `${STARTER_BUSINESS_NAME_FALLBACK} is open for bookings.`,
    );
  }
});

test("the audience switch picks the matching case", () => {
  const line =
    "{{audience: agency=A curated roster, ready for your next production." +
    "|organization=Book us for your next event." +
    "|business=Come see what we do." +
    "|else=Available for your next project.}}";
  const of = (audience: string | null) =>
    personaliseStarterCopy(line, { audience });

  assert.equal(of("agency"), "A curated roster, ready for your next production.");
  assert.equal(of("organization"), "Book us for your next event.");
  assert.equal(of("business"), "Come see what we do.");
  assert.equal(of("operator"), "Available for your next project.");
  // Unknown / absent audience lands on `else`, never on nothing.
  assert.equal(of("wedding-band"), "Available for your next project.");
  assert.equal(of(null), "Available for your next project.");
});

test("an audience switch with no else falls back to its FIRST case, never blank", () => {
  const line = "{{audience: agency=Roster ready.|business=Come see us.}}";
  assert.equal(personaliseStarterCopy(line, { audience: "operator" }), "Roster ready.");
  assert.equal(personaliseStarterCopy(line, {}), "Roster ready.");
});

test("name and audience compose in one string", () => {
  assert.equal(
    personaliseStarterCopy(
      "{{business.name}} {{audience: agency=represents artists|else=works}} in Tulum.",
      CTX,
    ),
    "Riviera Maya Work represents artists in Tulum.",
  );
});

// ── degradation ───────────────────────────────────────────────────────────

test("an unknown placeholder is STRIPPED, and the sentence is tidied around it", () => {
  const out = personaliseStarterCopy("Book {{owner.firstName}} today.", CTX);
  assert.equal(out, "Book today.");
  assert.ok(!out.includes("{{"), "raw braces must never survive");
});

test("a stripped placeholder does not leave a space before punctuation", () => {
  assert.equal(personaliseStarterCopy("Ask for {{nope}}.", CTX), "Ask for.");
  assert.equal(personaliseStarterCopy("{{nope}} Hello", CTX), "Hello");
});

test("an unterminated {{ is left exactly as typed", () => {
  const input = "Two braces {{ and then nothing";
  assert.equal(personaliseStarterCopy(input, CTX), input);
});

test("single braces are never touched (the i18n catalog's {brand} convention)", () => {
  const input = "Welcome to {brand}, powered by { x } and }{";
  assert.equal(personaliseStarterCopy(input, CTX), input);
});

test("a backslash escapes literal double braces", () => {
  assert.equal(
    personaliseStarterCopy("Type \\{{business.name}} to insert your name.", CTX),
    "Type {{business.name}} to insert your name.",
  );
  // A backslash that is not guarding a placeholder is untouched.
  assert.equal(personaliseStarterCopy("C:\\Users", CTX), "C:\\Users");
});

test("a string with no placeholders is returned by reference", () => {
  const input = "A curated roster, ready for your next production.";
  assert.equal(personaliseStarterCopy(input, CTX), input);
});

// ── the tree walk ─────────────────────────────────────────────────────────

function heading(id: string, text: string): BuilderNode {
  return { id, kind: "heading", props: { text, level: 2 } };
}

test("a tree with no placeholders passes through IDENTITY-unchanged", () => {
  const tree: BuilderNodeTree = [
    {
      id: "root",
      kind: "container",
      props: { layout: "stack" },
      children: [
        heading("h1", "Come see what we do."),
        {
          id: "b1",
          kind: "button",
          props: { label: "Start an inquiry", href: "/book" },
        },
      ],
    },
  ];
  const out = personaliseStarterBuilderTree(tree, CTX);
  assert.equal(out, tree, "unchanged trees must be returned by reference");
  assert.deepEqual(out, tree);
});

test("substitutes through nested children, arrays, and responsive buckets", () => {
  const tree: BuilderNodeTree = [
    {
      id: "root",
      kind: "container",
      props: {
        layout: "stack",
        responsive: { mobile: { layout: "stack" } },
        style: { responsive: { tablet: { align: "center" } } },
      },
      children: [
        {
          id: "split",
          kind: "split",
          props: {},
          children: [
            heading("h1", "{{business.name}}"),
            {
              id: "acc",
              kind: "accordion",
              props: {},
              children: [
                {
                  id: "acc-1",
                  kind: "accordion_item",
                  props: { title: "About {{business.name}}" },
                  children: [
                    {
                      id: "p1",
                      kind: "paragraph",
                      props: {
                        text: "{{audience: agency=We represent artists.|else=We work.}}",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "nav",
          kind: "nav",
          props: {
            brand: "{{business.name}}",
            links: [
              {
                id: "l1",
                label: "Book {{business.name}}",
                href: "/book?ref={{business.name}}",
                children: [
                  { id: "l1a", label: "Ask {{business.name}}", href: "/ask" },
                ],
              },
            ],
          },
        },
        {
          id: "img",
          kind: "image",
          props: {
            src: "/photos/{{business.name}}.jpg",
            alt: "The team at {{business.name}}",
          },
        },
      ],
    },
  ];

  const out = personaliseStarterBuilderTree(tree, CTX);
  const blob = JSON.stringify(out);

  // Six copy leaves: heading text, accordion title, nav brand, two nav labels
  // (one of them a nested submenu link), image alt.
  assert.equal(blob.split("Riviera Maya Work").length - 1, 6, blob);
  assert.ok(blob.includes("We represent artists."));
  // The only surviving braces are the two machine values (href, src).
  assert.equal(blob.split("{{").length - 1, 2, blob);
  assert.ok(blob.includes("/book?ref={{business.name}}"));
  assert.ok(blob.includes("/photos/{{business.name}}.jpg"));
  // Nested submenu label reached.
  assert.ok(blob.includes("Ask Riviera Maya Work"));
  // Responsive buckets are walked (they carry no copy) and survive intact.
  assert.deepEqual(
    (out[0] as { props: { responsive?: unknown } }).props.responsive,
    { mobile: { layout: "stack" } },
  );
});

test("placeholders in NON-copy props are left completely alone", () => {
  const tree: BuilderNodeTree = [
    {
      id: "root",
      kind: "container",
      props: {
        layout: "stack",
        style: { customCss: ".x{content:'{{business.name}}'}" },
      },
      children: [
        {
          id: "b1",
          kind: "button",
          props: { label: "Go", href: "/x?q={{business.name}}" },
        },
        {
          id: "img",
          kind: "image",
          props: { src: "{{business.name}}.jpg", alt: "Studio" },
        },
        {
          id: "f1",
          kind: "form",
          props: {
            // `name` is the SUBMISSION KEY, not copy. Never rewritten.
            fields: [
              { id: "f", name: "{{business.name}}", type: "text", label: "Name" },
            ],
            honeypotName: "{{business.name}}",
          },
        },
        {
          id: "e1",
          kind: "section_embed",
          props: {
            sectionTypeKey: "hero",
            config: { headline: "{{business.name}}" },
          },
        },
        {
          id: "p1",
          kind: "paragraph",
          props: {
            text: "Plain",
            // A data SOURCE PATH, not copy.
            fieldBindings: { text: "{{business.name}}" },
          },
        },
      ],
    },
  ];

  const out = personaliseStarterBuilderTree(tree, CTX);
  assert.deepEqual(out, tree);
  assert.equal(out, tree, "a tree whose only braces are in non-copy props is untouched");
});

test("i18n overlays, instance overrides and experiment overrides are personalised", () => {
  const tree: BuilderNodeTree = [
    {
      id: "h1",
      kind: "heading",
      props: { text: "{{business.name}}", level: 1 },
      i18n: {
        es: {
          text: "Bienvenido a {{business.name}}",
          "sharedContent.eyebrow": "Sobre {{business.name}}",
          href: "/es?q={{business.name}}",
        },
      },
    },
    {
      id: "c1",
      kind: "container",
      props: {
        layout: "stack",
        instanceOf: "cmp-1",
        instanceOverrides: {
          slot: {
            text: "Hello {{business.name}}",
            href: "/x?{{business.name}}",
            slots: { deep: { text: "Deep {{business.name}}" } },
          },
        },
      },
      children: [],
    },
  ];

  const out = personaliseStarterBuilderTree(tree, CTX);
  const blob = JSON.stringify(out);
  assert.ok(!blob.includes("Bienvenido a {{"));
  assert.ok(blob.includes("Bienvenido a Riviera Maya Work"));
  assert.ok(blob.includes("Sobre Riviera Maya Work"), "dotted i18n keys resolve");
  assert.ok(blob.includes("Deep Riviera Maya Work"), "nested instance slots resolve");
  // href stays a machine value, inside i18n and inside an instance override.
  assert.ok(blob.includes("/es?q={{business.name}}"));
  assert.ok(blob.includes("/x?{{business.name}}"));
});

test("repeater field-binding tokens are not stripped as unknown placeholders", () => {
  const tree: BuilderNodeTree = [
    {
      id: "step",
      kind: "heading",
      props: {
        text: "{{num}}",
        level: 1,
        fieldBindings: { text: "num" },
      },
    },
  ];
  const out = personaliseStarterBuilderTree(tree, CTX);
  const heading = out[0];
  assert.ok(heading?.kind === "heading");
  assert.equal(heading.props.text, "{{num}}");
});

function collectBoundDisplayTokens(tree: BuilderNodeTree): string[] {
  const found: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const rec = value as Record<string, unknown>;
    const bindings = rec.fieldBindings;
    if (bindings && typeof bindings === "object" && !Array.isArray(bindings)) {
      for (const key of Object.keys(bindings as Record<string, unknown>)) {
        const sibling = rec[key];
        if (typeof sibling === "string" && sibling.includes("{{")) {
          found.push(sibling);
        }
      }
    }
    for (const child of Object.values(rec)) walk(child);
  };
  walk(tree);
  return found;
}

test("a real repeater-bearing PAGE_DESIGN keeps every bound {{token}}", () => {
  const designs = PAGE_DESIGNS.filter(
    (design) => collectBoundDisplayTokens(design.tree).length > 0,
  );
  assert.ok(
    designs.some((design) => design.id === "impronta"),
    "impronta ({{num}}) must be in the fixture set — the old suite passed because no repeater design was used",
  );
  assert.ok(
    designs.length >= 5,
    "expected multiple repeater-bearing PAGE_DESIGNS; the suite used to pass because none were used",
  );
  for (const design of designs) {
    const tokens = collectBoundDisplayTokens(design.tree);
    const after = JSON.stringify(personaliseStarterBuilderTree(design.tree, CTX));
    for (const token of tokens) {
      assert.ok(
        after.includes(token),
        `${design.id} stripped bound repeater token ${token}`,
      );
    }
  }
});

test("an empty tree and a non-array input are safe", () => {
  const empty: BuilderNodeTree = [];
  assert.equal(personaliseStarterBuilderTree(empty, CTX), empty);
  assert.equal(
    personaliseStarterBuilderTree(null as unknown as BuilderNodeTree, CTX),
    null,
  );
});
