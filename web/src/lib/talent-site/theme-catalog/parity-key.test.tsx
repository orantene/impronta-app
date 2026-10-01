/**
 * Template factory, goal 5c: the stable matching contract. Every kit section a
 * design composes (and its shell header / footer) must render
 * `data-parity-key="<slotKey>"`, so the parity tool matches a mockup unit to a
 * product section by key, not by selector heuristics.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TalentSiteSocket } from "@/components/talent-site/talent-site-socket";

import { anchorIdAttrs, parityKeyAttrs } from "@/lib/site-admin/builder-node/anchor-id";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { DEMO_REGISTRY } from "@/lib/talent-site/demos/registry";

import { BUILTIN_DESIGNS } from "./builtins";
import { COLLECTION_DESIGNS } from "./collection/designs";
import { MAISON_BUILTIN_DESIGN } from "./maison/builtins";
import { TALENT_KIT_SECTIONS, TALENT_KIT_SHELL } from "./section-kit";

const KEYS: ReadonlySet<string> = new Set([
  ...Object.values(TALENT_KIT_SECTIONS).map((s) => s.slotKey),
  ...Object.values(TALENT_KIT_SHELL).map((s) => s.slotKey),
]);

function slotKeysIn(nodes: readonly BuilderNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    const k = (n.props as Record<string, unknown> | undefined)?.slotKey;
    if (typeof k === "string" && KEYS.has(k)) out.add(k);
    const children = (n as { children?: BuilderNode[] }).children;
    if (Array.isArray(children)) slotKeysIn(children, out);
  }
  return out;
}

function html(nodes: BuilderNode[]): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, { mode: "freeform", includeRendererStyles: false, includeFontLinks: false }),
  );
}

test("parityKeyAttrs emits the slotKey, never a free-form value", () => {
  assert.deepEqual(parityKeyAttrs({ props: { slotKey: "hero" } }), { "data-parity-key": "hero" });
  assert.deepEqual(parityKeyAttrs({ props: { slotKey: "bad key!" } }), {});
  assert.deepEqual(parityKeyAttrs({ props: {} }), {});
  // the key survives an operator-typed anchor override
  assert.deepEqual(anchorIdAttrs({ anchorId: "Mine", props: { slotKey: "about" } }), {
    id: "mine",
    "data-parity-key": "about",
  });
});

const DESIGNS = [...BUILTIN_DESIGNS, MAISON_BUILTIN_DESIGN, ...COLLECTION_DESIGNS];

test("the sweep covers every in-code design", () => {
  assert.ok(DESIGNS.length >= 11, `expected the in-code designs, got ${DESIGNS.length}`);
});

/** Sections that render nothing without their data (no photos / no reviews / no zone): by design. */
const DATA_DEPENDENT = new Set(["before_after", "aftercare", "reviews", "visit", "location", "contact"]);

for (const d of DESIGNS) {
  test(`${d.slug}: every kit section and shell landmark renders data-parity-key`, () => {
    const payload = d.buildPayload();
    let rendered = 0;
    for (const [label, tree] of [["homeTree", payload.homeTree], ["shellTree", payload.shellTree]] as const) {
      for (const node of tree) {
        const keys = slotKeysIn([node]);
        // the curated site_header `section` is rendered by PublishedShell (covered below)
        if (node.kind === "section") {
          assert.equal(typeof (node.props as Record<string, unknown>).slotKey, "string", `${d.slug} ${label}: section landmark has no slotKey`);
          continue;
        }
        const top = (node.props as Record<string, unknown>).slotKey;
        if (typeof top !== "string") continue;
        const out = html([node]);
        if (out === "" && DATA_DEPENDENT.has(top)) continue;
        assert.match(out, new RegExp(`data-parity-key="${top}"`), `${d.slug} ${label}: "${top}" rendered without data-parity-key (keys inside: ${[...keys].join(",")})`);
        rendered += 1;
      }
    }
    assert.ok(rendered >= 3, `${d.slug}: only ${rendered} keyed sections rendered`);
  });
}

