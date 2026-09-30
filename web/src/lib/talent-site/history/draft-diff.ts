/**
 * "What will go live": the sections that differ between the published site and
 * the draft, with a short before/after for each. Pure.
 *
 * Sections are matched by their design key (`props.__origin.key`), then
 * `props.slotKey`, then node id, so a reordered or re-seeded tree still lines
 * up with its live counterpart.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { stableStringify, stripDesignOrigin } from "@/lib/talent-site/theme-releases/origin";

export type SectionChangeKind = "added" | "removed" | "changed";

export interface SectionChange {
  /** "shell" | page id | "tokens". */
  scope: string;
  scopeLabel: string;
  key: string;
  change: SectionChangeKind;
  label: string;
  before: string | null;
  after: string | null;
}

export interface GoLiveInput {
  shell: { draft: unknown; live: unknown };
  pages: Array<{ id: string; title: string; draft: unknown; live: unknown }>;
  tokens: { draft: unknown; live: unknown };
}

const TEXT_PROPS = ["title", "heading", "headline", "eyebrow", "text", "subtitle", "label", "body", "caption"];
const EXCERPT = 80;

function nodes(value: unknown): BuilderNode[] {
  return Array.isArray(value) ? (value as BuilderNode[]) : [];
}

function propsOf(node: BuilderNode): Record<string, unknown> {
  const p = (node as { props?: unknown }).props;
  return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
}

export function sectionKey(node: BuilderNode): string {
  const props = propsOf(node);
  const origin = props.__origin as { key?: unknown } | undefined;
  if (origin && typeof origin.key === "string" && origin.key) return origin.key;
  if (typeof props.slotKey === "string" && props.slotKey) return props.slotKey;
  return String((node as { id?: unknown }).id ?? "");
}

function clip(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > EXCERPT ? `${t.slice(0, EXCERPT - 1)}…` : t;
}

/** The first readable text a section carries (itself or a descendant). */
export function sectionText(node: BuilderNode, depth = 0): string | null {
  const props = propsOf(node);
  for (const k of TEXT_PROPS) {
    const v = props[k];
    if (typeof v === "string" && v.trim()) return clip(v);
  }
  if (depth > 3) return null;
  const kids = (node as { children?: unknown }).children;
  if (Array.isArray(kids)) {
    for (const child of kids as BuilderNode[]) {
      const t = sectionText(child, depth + 1);
      if (t) return t;
    }
  }
  return null;
}

function humanKind(node: BuilderNode): string {
  const kind = String((node as { kind?: unknown }).kind ?? "section");
  const pretty = kind.replace(/[_-]+/g, " ").trim();
  return pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : "Section";
}

function strip(node: BuilderNode): string {
  // Ignore the origin stamp: a re-stamp alone is not a visible change.
  return stableStringify(stripDesignOrigin([node]));
}

function diffTree(scope: string, scopeLabel: string, draft: unknown, live: unknown): SectionChange[] {
  const out: SectionChange[] = [];
  const liveByKey = new Map(nodes(live).map((n) => [sectionKey(n), n] as const));
  const seen = new Set<string>();
  for (const node of nodes(draft)) {
    const key = sectionKey(node);
    seen.add(key);
    const prev = liveByKey.get(key);
    if (!prev) {
      out.push({ scope, scopeLabel, key, change: "added", label: humanKind(node), before: null, after: sectionText(node) });
    } else if (strip(prev) !== strip(node)) {
      out.push({
        scope,
        scopeLabel,
        key,
        change: "changed",
        label: humanKind(node),
        before: sectionText(prev),
        after: sectionText(node),
      });
    }
  }
  for (const [key, prev] of liveByKey) {
    if (seen.has(key)) continue;
    out.push({ scope, scopeLabel, key, change: "removed", label: humanKind(prev), before: sectionText(prev), after: null });
  }
  return out;
}

function tokenMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function diffTokens(draft: unknown, live: unknown, label: string): SectionChange[] {
  const d = tokenMap(draft);
  const l = tokenMap(live);
  const keys = [...new Set([...Object.keys(d), ...Object.keys(l)])].sort();
  const out: SectionChange[] = [];
  for (const key of keys) {
    if (d[key] === l[key]) continue;
    out.push({
      scope: "tokens",
      scopeLabel: label,
      key,
      change: key in l ? (key in d ? "changed" : "removed") : "added",
      label: key,
      before: l[key] ?? null,
      after: d[key] ?? null,
    });
  }
  return out;
}

export function diffDraftAgainstLive(
  input: GoLiveInput,
  labels: { header: string; colours: string },
): SectionChange[] {
  return [
    ...diffTree("shell", labels.header, input.shell.draft, input.shell.live),
    ...input.pages.flatMap((p) => diffTree(p.id, p.title, p.draft, p.live)),
    ...diffTokens(input.tokens.draft, input.tokens.live, labels.colours),
  ];
}
