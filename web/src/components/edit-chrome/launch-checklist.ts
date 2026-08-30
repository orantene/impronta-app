/**
 * ONB-2 — Launch-checklist step definitions and completion-derivation helpers.
 *
 * Shared module: lives in the edit-chrome layer so ALL four builder surfaces
 * (homepage, cms_page, talent_page, platform_lab) inherit it through the shared
 * EditShell chrome. No surface-specific branches — Lab is suppressed via the
 * `isLabSurface` flag at the call site.
 *
 * Persistence: localStorage (survives page reload / tab close) under a
 * per-session-namespace key so it does not bleed between different pages.
 */

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

// ─── storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "impronta.editChrome.launchChecklist.v1";

export type LaunchChecklistStep =
  | "content"
  | "theme"
  | "addSection"
  | "publish";

export interface LaunchChecklistState {
  dismissed: boolean;
  done: Record<LaunchChecklistStep, boolean>;
}

const INITIAL_STATE: LaunchChecklistState = {
  dismissed: false,
  done: {
    content: false,
    theme: false,
    addSection: false,
    publish: false,
  },
};

/** Load persisted checklist state for the given `pageKey` (e.g. the page id). */
export function loadChecklistState(
  pageKey: string,
): LaunchChecklistState {
  if (typeof window === "undefined") return { ...INITIAL_STATE, done: { ...INITIAL_STATE.done } };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...INITIAL_STATE, done: { ...INITIAL_STATE.done } };
    const parsed = JSON.parse(raw) as Record<string, LaunchChecklistState>;
    const entry = parsed[pageKey];
    if (!entry) return { ...INITIAL_STATE, done: { ...INITIAL_STATE.done } };
    return {
      dismissed: entry.dismissed ?? false,
      done: {
        content: entry.done?.content ?? false,
        theme: entry.done?.theme ?? false,
        addSection: entry.done?.addSection ?? false,
        publish: entry.done?.publish ?? false,
      },
    };
  } catch {
    return { ...INITIAL_STATE, done: { ...INITIAL_STATE.done } };
  }
}

/** Persist an update to the checklist state for the given `pageKey`. */
export function saveChecklistState(
  pageKey: string,
  state: LaunchChecklistState,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const all: Record<string, LaunchChecklistState> = raw
      ? (JSON.parse(raw) as Record<string, LaunchChecklistState>)
      : {};
    all[pageKey] = state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // best-effort — storage might be full or blocked
  }
}

// ─── step-completion derivation ─────────────────────────────────────────────

/**
 * Derive the `content` step completion from the builder tree.
 *
 * A template is considered "edited" once the tree has at least one section
 * node — indicating the operator has a non-empty canvas to work with.
 * Actual text edits are tracked via `selectedSectionId` in the component
 * (clicking a section to start inline editing).
 */
export function deriveContentDone(tree: BuilderNodeTree): boolean {
  return tree.some((node) => node.kind === "section" || node.kind === "section_embed");
}

/**
 * True when the tree has two or more sections.
 *
 * Do not use this as the launch-checklist completion signal. Every starter
 * already ships with several sections, so this would mark the step done on
 * first paint. The panel treats "Add a section" as done only when the add
 * panel is opened.
 */
export function deriveAddSectionDone(tree: BuilderNodeTree): boolean {
  const sectionCount = tree.filter(
    (node) => node.kind === "section" || node.kind === "section_embed",
  ).length;
  return sectionCount >= 2;
}

/**
 * Derive the `publish` step completion from the live published timestamp.
 * Non-null means this page has been published at least once.
 */
export function derivePublishDone(liveSitePublishedAt: string | null): boolean {
  return liveSitePublishedAt !== null;
}

// ─── step descriptor list ────────────────────────────────────────────────────

export const LAUNCH_CHECKLIST_STEPS: ReadonlyArray<{
  key: LaunchChecklistStep;
  label: string;
  hint: string;
  cta: string;
}> = [
  {
    key: "content",
    label: "Edit the words",
    hint:
      "Headlines and copy are placeholders. Click any text to rewrite it.",
    cta: "Start editing",
  },
  {
    key: "theme",
    label: "Set your brand style",
    hint:
      "Pick your color and fonts once, the whole page updates automatically.",
    cta: "Open Theme",
  },
  {
    key: "addSection",
    label: "Add a section",
    hint:
      "Use the + panel to drop in a gallery, contact form, testimonials, or more.",
    cta: "Add section",
  },
  {
    key: "publish",
    label: "Publish",
    hint: "When you're happy with the preview, publish to make it live.",
    cta: "Publish now",
  },
];
