/**
 * Structured revision diff — what changed, not just which ids exist.
 *
 * Default depth: copy, href, src, fill, type, reorder.
 * Full style lives in `styleDetails` for a Show-details disclosure.
 */

export type RevisionDiffProperty =
  | "text"
  | "href"
  | "src"
  | "fill"
  | "type"
  | "reorder";

export interface RevisionPropertyChange {
  property: RevisionDiffProperty;
  before: string;
  after: string;
}

export interface RevisionNodeChange {
  id: string;
  kind: string;
  label: string;
  op: "added" | "removed" | "changed" | "unchanged";
  properties: RevisionPropertyChange[];
  styleDetails?: Record<string, { before: string; after: string }>;
}

export interface RevisionStructuredDiff {
  nodes: RevisionNodeChange[];
  remainderCount: number;
  summary: { added: number; removed: number; changed: number };
}

type WalkedNode = {
  id: string;
  kind: string;
  label: string;
  index: number;
  text: string;
  href: string;
  src: string;
  fill: string;
  style: Record<string, string>;
};

const DEFAULT_MAX_NODES = 40;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function flattenNodes(
  nodes: unknown,
  out: WalkedNode[] = [],
  indexStart = 0,
): WalkedNode[] {
  if (!Array.isArray(nodes)) return out;
  nodes.forEach((raw, i) => {
    const rec = asRecord(raw);
    if (!rec) return;
    const props = asRecord(rec.props) ?? {};
    const style = asRecord(props.style) ?? asRecord(rec.style) ?? {};
    const id = asString(rec.id) || `anon-${out.length}`;
    const kind = asString(rec.kind) || "block";
    const text =
      asString(props.text) ||
      asString(props.label) ||
      asString(props.content) ||
      asString(rec.label);
    out.push({
      id,
      kind,
      label: text || kind,
      index: indexStart + i,
      text,
      href: asString(props.href),
      src: asString(props.src),
      fill:
        asString(style.backgroundColor) ||
        asString(style.background) ||
        asString(style.fill),
      style: Object.fromEntries(
        Object.entries(style)
          .filter(([, v]) => v !== undefined && v !== null && typeof v !== "object")
          .map(([k, v]) => [k, String(v)]),
      ),
    });
    flattenNodes(rec.children, out, 0);
  });
  return out;
}

function chip(value: string): string {
  if (!value) return "—";
  return value.length > 48 ? `${value.slice(0, 45)}…` : value;
}

export function computeRevisionStructuredDiff(
  treeA: unknown,
  treeB: unknown,
  opts?: { maxNodes?: number },
): RevisionStructuredDiff {
  const maxNodes = opts?.maxNodes ?? DEFAULT_MAX_NODES;
  const aNodes = flattenNodes(treeA);
  const bNodes = flattenNodes(treeB);
  const aById = new Map(aNodes.map((n) => [n.id, n]));
  const bById = new Map(bNodes.map((n) => [n.id, n]));

  const allIds = [...new Set([...aById.keys(), ...bById.keys()])];
  const nodes: RevisionNodeChange[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const id of allIds) {
    const before = aById.get(id);
    const after = bById.get(id);
    if (before && !after) {
      removed += 1;
      nodes.push({
        id,
        kind: before.kind,
        label: before.label,
        op: "removed",
        properties: [],
      });
      continue;
    }
    if (!before && after) {
      added += 1;
      nodes.push({
        id,
        kind: after.kind,
        label: after.label,
        op: "added",
        properties: [],
      });
      continue;
    }
    if (!before || !after) continue;

    const properties: RevisionPropertyChange[] = [];
    if (before.text !== after.text) {
      properties.push({ property: "text", before: chip(before.text), after: chip(after.text) });
    }
    if (before.href !== after.href) {
      properties.push({ property: "href", before: chip(before.href), after: chip(after.href) });
    }
    if (before.src !== after.src) {
      properties.push({ property: "src", before: chip(before.src), after: chip(after.src) });
    }
    if (before.fill !== after.fill) {
      properties.push({ property: "fill", before: chip(before.fill), after: chip(after.fill) });
    }
    if (before.kind !== after.kind) {
      properties.push({ property: "type", before: before.kind, after: after.kind });
    }
    if (before.index !== after.index) {
      properties.push({
        property: "reorder",
        before: String(before.index),
        after: String(after.index),
      });
    }

    const styleDetails: Record<string, { before: string; after: string }> = {};
    const styleKeys = new Set([...Object.keys(before.style), ...Object.keys(after.style)]);
    for (const key of styleKeys) {
      const left = before.style[key] ?? "";
      const right = after.style[key] ?? "";
      if (left !== right) {
        styleDetails[key] = { before: chip(left), after: chip(right) };
      }
    }

    if (properties.length === 0 && Object.keys(styleDetails).length === 0) {
      continue;
    }
    changed += 1;
    nodes.push({
      id,
      kind: after.kind,
      label: after.label || before.label,
      op: "changed",
      properties,
      styleDetails: Object.keys(styleDetails).length > 0 ? styleDetails : undefined,
    });
  }

  const visible = nodes.filter((n) => n.op !== "unchanged");
  return {
    nodes: visible.slice(0, maxNodes),
    remainderCount: Math.max(0, visible.length - maxNodes),
    summary: { added, removed, changed },
  };
}

export function treeFromRevisionSnapshot(snapshot: unknown): unknown[] {
  const rec = asRecord(snapshot);
  if (!rec) return [];
  if (Array.isArray(rec.builderTree)) return rec.builderTree;
  if (rec.page && typeof rec.page === "object") {
    const page = rec.page as Record<string, unknown>;
    if (Array.isArray(page.builderTree)) return page.builderTree;
  }
  if (Array.isArray(rec.composition)) return rec.composition;
  return [];
}
