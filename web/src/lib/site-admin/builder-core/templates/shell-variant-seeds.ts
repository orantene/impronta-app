/**
 * shell-variant-seeds.ts — the catalogue entry for each of the six shipped
 * shell variants: three headers, three footers.
 *
 * This file is the LISTING (slug, title, card copy, thumbnail, template kind).
 * The layouts themselves — the `BuilderNode[]` payloads — live in
 * `shell-variant-trees.ts`; see that file for the design rules they follow and
 * for why they are authored in TypeScript rather than as SQL literals.
 *
 * The migration that seeds `builder_templates` is GENERATED from here
 * (`scripts/gen-shell-variant-seed.mjs`), so the two can never disagree, and
 * `shell-variant-seeds.test.ts` re-asserts the invariants the generator
 * silently depends on.
 *
 * ID STABILITY: node ids are deterministic and human-readable. They are NOT the
 * ids that reach a tenant — `applyShellTemplateToTree` re-mints every node on
 * apply — but stable ids keep the generated SQL byte-identical between runs, so
 * regenerating produces an empty diff when nothing changed.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  footerColumnsNewsletter,
  footerEditorialWordmark,
  footerSlimLine,
  headerEditorialTagline,
  headerMinimalCentre,
  headerSplitActions,
  resetShellVariantIds,
} from "./shell-variant-trees";

// ── seed rows ────────────────────────────────────────────────────────────────

export interface ShellVariantSeed {
  slug: string;
  kind: "shell_header" | "shell_footer";
  title: string;
  description: string;
  category: string;
  tags: string[];
  /** Static preview served from `web/public/builder-previews/`. */
  previewImageUrl: string;
  buildTree: () => BuilderNode[];
}

/**
 * Ordered header-family then footer-family. The migration inserts them with a
 * stepped `updated_at` so the gallery's default `ORDER BY updated_at DESC`
 * presents them in this order rather than in commit order.
 */
export const SHELL_VARIANT_SEEDS: ReadonlyArray<ShellVariantSeed> = [
  {
    slug: "shell-header-minimal-centre",
    kind: "shell_header",
    title: "Minimal, centre logo",
    description:
      "Centred wordmark with the navigation on the line below. Quiet, symmetrical, gets out of the way of the page.",
    category: "navigation",
    tags: ["header", "minimal", "centered", "shell"],
    previewImageUrl: "/builder-previews/shell-header-minimal-centre.svg",
    buildTree: headerMinimalCentre,
  },
  {
    slug: "shell-header-split",
    kind: "shell_header",
    title: "Split nav and action",
    description:
      "Navigation on the left, wordmark centred, one call to action on the right. The workhorse three-column bar.",
    category: "navigation",
    tags: ["header", "split", "cta", "shell"],
    previewImageUrl: "/builder-previews/shell-header-split.svg",
    buildTree: headerSplitActions,
  },
  {
    slug: "shell-header-editorial",
    kind: "shell_header",
    title: "Editorial with tagline",
    description:
      "Large wordmark and a tagline stacked over a hairline rule, with the navigation beneath. Reads like a masthead.",
    category: "navigation",
    tags: ["header", "editorial", "masthead", "shell"],
    previewImageUrl: "/builder-previews/shell-header-editorial.svg",
    buildTree: headerEditorialTagline,
  },
  {
    slug: "shell-footer-slim",
    kind: "shell_footer",
    title: "Slim one-line",
    description:
      "Copyright, a short link row and social icons on a single line. For pages that already end on a strong call to action.",
    category: "navigation",
    tags: ["footer", "slim", "minimal", "shell"],
    previewImageUrl: "/builder-previews/shell-footer-slim.svg",
    buildTree: footerSlimLine,
  },
  {
    slug: "shell-footer-columns-newsletter",
    kind: "shell_footer",
    title: "Columns and newsletter",
    description:
      "Three link columns plus a newsletter block, over a legal row with social. The footer doing real navigation work.",
    category: "navigation",
    tags: ["footer", "columns", "newsletter", "shell"],
    previewImageUrl: "/builder-previews/shell-footer-columns-newsletter.svg",
    buildTree: footerColumnsNewsletter,
  },
  {
    slug: "shell-footer-editorial",
    kind: "shell_footer",
    title: "Editorial wordmark",
    description:
      "An oversized wordmark on the left with the link columns tucked to the right. The most magazine-like of the three.",
    category: "navigation",
    tags: ["footer", "editorial", "wordmark", "shell"],
    previewImageUrl: "/builder-previews/shell-footer-editorial.svg",
    buildTree: footerEditorialWordmark,
  },
];

/**
 * Build one seed's tree with a reset id counter, so ids are a function of the
 * template alone rather than of how many templates were built before it.
 */
export function buildShellVariantTree(seed: ShellVariantSeed): BuilderNode[] {
  resetShellVariantIds();
  const prefix = seed.slug.replace(/^shell-/, "");
  // Namespace ids by slug so two variants can never collide if both are ever
  // present in the same tree during a diff or a side-by-side preview.
  return seed.buildTree().map((node) => prefixNodeIds(node, prefix));
}

function prefixNodeIds(node: BuilderNode, prefix: string): BuilderNode {
  const next = { ...node, id: `${prefix}-${node.id}` } as BuilderNode;
  const children = (node as { children?: BuilderNode[] }).children;
  if (Array.isArray(children)) {
    (next as { children?: BuilderNode[] }).children = children.map((child) =>
      prefixNodeIds(child, prefix),
    );
  }
  return next;
}
