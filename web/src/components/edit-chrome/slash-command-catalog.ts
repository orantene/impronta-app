/**
 * Slash-command insert — catalog + fuzzy matcher.
 *
 * Pure data/logic shared by the Lexical trigger (`SlashCommandPlugin.tsx`,
 * inline text editing) and the canvas keyboard trigger
 * (`slash-command-canvas-trigger.tsx`, block selected but not editing). Both
 * render the same `SlashCommandMenu`; this module is where their entry lists
 * come from so the two triggers can never drift.
 *
 * Reuses the SAME data source `ElementLibraryInsertPicker` reads
 * (`BUILDER_NODE_REGISTRY` + `SECTION_EMBED_PRESETS`) rather than
 * duplicating the catalog, plus the operator's saved "My blocks" components
 * (mirrors the ⌘K command palette's "Living components" section).
 *
 * The fuzzy scorer mirrors `command-palette.tsx`'s `fuzzyScore` (character
 * order preserved, not necessarily contiguous; rewards prefix/contiguous/
 * early matches). Kept as a small local copy rather than an import — the
 * palette's version is a private, unexported function scoped to that file.
 */

import {
  BUILDER_NODE_REGISTRY,
  SECTION_EMBED_PRESETS,
  elementLibraryPrimaryLabel,
  elementLibrarySearchExtraTerms,
  sortKindsForElementLibraryCatalog,
  type BuilderNodeKind,
} from "@/lib/site-admin/builder-node";
import type { BuilderComponentRow } from "@/lib/site-admin/edit-mode/builder-components-action";

export type SlashCommandEntry =
  | {
      id: string;
      pickKind: "element";
      /** English source label — translated only at render time. */
      label: string;
      keywords: string;
      elementKind: BuilderNodeKind;
    }
  | {
      id: string;
      pickKind: "sectionEmbed";
      label: string;
      keywords: string;
      sectionTypeKey: string;
    }
  | {
      id: string;
      pickKind: "savedBlock";
      /** Saved-block names are operator-authored — never translated. */
      label: string;
      keywords: string;
      block: BuilderComponentRow;
    };

/**
 * Build the full (unfiltered) catalog for the current insert context.
 * `allowedKinds` is already registry + plan gated by the caller (mirrors
 * `ElementLibraryInsertPicker`'s contract). `section_embed` never enters the
 * generic element list — it's surfaced only through `SECTION_EMBED_PRESETS`
 * when the caller includes them.
 */
export function buildSlashCommandEntries(input: {
  allowedKinds: ReadonlyArray<BuilderNodeKind>;
  includeSectionEmbeds?: boolean;
  savedBlocks?: ReadonlyArray<BuilderComponentRow>;
}): SlashCommandEntry[] {
  const entries: SlashCommandEntry[] = [];

  const elementKinds = sortKindsForElementLibraryCatalog(
    input.allowedKinds.filter((k) => k !== "section_embed"),
  );
  for (const kind of elementKinds) {
    entries.push({
      id: `element:${kind}`,
      pickKind: "element",
      label: elementLibraryPrimaryLabel(kind),
      keywords: [
        BUILDER_NODE_REGISTRY[kind].description,
        kind.replace(/_/g, " "),
        elementLibrarySearchExtraTerms(kind),
      ]
        .filter(Boolean)
        .join(" "),
      elementKind: kind,
    });
  }

  if (input.includeSectionEmbeds) {
    for (const preset of SECTION_EMBED_PRESETS) {
      entries.push({
        id: `sectionEmbed:${preset.id}`,
        pickKind: "sectionEmbed",
        label: preset.label,
        keywords: [preset.description, "tulala component dynamic section"].join(
          " ",
        ),
        sectionTypeKey: preset.sectionTypeKey,
      });
    }
  }

  for (const block of input.savedBlocks ?? []) {
    entries.push({
      id: `savedBlock:${block.id}`,
      pickKind: "savedBlock",
      label: block.name,
      keywords: ["my block", "saved", "reuse", "component", block.rootKind].join(
        " ",
      ),
      block,
    });
  }

  return entries;
}

/**
 * Score `query` against `text`, or `null` when the query's characters don't
 * all appear (in order, case-insensitive) in `text`. Higher is better.
 * Mirrors `command-palette.tsx`'s `fuzzyScore` so the slash menu and ⌘K feel
 * like the same search engine.
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q === t) return 10000;
  if (t.startsWith(q)) return 5000 - t.length;

  let qi = 0;
  let firstMatch = -1;
  let runs = 0;
  let lastIdx = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      if (firstMatch === -1) firstMatch = ti;
      if (ti === lastIdx + 1) runs += 1;
      lastIdx = ti;
      qi += 1;
    }
  }
  if (qi < q.length) return null;

  return 1000 - firstMatch * 8 - (t.length - q.length) * 2 + runs * 25;
}

function scoreEntry(query: string, entry: SlashCommandEntry): number | null {
  if (!query) return 1;
  const labelScore = fuzzyScore(query, entry.label);
  const keywordScore = fuzzyScore(query, entry.keywords);
  if (labelScore === null && keywordScore === null) return null;
  if (labelScore === null) return (keywordScore ?? 0) - 100;
  if (keywordScore === null) return labelScore;
  return Math.max(labelScore, keywordScore - 100);
}

/** Default cap on rendered entries — a long unfiltered catalog stays scannable. */
export const SLASH_COMMAND_MAX_ENTRIES = 8;

/**
 * Filter + sort the catalog for the current query. English-source matching
 * (label/keywords), same deliberate choice `ElementLibraryInsertPicker`
 * documents: the catalog's keys are English and matching a translated
 * haystack would break the kind names.
 */
export function filterSlashCommandEntries(
  entries: ReadonlyArray<SlashCommandEntry>,
  query: string,
  limit: number = SLASH_COMMAND_MAX_ENTRIES,
): SlashCommandEntry[] {
  const scored = entries
    .map((entry) => ({ entry, score: scoreEntry(query, entry) }))
    .filter(
      (x): x is { entry: SlashCommandEntry; score: number } => x.score !== null,
    );
  if (!query) {
    return scored.slice(0, limit).map((x) => x.entry);
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.entry);
}