test("every kit section builder renders its parity key", () => {
  // the shared builders feed every design, so a miss here is a miss in all of them
  for (const [slot, { slotKey }] of Object.entries(TALENT_KIT_SECTIONS)) {
    const owner = DESIGNS.flatMap((d) => d.buildPayload().homeTree).find((n) => (n.props as Record<string, unknown>).slotKey === slotKey);
    if (!owner) continue; // slot not used by an in-code design (the builder is covered by the static kit test)
    if (DATA_DEPENDENT.has(slotKey) && html([owner]) === "") continue;
    assert.match(html([owner]), new RegExp(`data-parity-key="${slotKey}"`), `slot ${slot}`);
  }
});

test("the shell wrappers and the socket carry the key", () => {
  const shell = readFileSync(join(process.cwd(), "src/components/site-shell/PublishedShell.tsx"), "utf8");
  assert.equal((shell.match(/data-parity-key=\{/g) ?? []).length, 2, "both PublishedShell wrappers (legacy slot + node) emit data-parity-key");
  const socket = renderToStaticMarkup(
    TalentSiteSocket({ model: { siteGroupLabel: "S", tulalaGroupLabel: "T", langGroupLabel: "L", siteLinks: [], tulalaLinks: [], languages: [], credit: null } }) as ReactElement,
  );
  assert.match(socket, /data-parity-key="socket"/);
});

// ---------------------------------------------------------------- parity maps (goal 5f)
// web/design-references/<slug>/parity-map.json must stay true to the renderer, the registry and the pinned mockup.
interface MapSection {
  key: string;
  unit: string | null;
  parityKey: string | null;
  fallback?: string[];
}
interface ParityMap {
  design: string;
  referenceDemo: { profileCode: string; name: string };
  order: string[];
  sections: MapSection[];
}

for (const design of ["maison-v2", "folio"]) {
  test(`${design}: parity-map.json agrees with the registry, the renderer and the mockup`, () => {
    const dir = join(process.cwd(), "design-references", design);
    const raw = readFileSync(join(dir, "parity-map.json"), "utf8");
    const map = JSON.parse(raw) as ParityMap;
    assert.equal(map.design, design);

    // 1. the reference demo is the registry's reference for this design
    const ref = DEMO_REGISTRY.find((d) => d.design === design && d.reference);
    assert.ok(ref, `no reference demo registered for ${design}`);
    assert.equal(map.referenceDemo.profileCode, ref.profileCode);

    // 2. every parityKey is a key the design really renders (or a shell / socket key)
    const entry = DESIGNS.find((d) => d.slug === design);
    assert.ok(entry);
    const payload = entry.buildPayload();
    const rendered = html([...payload.shellTree.filter((n) => n.kind !== "section"), ...payload.homeTree]);
    const keys = new Set([...rendered.matchAll(/data-parity-key="([^"]+)"/g)].map((m) => m[1]));
    for (const n of payload.shellTree) {
      if (n.kind === "section") keys.add(String((n.props as Record<string, unknown>).slotKey));
    }
    keys.add("socket");
    for (const s of map.sections) {
      if (s.parityKey) {
        assert.ok(keys.has(s.parityKey), `${design}: parityKey "${s.parityKey}" (${s.key}) is not rendered (has: ${[...keys].join(", ")})`);
      } else {
        assert.ok((s.fallback ?? []).length > 0, `${design}: ${s.key} has neither a parityKey nor fallback selectors`);
      }
    }

    // 3. every unit is a data-w type in the pinned mockup
    const indexHtml = readFileSync(join(dir, "index.html"), "utf8");
    const units = new Set([...indexHtml.matchAll(/data-w="([^"$]+?)(?: ·[^"]*)?"/g)].map((m) => m[1]));
    for (const s of map.sections) {
      if (s.unit) assert.ok(units.has(s.unit), `${design}: unit "${s.unit}" is not a data-w type in index.html (has: ${[...units].join(", ")})`);
    }

    // 4. structure: unique keys, order covers every section, no fn: heuristics
    assert.equal(new Set(map.sections.map((s) => s.key)).size, map.sections.length);
    assert.deepEqual([...map.order].sort(), map.sections.map((s) => s.key).sort());
    assert.doesNotMatch(raw, /"fn:/);
  });
}
