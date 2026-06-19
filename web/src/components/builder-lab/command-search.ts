/**
 * command-search — pure index + fuzzy-match + group-by-source logic behind the
 * Builder Lab's Cmd/Ctrl-K command palette (O6). No React here: the palette
 * component owns the keystroke/overlay/navigation; this module owns "given the
 * governed universe + a query, what matches, ranked, grouped by source".
 *
 * Three sources are indexed into ONE flat list:
 *   • gallery components — every `+`-gallery item (built-in code ∪ template-
 *     backed), each carrying the gallery tab it lives in so a hit can jump to
 *     that Catalog view with the row pre-expanded.
 *   • templates — every `builder_templates` row (page templates that are NOT
 *     authored-in-Playground drafts), surfaced so a governed template is
 *     locatable by title/slug. Jumps to the Playground view.
 *   • playground drafts — the page / shell drafts the Playground lists; jumps
 *     to the Playground view with the draft preselected.
 *
 * The palette maps an entry's `tab` → active Catalog view and `rowId` → the
 * expand/edit target, so one keystroke locates any governed object and jumps to
 * it expanded.
 */

/** Which indexed source an entry came from — also the group heading order. */
export type CommandSource = "component" | "template" | "draft";

/** A single searchable, jumpable governed object. `tab` is the Catalog view to
 *  activate; `rowId` is the per-view expand/select target (the catalog row id
 *  for components, the draft/template id for Playground). */
export interface CommandEntry {
  /** Stable unique key within the index (source-namespaced). */
  key: string;
  source: CommandSource;
  /** Primary searchable label shown as the result title. */
  title: string;
  /** Secondary line (category / status / slug) — searchable + shown muted. */
  subtitle: string;
  /** Extra non-displayed search tokens (id, base label, slug…). */
  keywords: string;
  /** Catalog view id to activate on select (e.g. a gallery tab or "playground"). */
  tab: string;
  /** Per-view expand/select target id. For components this is the catalog row
   *  id (drives `editingId`); for templates/drafts the builder_templates row id. */
  rowId: string;
}

/** A ranked entry — `score` higher is better; entries that don't match are
 *  dropped before this stage. */
export interface RankedCommandEntry extends CommandEntry {
  score: number;
}

/** A group of ranked results under one source heading. */
export interface CommandGroup {
  source: CommandSource;
  label: string;
  entries: RankedCommandEntry[];
}

export const COMMAND_SOURCE_LABEL: Record<CommandSource, string> = {
  component: "Components",
  template: "Templates",
  draft: "Playground drafts",
};

/** Render / group order — components first (the bulk of the catalog), then
 *  governed templates, then in-flight drafts. */
const SOURCE_ORDER: CommandSource[] = ["component", "template", "draft"];

/* ── inputs (structurally-typed slices of the real rows, so this module never
 *    imports React-bound or server-only types) ─────────────────────────────── */

/** The slice of `CatalogAdminItem` the index needs. */
export interface IndexComponentInput {
  id: string;
  tab: string;
  effectiveLabel: string;
  effectiveCategory: string;
  baseLabel: string;
}

/** The slice of `BuilderTemplateRow` the index needs (templates AND drafts). */
export interface IndexTemplateInput {
  id: string;
  title: string;
  slug: string;
  status: string;
  kind: string;
}

/**
 * Fuzzy subsequence score: every char of `query` must appear in `text` in
 * order (case-insensitive). Returns null on no match, else a score where a
 * contiguous run and earlier first-match position rank higher. Empty query ⇒ 0
 * (matches everything, neutral rank). Mirrors the edit-chrome palette's ranking
 * shape so behavior reads the same across the two palettes.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();

  // Fast path — a direct substring is the strongest match; bonus for matching
  // at the very start of the candidate.
  const sub = t.indexOf(q);
  if (sub !== -1) {
    return 1000 - sub + (sub === 0 ? 200 : 0) + q.length;
  }

  let ti = 0;
  let score = 0;
  let firstIdx = -1;
  let prevIdx = -1;
  let matched = 0;
  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi];
    let found = -1;
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = ti;
        ti += 1;
        break;
      }
      ti += 1;
    }
    if (found === -1) return null; // a query char never appears in order → no match
    if (firstIdx === -1) firstIdx = found;
    // Reward adjacency (contiguous runs read as "real" matches).
    if (prevIdx !== -1 && found === prevIdx + 1) score += 5;
    prevIdx = found;
    matched += 1;
  }
  if (matched < q.length) return null;
  // Earlier first match + more matched chars rank higher; subsequence matches
  // always rank below any substring hit (max here < 1000).
  return 100 - firstIdx + score + matched;
}

/**
 * Build the flat command index from the three governed sources. `drafts` should
 * be the Playground's draft list (page_template / shell kinds); `templates`
 * the remaining `builder_templates` rows (so the two groups don't double-list a
 * row). `playgroundTab` / `templateTab` are the Catalog view ids the palette
 * jumps to for each (the live catalog uses "playground" for both today, but
 * keeping them as params avoids hard-coding view ids in the pure layer).
 */
