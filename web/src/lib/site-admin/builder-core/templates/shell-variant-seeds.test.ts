/**
 * shell-variant-seeds.test.ts — the invariants the six shipped variants must
 * hold, and that the generated migration silently depends on.
 *
 * The migration is machine-written from this module, so nothing here checks
 * SQL. What it checks is the set of properties that would produce a GREEN
 * migration and a BROKEN gallery:
 *
 *   - a duplicate slug → `ON CONFLICT (kind, slug)` collapses two variants into
 *     one and the gallery quietly shows five;
 *   - a hardcoded brand colour → the variant looks like the agency it was
 *     designed against on every tenant that applies it;
 *   - a `var()` with no literal fallback → the documented empty-collapse, i.e.
 *     an invisible header, with no error anywhere;
 *   - a preview path with no file behind it → a broken thumbnail on the exact
 *     cards whose entire value is being previewable;
 *   - non-deterministic ids → the generator rewrites the migration on every run
 *     and "is this hand-edited?" stops being answerable by `git diff`.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import path from "node:path";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  SHELL_VARIANT_SEEDS,
  buildShellVariantTree,
} from "./shell-variant-seeds";
import { applyShellTemplateToTree } from "./apply-shell-template-core";

const PUBLIC_DIR = path.join(process.cwd(), "public");

/** Only some node kinds carry children, so the union needs narrowing. */
function childrenOf(node: BuilderNode): ReadonlyArray<BuilderNode> {
  const children = (node as { children?: BuilderNode[] }).children;
  return Array.isArray(children) ? children : [];
}

function walk(nodes: ReadonlyArray<BuilderNode>, visit: (n: BuilderNode) => void) {
  for (const node of nodes) {
    visit(node);
    walk(childrenOf(node), visit);
  }
}

function allStyleValues(nodes: ReadonlyArray<BuilderNode>): string[] {
  const out: string[] = [];
  walk(nodes, (node) => {
    const props = node.props as Record<string, unknown>;
    const style = props.style;
    if (!style || typeof style !== "object") return;
    for (const value of Object.values(style as Record<string, unknown>)) {
      if (typeof value === "string") out.push(value);
    }
  });
  return out;
}

// ── shape ────────────────────────────────────────────────────────────────────

test("[V1] exactly three headers and three footers ship", () => {
  const headers = SHELL_VARIANT_SEEDS.filter((s) => s.kind === "shell_header");
  const footers = SHELL_VARIANT_SEEDS.filter((s) => s.kind === "shell_footer");
  assert.equal(headers.length, 3, "expected 3 shell_header variants");
  assert.equal(footers.length, 3, "expected 3 shell_footer variants");
  assert.equal(SHELL_VARIANT_SEEDS.length, 6);
});

test("[V1] slugs are unique — a collision silently merges two variants", () => {
  const slugs = SHELL_VARIANT_SEEDS.map((s) => s.slug);
  assert.equal(
    new Set(slugs).size,
    slugs.length,
    `duplicate slug in ${slugs.join(", ")} — ON CONFLICT (kind, slug) would collapse them`,
  );
});

test("[V1] every variant has a real title and description", () => {
  for (const seed of SHELL_VARIANT_SEEDS) {
    assert.ok(seed.title.trim().length > 3, `${seed.slug}: title too short`);
    assert.ok(
      seed.description.trim().length > 30,
      `${seed.slug}: the card description is the only prose an operator reads before applying — make it say what the layout does`,
    );
  }
});

// ── thumbnails ───────────────────────────────────────────────────────────────

