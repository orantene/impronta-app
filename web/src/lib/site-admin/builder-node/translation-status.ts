/**
 * Freeform translation status — pure tree comparison, no React, no IO.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Legacy slot surfaces stored EN/ES inside the same node (`node.i18n`
 * overlay), so LocaleFieldTabs could show a per-language dot on every text
 * field. Freeform pages store ONE `cms_pages` row per locale instead, which
 * makes the overlay tabs the WRONG tool there: an overlay authored on the EN
 * row never renders on `/es`, because the public route loads strictly the
 * `(locale, slug)` row. The audit power the tabs provided ("what is missing
 * in Spanish, component by component") still has to exist — it just has to
 * compare the two rows' trees instead of one node's overlay.
 *
 * This module does that comparison: walk the CURRENT page's tree, find each
 * text-bearing prop, match it against the SIBLING locale's tree, and classify.
 *
 * MATCHING RULES (deliberately conservative):
 *   1. Stable node id — the strong signal. When the ES page was cloned from
 *      EN, ids survive, and edits to either side keep the match.
 *   2. Tree-position + kind — the fallback for rebuilt pages: the path of
 *      child indices AND the node kind at every step must agree.
 *   3. Anything else is reported as `no_counterpart`, never guessed — a wrong
 *      guess would mark a missing translation as done.
 *
 * STATUS PER TEXT PROP:
 *   translated      — counterpart has a non-empty value that differs.
 *   identical       — counterpart value is byte-identical after trimming AND
 *                     the value is real language. Advisory, not an error:
 *                     brand names are legitimately identical in both.
 *   not_translatable— byte-identical, but the value carries no language at all
 *                     (numerals, symbols, roman numerals). Never a finding.
 *   sibling_empty   — counterpart node exists but the prop is empty/missing.
 *   no_counterpart  — no node matched on the sibling page.
 */

import type { BuilderNode } from "./types";

/**
 * The prop names the inspector's localizable text fields edit
 * (`BuilderNodeLocalizableTextField` call sites: alt | brand | label | text |
 * title). Any node kind carrying one of these as a non-empty string
 * participates; structural kinds (container, spacer, …) fall out naturally
 * because they carry none of them.
 */
const TEXT_PROP_NAMES = ["text", "label", "title", "alt", "brand"] as const;
type TextPropName = (typeof TEXT_PROP_NAMES)[number];

export type TranslationTextStatus =
  | "translated"
  | "identical"
  | "not_translatable"
  | "sibling_empty"
  | "no_counterpart";

/**
 * True when a value carries no translatable language: pure numerals, symbols,
 * stat figures, step numbers, roman numerals.
 *
 * WHY: the first live run on the Impronta homepage reported 14 "identical"
 * props. Thirteen were `<24h`, `100%`, `27+`, `5`, `I.`, `II.`, `01`–`04` and a
 * lone `"` glyph — values that are SUPPOSED to be byte-identical in every
 * language. Only one ("Performers") was a real word worth a second look. An
 * advisory that is 93% noise trains the operator to ignore it, so these are
 * classified separately instead of shouting.
 *
 * The test is deliberately conservative — it must never swallow a short real
 * word. A value counts as non-linguistic only when it has no run of two or
 * more letters, OR it is a bare roman numeral (the one case where a 2+ letter
 * run still isn't language).
 */
export function isNonLinguisticValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  // Bare roman numeral, optionally followed by . or ) — "I.", "II", "IV)".
  if (/^[IVXLCDM]+[.)]?$/.test(trimmed)) return true;
  // No run of 2+ letters anywhere → digits, symbols, or a single stray letter
  // like the "h" in "<24h".
  return !/\p{L}{2,}/u.test(trimmed);
}

export interface TranslationRow {
  /** Node id on the CURRENT page (locate target). */
  nodeId: string;
  kind: string;
  prop: TextPropName;
  /** Trimmed current-page value (always non-empty — empty props are skipped). */
  currentText: string;
  /** Trimmed sibling value, or null when absent/empty. */
  siblingText: string | null;
  /** How the counterpart was found; null when it was not. */
  matchedBy: "id" | "position" | null;
  status: TranslationTextStatus;
  /** Human label for the row: layerLabel if authored, else a text excerpt. */
  label: string;
}

