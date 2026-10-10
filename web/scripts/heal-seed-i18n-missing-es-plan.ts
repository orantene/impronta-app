/**
 * Pure inventory for TUL-369 heal planning.
 *
 * Counts stored builder trees whose base text is a known English seed
 * (`SEED_TEXT_ES` key) but lack a non-empty `props.i18n.es` for that leaf.
 * Heal path is a copy release (`npm run qa:release-theme-i18n`), not a silent
 * migration — this module never writes.
 */
import { localizablePropsForKind } from "../src/lib/i18n/builder-i18n-props";
import { listOverlayKey, localizableListSpecsForKind } from "../src/lib/i18n/builder-i18n-list-props";
import { HEADER_OVERLAY_PREFIX, headerLabelEntries } from "../src/lib/talent-site/header-i18n";
import {
  isTokenOnlyText,
  MODE_DEPENDENT_LABELS,
  SEED_TEXT_ES,
} from "../src/lib/talent-site/theme-catalog/seed-i18n";
import type { BuilderNodeKind } from "../src/lib/site-admin/builder-node/types";

export type TreeNode = {
  kind?: string;
  props?: Record<string, unknown>;
  children?: TreeNode[];
  slides?: TreeNode[];
};

export type MissingLeaf = {
  treeId: string;
  profileId: string;
  path: string;
  key: string;
  base: string;
};

export type HealInventory = {
  trees: number;
  profiles: number;
  leaves: number;
  missing: MissingLeaf[];
};

function walk(nodes: unknown, path: string, visit: (path: string, node: TreeNode) => void): void {
  if (!Array.isArray(nodes)) return;
  nodes.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const node = raw as TreeNode;
    const here = `${path}/${String(node.kind)}[${i}]`;
    visit(here, node);
    walk(node.children, here, visit);
    walk(node.slides, `${here}/slides`, visit);
  });
}

function esOverlay(props: Record<string, unknown> | undefined): Record<string, unknown> {
  const i18n = props?.i18n;
  if (!i18n || typeof i18n !== "object") return {};
  const es = (i18n as { es?: unknown }).es;
  return es && typeof es === "object" ? (es as Record<string, unknown>) : {};
}

function hasEs(es: Record<string, unknown>, key: string): boolean {
  const v = es[key];
  return typeof v === "string" && v.trim().length > 0;
}

/** True when `base` is an English seed that needs an es overlay (mode labels exempt). */
export function needsSeedEsOverlay(base: string): boolean {
  const t = base.trim();
  if (!t || isTokenOnlyText(t) || MODE_DEPENDENT_LABELS.includes(t)) return false;
  return Object.prototype.hasOwnProperty.call(SEED_TEXT_ES, t);
}

/** Scan one tree; append missing leaves. */
export function collectMissingLeaves(
  tree: unknown,
  meta: { treeId: string; profileId: string; treeName: string },
  out: MissingLeaf[],
): void {
  walk(tree, meta.treeName, (path, node) => {
    const props = (node.props ?? {}) as Record<string, unknown>;
    const es = esOverlay(props);
    const kind = (node.kind ?? "") as BuilderNodeKind;
    for (const prop of localizablePropsForKind(kind)) {
      const base = props[prop];
      if (typeof base !== "string" || !needsSeedEsOverlay(base)) continue;
      if (!hasEs(es, prop)) {
        out.push({ treeId: meta.treeId, profileId: meta.profileId, path: `${path}.${prop}`, key: prop, base });
      }
    }
    if (node.kind === "marquee" && Array.isArray(props.items)) {
      props.items.forEach((it, n) => {
        const text = it && typeof it === "object" ? (it as { text?: unknown }).text : undefined;
        if (typeof text !== "string" || !needsSeedEsOverlay(text)) return;
        const key = `items.${n}.text`;
        if (!hasEs(es, key)) {
          out.push({ treeId: meta.treeId, profileId: meta.profileId, path: `${path}.${key}`, key, base: text });
        }
      });
    }
    for (const spec of localizableListSpecsForKind(kind)) {
      const items = props[spec.list];
      if (!Array.isArray(items)) continue;
      items.forEach((item, n) => {
        for (const field of spec.fields) {
          const text = item && typeof item === "object" ? (item as Record<string, unknown>)[field] : undefined;
          if (typeof text !== "string" || !needsSeedEsOverlay(text)) continue;
          const key = listOverlayKey(spec.list, n, field);
          if (!hasEs(es, key)) {
            out.push({ treeId: meta.treeId, profileId: meta.profileId, path: `${path}.${key}`, key, base: text });
          }
        }
      });
    }
    if (node.kind === "section" && props.sectionTypeKey === "site_header") {
      for (const { key, text } of headerLabelEntries(props.sectionProps)) {
        if (!needsSeedEsOverlay(text)) continue;
        const overlayKey = `${HEADER_OVERLAY_PREFIX}${key}`;
        if (!hasEs(es, overlayKey)) {
          out.push({
            treeId: meta.treeId,
            profileId: meta.profileId,
            path: `${path}.${overlayKey}`,
            key: overlayKey,
            base: text,
          });
        }
      }
    }
  });
}

export function summarize(missing: readonly MissingLeaf[]): HealInventory {
  const trees = new Set(missing.map((m) => m.treeId));
  const profiles = new Set(missing.map((m) => m.profileId));
  return { trees: trees.size, profiles: profiles.size, leaves: missing.length, missing: [...missing] };
}

/** Format the operator-facing summary (heal = copy release, never silent SQL). */
export function formatHealSummary(inv: HealInventory, when: string): string {
  return [
    `TUL-369 missing i18n.es inventory (${when})`,
    `  trees:    ${inv.trees}`,
    `  profiles: ${inv.profiles}`,
    `  leaves:   ${inv.leaves}`,
    `Heal: npm run qa:release-theme-i18n -- --design <slug>  (copy release; then demos:rebuild / talent update).`,
    `Do not silent-migrate stored trees.`,
  ].join("\n");
}