test("[V2] every preview image exists in public/ and is same-origin", () => {
  for (const seed of SHELL_VARIANT_SEEDS) {
    assert.ok(
      seed.previewImageUrl.startsWith("/builder-previews/"),
      `${seed.slug}: preview must be an app-served path under /builder-previews/`,
    );
    const file = path.join(PUBLIC_DIR, seed.previewImageUrl.replace(/^\//, ""));
    assert.ok(
      existsSync(file),
      `${seed.slug}: no file at public${seed.previewImageUrl}. The card would render a broken image — and these six exist precisely so the operator can SEE which one they are picking.`,
    );
  }
});

test("[V2] preview paths are unique — six cards, six pictures", () => {
  const urls = SHELL_VARIANT_SEEDS.map((s) => s.previewImageUrl);
  assert.equal(new Set(urls).size, urls.length);
});

// ── tokens ───────────────────────────────────────────────────────────────────

/**
 * Colours that are not tenant-neutral. Gold / rust / amber is a standing UI
 * bar in this codebase ("no gold/rust accents — hated"), and a variant is the
 * worst place to smuggle one in: it lands on the shared shell of every page.
 */
const FORBIDDEN_HUES: ReadonlyArray<[RegExp, string]> = [
  [/#(?:d4af37|c9a227|b8860b|daa520)/i, "gold"],
  [/#(?:b7410e|8b4513|a0522d)/i, "rust"],
  [/\bamber\b/i, "amber"],
  [/#f59e0b|#d97706|#b45309/i, "amber (tailwind)"],
];

test("[V3] no gold, rust or amber anywhere in the six trees", () => {
  for (const seed of SHELL_VARIANT_SEEDS) {
    const values = allStyleValues(buildShellVariantTree(seed));
    for (const value of values) {
      for (const [pattern, name] of FORBIDDEN_HUES) {
        assert.ok(
          !pattern.test(value),
          `${seed.slug}: style value "${value}" contains ${name}. These variants ship on the shared shell of every page — the palette bar applies hardest here.`,
        );
      }
    }
  }
});

test("[V3] every colour is a theme token, and every token has a literal fallback", () => {
  // A bare hex is a hardcoded brand colour: the variant would look like the
  // agency it was designed against on every tenant that applied it.
  //
  // A `var()` WITHOUT a fallback is worse than wrong — per
  // `incident_token_var_cycle_silent_collapse`, an undeclared token collapses
  // the whole declaration to nothing, with no error. An invisible header.
  const COLOR_PROPS = /color|background|border|fill|stroke|shadow/i;

  for (const seed of SHELL_VARIANT_SEEDS) {
    walk(buildShellVariantTree(seed), (node) => {
      const style = (node.props as Record<string, unknown>).style;
      if (!style || typeof style !== "object") return;
      for (const [prop, raw] of Object.entries(style as Record<string, unknown>)) {
        if (typeof raw !== "string" || !COLOR_PROPS.test(prop)) continue;
        // Non-colour values legitimately live on colour-ish props
        // (`borderTopColor: 0px`, `boxShadow: none`). Only inspect values that
        // actually name a colour.
        const mentionsVar = raw.includes("var(");
        const mentionsHex = /#[0-9a-f]{3,8}/i.test(raw);
        if (!mentionsVar && !mentionsHex) continue;

        assert.ok(
          mentionsVar,
          `${seed.slug} · ${prop}: "${raw}" hardcodes a colour. Use a theme token so the variant adopts the tenant's brand.`,
        );
        // Every `var(--token-…` occurrence must be followed by a `,` fallback
        // before its closing paren.
        for (const match of raw.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
          assert.equal(
            match[2],
            ",",
            `${seed.slug} · ${prop}: var(${match[1]}) has no fallback. An undeclared token collapses the whole declaration silently — see incident_token_var_cycle_silent_collapse.`,
          );
        }
      }
    });
  }
});

// ── tree integrity ───────────────────────────────────────────────────────────

test("[V4] node ids are unique within each tree", () => {
  for (const seed of SHELL_VARIANT_SEEDS) {
    const seen = new Set<string>();
    walk(buildShellVariantTree(seed), (node) => {
      assert.ok(
        !seen.has(node.id),
        `${seed.slug}: duplicate node id ${node.id}`,
      );
      seen.add(node.id);
    });
  }
});

test("[V4] node ids are unique ACROSS the six trees", () => {
  // They are re-minted on apply, so a collision is not a live bug — but two
  // variants sharing an id makes a diff or a side-by-side preview incoherent,
  // and the slug prefix exists precisely to prevent it.
  const seen = new Map<string, string>();
  for (const seed of SHELL_VARIANT_SEEDS) {
    walk(buildShellVariantTree(seed), (node) => {
      const owner = seen.get(node.id);
      assert.equal(
        owner,
        undefined,
        `id ${node.id} is shared by ${owner} and ${seed.slug}`,
      );
      seen.set(node.id, seed.slug);
    });
  }
});

test("[V4] no variant ships a shell LANDMARK wrapper at its root", () => {
  // `templateTreeToLandmarkChildren` would unwrap a matching one and DROP a
  // mismatched one. Authoring the payload as plain content keeps the apply
  // path's behaviour obvious rather than dependent on that unwrapping.
  for (const seed of SHELL_VARIANT_SEEDS) {
    for (const node of buildShellVariantTree(seed)) {
      const typeKey = (node.props as { sectionTypeKey?: unknown }).sectionTypeKey;
      assert.ok(
        typeKey !== "site_header" && typeKey !== "site_footer",
        `${seed.slug}: root node is a landmark wrapper; ship the CONTENT, the apply supplies the landmark`,
      );
    }
  }
});

test("[V5] building a tree twice is byte-identical (the generator depends on it)", () => {
  for (const seed of SHELL_VARIANT_SEEDS) {
    assert.equal(
      JSON.stringify(buildShellVariantTree(seed)),
      JSON.stringify(buildShellVariantTree(seed)),
      `${seed.slug}: tree is not deterministic — the generated migration would churn on every run`,
    );
  }
});

// ── the apply contract ───────────────────────────────────────────────────────

test("[V6] applying a variant replaces its OWN landmark and preserves the other", () => {
  const currentTree: BuilderNode[] = [
    {
      id: "shell-header",
      kind: "section",
      props: { sectionTypeKey: "site_header", slotKey: "header", sectionId: "sec-h" },
      children: [
        { id: "existing-header-child", kind: "paragraph", props: { text: "old header" } },
      ],
    },
    {
      id: "shell-footer",
      kind: "section",
      props: { sectionTypeKey: "site_footer", slotKey: "footer", sectionId: "sec-f" },
      children: [
        { id: "operator-custom-block", kind: "paragraph", props: { text: "keep me" } },
      ],
    },
  ];

  for (const seed of SHELL_VARIANT_SEEDS) {
    const next = applyShellTemplateToTree({
      currentTree,
      templateTree: buildShellVariantTree(seed),
      kind: seed.kind,
    });

    assert.equal(next.length, 2, `${seed.slug}: result must stay [header, footer]`);
    const [header, footer] = next;
    assert.equal(header!.props.slotKey, "header");
    assert.equal(footer!.props.slotKey, "footer");

    const target = seed.kind === "shell_header" ? header! : footer!;
    const untouched = seed.kind === "shell_header" ? footer! : header!;

    // The target landmark got the variant's content…
    assert.ok(
      (target.children ?? []).length > 0,
      `${seed.slug}: target landmark has no children after apply`,
    );
    // …and the other landmark is verbatim, including the operator's own block.
    const untouchedIds = (untouched.children ?? []).map((c) => c.id);
    assert.deepEqual(
      untouchedIds,
      seed.kind === "shell_header"
        ? ["operator-custom-block"]
        : ["existing-header-child"],
      `${seed.slug}: applying a ${seed.kind} disturbed the OTHER landmark`,
    );
    // Slot addressability survives — a landmark minted without `sectionId`
    // binds to nothing and its children stop rendering on the published site.
    assert.equal(target.props.sectionId, seed.kind === "shell_header" ? "sec-h" : "sec-f");
  }
});

test("[V6] apply re-mints ids — the seed ids never reach a tenant tree", () => {
  const seed = SHELL_VARIANT_SEEDS[0]!;
  const seedIds = new Set<string>();
  walk(buildShellVariantTree(seed), (node) => seedIds.add(node.id));

  const next = applyShellTemplateToTree({
    currentTree: [],
    templateTree: buildShellVariantTree(seed),
    kind: seed.kind,
  });

  walk(next, (node) => {
    assert.ok(
      !seedIds.has(node.id),
      `applied tree reuses the shared template id ${node.id}; two tenants would collide`,
    );
  });
});