export interface TranslationReport {
  rows: ReadonlyArray<TranslationRow>;
  counts: Record<TranslationTextStatus, number>;
  /** Text props found on the sibling page whose node has no counterpart on
   *  the current page — content that would silently disappear if the current
   *  page were treated as the source of truth. */
  siblingOnlyCount: number;
  /** Total text props on the current page. */
  total: number;
}

interface FlatTextEntry {
  nodeId: string;
  kind: string;
  /** Path signature: `kind@idx` per ancestor step, joined. */
  pathKey: string;
  prop: TextPropName;
  value: string;
  layerLabel: string | null;
  /** The node's translation overlay, for the one-design-per-page report. */
  overlay: Record<string, Record<string, string>> | null;
}

function textPropsOf(node: BuilderNode): Array<{ prop: TextPropName; value: string }> {
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props || typeof props !== "object") return [];
  const out: Array<{ prop: TextPropName; value: string }> = [];
  for (const name of TEXT_PROP_NAMES) {
    const raw = props[name];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    out.push({ prop: name, value: trimmed });
  }
  return out;
}

function flattenTextEntries(tree: ReadonlyArray<BuilderNode>): FlatTextEntry[] {
  const out: FlatTextEntry[] = [];
  const walk = (nodes: ReadonlyArray<BuilderNode>, parentKey: string) => {
    nodes.forEach((node, index) => {
      const pathKey = `${parentKey}/${node.kind}@${index}`;
      const layerLabel =
        typeof (node.props as { layerLabel?: unknown })?.layerLabel === "string"
          ? ((node.props as { layerLabel: string }).layerLabel.trim() || null)
          : null;
      const overlay =
        (node as { i18n?: Record<string, Record<string, string>> }).i18n ??
        ((node.props as { i18n?: Record<string, Record<string, string>> })?.i18n ?? null);
      for (const { prop, value } of textPropsOf(node)) {
        out.push({
          nodeId: node.id,
          kind: node.kind,
          pathKey,
          prop,
          value,
          layerLabel,
          overlay,
        });
      }
      const children = (node as { children?: BuilderNode[] }).children;
      if (Array.isArray(children) && children.length > 0) {
        walk(children, pathKey);
      }
    });
  };
  walk(tree, "");
  return out;
}

