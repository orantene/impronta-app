/**
 * config-merge.test.ts — the three contracts that make an inspector save safe.
 *
 * The headline risk this file guards is the one the brief calls out by name:
 * "a footer landmark with operator-added freeform children keeps them across an
 * inspector save." That property has TWO halves:
 *
 *   - the STRUCTURAL half (this file): the props merge never emits a `children`
 *     key and never rebuilds the props object from a whitelist, so nothing the
 *     inspector writes can reach or erase the landmark subtree; and
 *   - the WIRING half (`actions.ts`): the save targets `cms_sections`, never
 *     `cms_pages.blocks`. That is asserted by `freeform-children-untouched.test.ts`
 *     as a static check over the action source, because a node test cannot reach
 *     a "use server" module.
 *
 * Both halves are needed. Neither alone proves the property.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { coerceLegacyHref } from "../links/link-ref";
import {
  editableHrefToLinkRef,
  linkRefToEditableHref,
  mergeFooterProps,
  readFooterValue,
} from "./config-merge";
import type { SiteFooterSectionValue } from "./types";

// ── contract 1: unknown keys survive ─────────────────────────────────────────

test("[F1] mergeFooterProps preserves props the inspector has never heard of", () => {
  const current = {
    variant: "standard",
    // The two that actually exist on the schema today…
    presentation: { paddingTop: "48px" },
    nodePresentation: { headline: { as: "h3" } },
    // …and a stand-in for whatever the schema grows next. This is the F5
    // regression: a whitelist-rebuilding editor drops all three.
    someFutureField: { deeply: { nested: true } },
  };

  const next = mergeFooterProps(current, { variant: "editorial" });

  assert.equal(next.variant, "editorial");
  assert.deepEqual(next.presentation, { paddingTop: "48px" });
  assert.deepEqual(next.nodePresentation, { headline: { as: "h3" } });
  assert.deepEqual(next.someFutureField, { deeply: { nested: true } });
});

// ── contract 2: an empty patch is a no-op ────────────────────────────────────

test("[F2] an empty patch returns structurally equal props", () => {
  const current = {
    brand: { label: "Nova" },
    columns: [{ heading: "Studio", links: [] }],
    legal: { copyright: "© Nova", links: [] },
    variant: "rich",
  };
  assert.deepEqual(mergeFooterProps(current, {}), current);
});

test("[F2] only the named keys are written", () => {
  const current = {
    brand: { label: "Nova", tagline: "Casting, curated" },
    columns: [{ heading: "Studio", links: [] }],
    tone: "deep",
  };
  const next = mergeFooterProps(current, { tone: "light" });
  assert.equal(next.tone, "light");
  // brand + columns untouched, same values.
  assert.deepEqual(next.brand, { label: "Nova", tagline: "Casting, curated" });
  assert.deepEqual(next.columns, [{ heading: "Studio", links: [] }]);
});

// ── contract 3: children never round-trip through the section row ────────────

test("[F3] mergeFooterProps never emits a `children` key", () => {
  const next = mergeFooterProps({ variant: "standard" }, { variant: "compact" });
  assert.equal("children" in next, false);
});

test("[F3] a stray `children` on the current props is dropped, not persisted", () => {
  // If a bad write ever put the landmark subtree on the section row, the footer
  // would have TWO competing homes for its children and a publish would pick
  // one arbitrarily. Drop it — `cms_pages.blocks` is the only store of record.
  const next = mergeFooterProps(
    { variant: "standard", children: [{ id: "x", kind: "paragraph" }] },
    {},
  );
  assert.equal("children" in next, false);
});

// ── brand field semantics ────────────────────────────────────────────────────

test("[F4] clearing a brand field deletes it rather than persisting an empty string", () => {
  const next = mergeFooterProps(
    { brand: { label: "Nova", logoUrl: "https://cdn.example/logo.svg" } },
    { brand: { logoUrl: "" } },
  );
  assert.deepEqual(next.brand, { label: "Nova" });
});

test("[F4] a brand patch merges per-field instead of replacing the object", () => {
  const next = mergeFooterProps(
    { brand: { label: "Nova", tagline: "Casting, curated" } },
    { brand: { label: "Nova Crew" } },
  );
  assert.deepEqual(next.brand, {
    label: "Nova Crew",
    tagline: "Casting, curated",
  });
});

// ── href round-trip ──────────────────────────────────────────────────────────

test("[F5] every single-textbox href kind round-trips through the editable string", () => {
  for (const href of [
    "/studio",
    "/directory?type=model",
    "#roster",
    "https://example.com/press",
    "mailto:hello@example.com",
    "tel:+15551234567",
  ]) {
    const ref = editableHrefToLinkRef(href);
    const back = linkRefToEditableHref(ref);
    assert.equal(
      back,
      href,
      `${href} did not survive the LinkRef round-trip (got ${back})`,
    );
    // …and re-coercing the flattened form yields the same structured kind, so a
    // save that touches an untouched row is a genuine no-op.
    assert.equal(coerceLegacyHref(back).kind, ref.kind, `kind drifted for ${href}`);
  }
});

test("[F5] a legacy plain-string href reads as itself", () => {
  assert.equal(linkRefToEditableHref("/legacy-path"), "/legacy-path");
});

// ── read projection ──────────────────────────────────────────────────────────

test("[F6] readFooterValue defaults an empty props object without throwing", () => {
  const value = readFooterValue({});
  assert.deepEqual(value.brand, {});
  assert.equal(value.brandDisplay, "image-and-text");
  assert.deepEqual(value.columns, []);
  assert.deepEqual(value.social, []);
  assert.deepEqual(value.legal, { links: [] });
  assert.equal(value.variant, "standard");
  assert.equal(value.tone, "follow");
});

test("[F6] readFooterValue drops malformed entries instead of crashing the drawer", () => {
  const value = readFooterValue({
    columns: [
      { heading: "Studio", links: [{ label: "About", href: { kind: "tenant-page", value: "/about" } }] },
      { heading: "   " }, // blank heading → dropped
      "not-an-object", // → dropped
    ],
    social: [
      { platform: "instagram", href: "https://instagram.com/nova" },
      { platform: "myspace", href: "https://example.com" }, // unknown → dropped
      { platform: "tiktok", href: "" }, // blank href → dropped
    ],
    variant: "not-a-variant", // → falls back
  });

  assert.equal(value.columns.length, 1);
  assert.deepEqual(value.columns[0], {
    heading: "Studio",
    links: [{ label: "About", href: "/about" }],
  });
  assert.deepEqual(value.social, [
    { platform: "instagram", href: "https://instagram.com/nova" },
  ]);
  assert.equal(value.variant, "standard");
});

test("[F6] read → merge → read is stable for a fully populated footer", () => {
  const value: SiteFooterSectionValue = {
    brand: { label: "Nova", tagline: "Casting, curated" },
    brandDisplay: "image-and-text",
    columns: [
      {
        heading: "Studio",
        links: [
          { label: "About", href: "/about" },
          { label: "Press", href: "https://example.com/press" },
        ],
      },
    ],
    social: [{ platform: "instagram", href: "https://instagram.com/nova" }],
    legal: {
      copyright: "© Nova Crew",
      links: [{ label: "Privacy", href: "/privacy" }],
    },
    variant: "editorial",
    tone: "light",
  };

  const props = mergeFooterProps({}, value);
  assert.deepEqual(readFooterValue(props), value);

  // A second identical save must not drift the stored shape.
  assert.deepEqual(mergeFooterProps(props, value), props);
});

// ── caps ─────────────────────────────────────────────────────────────────────

test("[F7] merge clamps to the schema's caps so a save can never fail validation", () => {
  const next = mergeFooterProps(
    {},
    {
      columns: Array.from({ length: 9 }, (_, i) => ({
        heading: `C${i}`,
        links: Array.from({ length: 12 }, (_, j) => ({
          label: `L${j}`,
          href: "/x",
        })),
      })),
      social: Array.from({ length: 11 }, () => ({
        platform: "instagram" as const,
        href: "https://instagram.com/nova",
      })),
      legal: {
        links: Array.from({ length: 9 }, () => ({ label: "L", href: "/x" })),
      },
    },
  );

  assert.equal((next.columns as unknown[]).length, 5);
  assert.equal(
    ((next.columns as Array<{ links: unknown[] }>)[0]!).links.length,
    8,
  );
  assert.equal((next.social as unknown[]).length, 6);
  assert.equal(((next.legal as { links: unknown[] }).links).length, 4);
});