export function buildCommandIndex(args: {
  components: ReadonlyArray<IndexComponentInput>;
  templates: ReadonlyArray<IndexTemplateInput>;
  drafts: ReadonlyArray<IndexTemplateInput>;
  templateTab: string;
  playgroundTab: string;
}): CommandEntry[] {
  const out: CommandEntry[] = [];

  for (const c of args.components) {
    out.push({
      key: `component:${c.id}`,
      source: "component",
      title: c.effectiveLabel || c.baseLabel || c.id,
      subtitle: c.effectiveCategory || "",
      keywords: `${c.id} ${c.baseLabel}`,
      tab: c.tab,
      rowId: c.id,
    });
  }

  for (const t of args.templates) {
    out.push({
      key: `template:${t.id}`,
      source: "template",
      title: t.title || t.slug || t.id,
      subtitle: `${t.kind} · ${t.status}`,
      keywords: `${t.slug} ${t.id}`,
      tab: args.templateTab,
      rowId: t.id,
    });
  }

  for (const d of args.drafts) {
    out.push({
      key: `draft:${d.id}`,
      source: "draft",
      title: d.title || d.slug || d.id,
      subtitle: `${d.kind} · ${d.status}`,
      keywords: `${d.slug} ${d.id}`,
      tab: args.playgroundTab,
      rowId: d.id,
    });
  }

  return out;
}

/**
 * Rank an index against a query. Each entry scores on title (full weight),
 * subtitle (half), and keywords (quarter) — the best-weighted hit wins. Entries
 * with no match are dropped. Ties break by source order then title so the list
 * is stable. An empty query returns the whole index in source/title order.
 */
export function searchCommandIndex(
  index: ReadonlyArray<CommandEntry>,
  query: string,
  limit = 40,
): RankedCommandEntry[] {
  const q = query.trim();
  const ranked: RankedCommandEntry[] = [];

  for (const e of index) {
    if (!q) {
      ranked.push({ ...e, score: 0 });
      continue;
    }
    const titleS = fuzzyScore(q, e.title);
    const subS = fuzzyScore(q, e.subtitle);
    const kwS = fuzzyScore(q, e.keywords);
    let best: number | null = null;
    if (titleS !== null) best = titleS;
    if (subS !== null) best = Math.max(best ?? -Infinity, subS * 0.5);
    if (kwS !== null) best = Math.max(best ?? -Infinity, kwS * 0.25);
    if (best === null) continue;
    ranked.push({ ...e, score: best });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const so = SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source);
    if (so !== 0) return so;
    return a.title.localeCompare(b.title);
  });

  return ranked.slice(0, limit);
}

/** Group ranked results by source in the fixed SOURCE_ORDER, dropping empty
 *  groups and preserving each group's internal rank order. */
export function groupBySource(
  ranked: ReadonlyArray<RankedCommandEntry>,
): CommandGroup[] {
  const groups: CommandGroup[] = [];
  for (const source of SOURCE_ORDER) {
    const entries = ranked.filter((e) => e.source === source);
    if (entries.length === 0) continue;
    groups.push({ source, label: COMMAND_SOURCE_LABEL[source], entries });
  }
  return groups;
}

/** The flat list of entries in their grouped display order — used by the
 *  palette for ↑/↓ keyboard navigation across group boundaries. */
export function flattenGroups(
  groups: ReadonlyArray<CommandGroup>,
): RankedCommandEntry[] {
  return groups.flatMap((g) => g.entries);
}