function excerpt(value: string, max = 48): string {
  // rich_text values are HTML — strip tags for the row label only (the
  // comparison itself stays on the raw value, so markup edits still count).
  const plain = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

/**
 * ONE DESIGN PER PAGE — the per-element translation report for a single tree.
 *
 * The page's base props are the design language; `locale`'s text lives in each
 * node's `i18n` overlay. So the whole audit is a walk of ONE tree, with no
 * sibling row to fetch and no matching to get wrong:
 *
 *   translated       — the overlay carries a value for this locale.
 *   identical        — the overlay repeats the base text verbatim.
 *   not_translatable — no overlay, but the base value carries no language at
 *                      all (numerals, symbols) — never a finding.
 *   no_counterpart   — no overlay value: this element is NOT translated. This
 *                      is the row the operator is looking for.
 *
 * `sibling_empty` cannot occur here (there is no sibling row); it stays in the
 * status union so the panel's rendering table needs no special-casing.
 */
export function buildOverlayTranslationReport(
  tree: ReadonlyArray<BuilderNode>,
  locale: string,
): TranslationReport {
  const entries = flattenTextEntries(tree);
  const rows: TranslationRow[] = entries.map((entry) => {
    const translated = entry.overlay?.[locale]?.[entry.prop]?.trim() ?? "";
    let status: TranslationTextStatus;
    if (translated) {
      status = translated === entry.value ? "identical" : "translated";
    } else {
      status = isNonLinguisticValue(entry.value) ? "not_translatable" : "no_counterpart";
    }
    return {
      nodeId: entry.nodeId,
      kind: entry.kind,
      prop: entry.prop,
      currentText: entry.value,
      siblingText: translated || null,
      matchedBy: translated ? "id" : null,
      status,
      label: entry.layerLabel ?? excerpt(entry.value),
    };
  });

  const counts: Record<TranslationTextStatus, number> = {
    translated: 0,
    identical: 0,
    not_translatable: 0,
    sibling_empty: 0,
    no_counterpart: 0,
  };
  for (const row of rows) counts[row.status] += 1;

  // Nothing can exist "only on the other side" when there is no other side.
  return { rows, counts, siblingOnlyCount: 0, total: rows.length };
}

/**
 * Compare the current page's text props against the sibling locale's tree.
 * Pass `siblingTree: null` when the sibling page does not exist — every row
 * then reports `no_counterpart`, which is exactly the truth.
 */
export function buildTranslationReport(
  currentTree: ReadonlyArray<BuilderNode>,
  siblingTree: ReadonlyArray<BuilderNode> | null,
): TranslationReport {
  const current = flattenTextEntries(currentTree);
  const sibling = siblingTree ? flattenTextEntries(siblingTree) : [];

  // Sibling lookups: by node id, then by (pathKey, prop) for position matches.
  const siblingById = new Map<string, Map<TextPropName, FlatTextEntry>>();
  const siblingByPath = new Map<string, FlatTextEntry>();
  for (const entry of sibling) {
    const byProp = siblingById.get(entry.nodeId) ?? new Map<TextPropName, FlatTextEntry>();
    byProp.set(entry.prop, entry);
    siblingById.set(entry.nodeId, byProp);
    siblingByPath.set(`${entry.pathKey}::${entry.prop}`, entry);
  }
  // Sibling NODES (not just text entries) by id and path, so a counterpart
  // node whose prop is empty classifies as sibling_empty, not no_counterpart.
  const siblingNodeIds = new Set<string>();
  const siblingNodePaths = new Set<string>();
  if (siblingTree) {
    const walk = (nodes: ReadonlyArray<BuilderNode>, parentKey: string) => {
      nodes.forEach((node, index) => {
        const pathKey = `${parentKey}/${node.kind}@${index}`;
        siblingNodeIds.add(node.id);
        siblingNodePaths.add(pathKey);
        const children = (node as { children?: BuilderNode[] }).children;
        if (Array.isArray(children) && children.length > 0) walk(children, pathKey);
      });
    };
    walk(siblingTree, "");
  }

  const matchedSiblingKeys = new Set<string>();
  const rows: TranslationRow[] = current.map((entry) => {
    const idMatch = siblingById.get(entry.nodeId)?.get(entry.prop) ?? null;
    const pathMatch = idMatch ? null : siblingByPath.get(`${entry.pathKey}::${entry.prop}`) ?? null;
    const counterpart = idMatch ?? pathMatch;
    const matchedBy: TranslationRow["matchedBy"] = idMatch
      ? "id"
      : pathMatch
        ? "position"
        : null;

    let status: TranslationTextStatus;
    let siblingText: string | null = null;
    if (counterpart) {
      matchedSiblingKeys.add(`${counterpart.nodeId}::${counterpart.prop}`);
      siblingText = counterpart.value;
      status =
        counterpart.value === entry.value
          ? isNonLinguisticValue(entry.value)
            ? "not_translatable"
            : "identical"
          : "translated";
    } else if (siblingNodeIds.has(entry.nodeId) || siblingNodePaths.has(entry.pathKey)) {
      // The NODE exists over there; this particular prop is empty/missing.
      status = "sibling_empty";
    } else {
      status = "no_counterpart";
    }

    return {
      nodeId: entry.nodeId,
      kind: entry.kind,
      prop: entry.prop,
      currentText: entry.value,
      siblingText,
      matchedBy,
      status,
      label: entry.layerLabel ?? excerpt(entry.value),
    };
  });

  const counts: Record<TranslationTextStatus, number> = {
    translated: 0,
    identical: 0,
    not_translatable: 0,
    sibling_empty: 0,
    no_counterpart: 0,
  };
  for (const row of rows) counts[row.status] += 1;

  const siblingOnlyCount = sibling.filter(
    (entry) => !matchedSiblingKeys.has(`${entry.nodeId}::${entry.prop}`),
  ).length;

  return { rows, counts, siblingOnlyCount, total: rows.length };
}
