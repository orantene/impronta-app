/**
 * Editor shortcut registry — the single source of truth for every
 * keybind in the visual editor.
 *
 * Two consumers read from this:
 *   1. Command palette (Phase 8) — surfaces inline `⌘K`-style chips next
 *      to each result row + filters the action list by keyword.
 *   2. Keyboard shortcuts overlay (Phase 10, `?`-toggle) — renders a
 *      grouped reference table of every shortcut, grouped by `category`.
 *
 * Why a registry instead of inlining the data in each consumer:
 *   - One place to edit when a keybind moves.
 *   - Phase 10's overlay can't drift from the actual handlers because
 *     both read the same list.
 *   - The palette can tag rows with their keybind without re-typing the
 *     glyph sequence per call site.
 *
 * The actual key handlers stay in `edit-shell.tsx` (and inside each
 * inspector / drawer where they belong). Globally wired there today,
 * among others: ⌘K, `?`, the Escape ladder, ⌘L (assets), ⌘↵ (publish),
 * `,` (page settings), ⌘1–⌘3 (device preview), ⌘⇧P (pages picker), ⌘\
 * (navigator), ⌘Z / ⇧⌘Z (undo/redo), ⌘S (save draft), ⌘⇧S (share link).
 * Some drawer rows intentionally have
 * no global chord (empty `keys`) because macOS / the browser reserves ⌘H,
 * ⌘T, etc.; the overlay shows ⌘K as the entry path.
 * The registry is purely declarative — it doesn't dispatch. The `id`
 * field is what consumers lookup by; the `keys` array is what gets
 * rendered as `<Kbd>` chips (may be empty — see overlay / palette).
 *
 * Platform glyphs: `mod` represents Cmd on macOS / Ctrl elsewhere. We
 * surface `⌘` in the rendered chip since the editor is staff-facing and
 * macOS-dominant; the Ctrl alternative is mentioned once in the overlay
 * footer rather than dual-printed everywhere.
 */

export type ShortcutCategory =
  | "navigation"
  | "drawers"
  | "editing"
  | "history"
  | "selection"
  | "search";

export interface Shortcut {
  /** Stable id used for lookup + react keys. */
  id: string;
  /** Sentence-case label, e.g. "Open command palette". */
  label: string;
  /** One-line description for the overlay; omit for short labels. */
  description?: string;
  /**
   * Key glyphs as they should render in `<Kbd>` chips, in order.
   * Use "⌘" for the platform mod key, "⇧" for shift, "⌥" for alt,
   * "↵" for enter, "⌫" for backspace, "Esc" verbatim.
   * Empty means no global binding — palette (`⌘K`) only; overlay labels
   * that explicitly.
   */
  keys: ReadonlyArray<string>;
  category: ShortcutCategory;
  /**
   * When true, the palette includes this shortcut's label as a
   * searchable command row that fires the registered handler. When
   * false (e.g. ⌫ delete-selection), it's reference-only — the handler
   * still runs but the palette doesn't surface a row because the
   * shortcut is contextual.
   */
  paletteAction?: boolean;
}

export const SHORTCUTS: ReadonlyArray<Shortcut> = [
  // ── search / palette ─────────────────────────────────────────────────
  {
    id: "command-palette",
    label: "Open command palette",
    description: "Jump to any page, section, drawer, or action.",
    keys: ["⌘", "K"],
    category: "search",
    paletteAction: false,
  },
  {
    id: "shortcut-overlay",
    label: "Show keyboard shortcuts",
    description: "Open the full keyboard reference.",
    keys: ["?"],
    category: "search",
    paletteAction: false,
  },

  // ── drawers (right-side mutex set) ───────────────────────────────────
  {
    id: "open-assets",
    label: "Open Assets library",
    description: "Browse uploaded media + brand kit.",
    keys: ["⌘", "L"],
    category: "drawers",
    paletteAction: true,
  },
  {
    id: "open-publish",
    label: "Open Publish drawer",
    description: "Review draft and publish to live.",
    keys: ["⌘", "↵"],
    category: "drawers",
    paletteAction: true,
  },
  {
    id: "open-page-settings",
    label: "Open Page settings",
    description: "Title, meta, indexability.",
    keys: [","],
    category: "drawers",
    paletteAction: true,
  },
  {
    id: "open-pages-picker",
    label: "Open Pages menu",
    description: "Switch page or open Manage pages.",
    keys: ["⌘", "⇧", "P"],
    category: "drawers",
    paletteAction: true,
  },
  {
    id: "open-revisions",
    label: "Open Revisions",
    description:
      "Command palette only, ⌘H hides the active app on macOS (no global bind).",
    keys: [],
    category: "drawers",
    paletteAction: true,
  },
  {
    id: "open-theme",
    label: "Open Theme drawer",
    description:
      "Command palette only, ⌘T opens a new browser tab (no global bind).",
    keys: [],
    category: "drawers",
    paletteAction: true,
  },

  // ── navigation ───────────────────────────────────────────────────────
  {
    id: "toggle-navigator",
    label: "Toggle Structure navigator",
    description: "Show or hide the left rail.",
    keys: ["⌘", "\\"],
    category: "navigation",
    paletteAction: true,
  },
  // 4C — zoom / canvas viewport
  {
    id: "zoom-in",
    label: "Zoom in",
    description: "Enlarge the canvas view.",
    keys: ["⌘", "+"],
    category: "navigation",
    paletteAction: false,
  },
  {
    id: "zoom-out",
    label: "Zoom out",
    description: "Shrink the canvas view.",
    keys: ["⌘", "−"],
    category: "navigation",
    paletteAction: false,
  },
  {
    id: "zoom-reset",
    label: "Reset zoom to 100%",
    keys: ["⌘", "0"],
    category: "navigation",
    paletteAction: false,
  },
  {
    id: "zoom-fit",
    label: "Fit page to screen",
    description: "Scale the canvas so the whole page is visible.",
    keys: ["⌘", "⇧", "F"],
    category: "navigation",
    paletteAction: true,
  },
  {
    id: "toggle-rulers",
    label: "Toggle canvas rulers",
    description: "Show or hide the horizontal and vertical rulers.",
    keys: ["⌘", "R"],
    category: "navigation",
    paletteAction: true,
  },
  {
    id: "canvas-pan",
    label: "Pan canvas",
    description: "Hold Space then drag to scroll the canvas in any direction.",
    keys: ["Space", "+", "drag"],
    category: "navigation",
    paletteAction: false,
  },
  {
    id: "switch-device-desktop",
    label: "Switch to Desktop preview",
    keys: ["⌘", "1"],
    category: "navigation",
    paletteAction: true,
  },
  {
    id: "switch-device-tablet",
    label: "Switch to Tablet preview",
    keys: ["⌘", "2"],
    category: "navigation",
    paletteAction: true,
  },
  {
    id: "switch-device-mobile",
    label: "Switch to Mobile preview",
    keys: ["⌘", "3"],
    category: "navigation",
    paletteAction: true,
  },

  // ── editing ──────────────────────────────────────────────────────────
  {
    id: "save-draft",
    label: "Save draft checkpoint",
    description: "Snapshot the current state into the revisions log.",
    keys: ["⌘", "S"],
    category: "editing",
    paletteAction: true,
  },
  {
    id: "share-link",
    label: "Share preview link",
    description:
      "Mint a signed URL that lets anyone view the current draft.",
    keys: ["⌘", "⇧", "S"],
    category: "editing",
    paletteAction: true,
  },
  {
    id: "duplicate-section",
    label: "Duplicate selected section/block",
    keys: ["⌘", "D"],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "copy-block",
    label: "Copy selected block(s)",
    keys: ["⌘", "C"],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "cut-block",
    label: "Cut selected block(s)",
    keys: ["⌘", "X"],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "paste-block",
    label: "Paste copied block",
    description:
      "Pastes inside compatible containers, otherwise after the selected block.",
    keys: ["⌘", "V"],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "delete-section",
    label: "Delete selected section/block",
    keys: ["⌫"],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "nudge-block",
    label: "Nudge selected block(s)",
    description: "Hold ⌥ and arrow to move by 1px; add ⇧ for 10px.",
    keys: ["⌥", "↑", "↓", "←", "→"],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "lock-block",
    label: "Lock / unlock selected block",
    description: "Right-click a block (canvas or layers) for the full action menu.",
    keys: [],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "wrap-in-container",
    label: "Wrap selected block(s) in a container",
    description: "Right-click → Wrap in container. Same as Group for a multi-selection.",
    keys: [],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "convert-to-component",
    label: "Convert selected block to a reusable component",
    description: "Right-click → Convert to component.",
    keys: [],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "bulk-style",
    label: "Edit shared style for all selected",
    description:
      "With several blocks selected, the multi-select toolbar's brush applies colour, background, radius, and opacity to all at once.",
    keys: [],
    category: "selection",
    paletteAction: false,
  },
  {
    id: "context-menu",
    label: "Open the right-click action menu",
    description: "Available on any canvas block, section, or layers-panel row.",
    keys: [],
    category: "selection",
    paletteAction: false,
  },
  {
    id: "nav-tree-arrows",
    label: "Move selection between blocks",
    description:
      "↑ / ↓ select the previous / next sibling; ← selects the parent; → selects the first child.",
    keys: ["↑", "↓", "←", "→"],
    category: "navigation",
    paletteAction: false,
  },
  {
    id: "select-parent-block",
    label: "Select parent block",
    description: "Same as ← when moving between blocks.",
    keys: ["["],
    category: "navigation",
    paletteAction: false,
  },
  {
    id: "select-child-block",
    label: "Select first child block",
    description: "Same as → when moving between blocks.",
    keys: ["]"],
    category: "navigation",
    paletteAction: false,
  },
  {
    id: "move-section-up",
    label: "Move selected section up, or nudge a block",
    description:
      "With a section selected, moves it one place earlier on the page. With a nested block selected and focus on the canvas, nudges that block up by 1px instead, or 10px with Shift.",
    keys: ["⌥", "↑"],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "move-section-down",
    label: "Move selected section down, or nudge a block",
    description:
      "With a section selected, moves it one place later on the page. With a nested block selected and focus on the canvas, nudges that block down by 1px instead, or 10px with Shift.",
    keys: ["⌥", "↓"],
    category: "editing",
    paletteAction: false,
  },

  // ── history ──────────────────────────────────────────────────────────
  {
    id: "undo",
    label: "Undo",
    keys: ["⌘", "Z"],
    category: "history",
    paletteAction: true,
  },
  {
    id: "redo",
    label: "Redo",
    keys: ["⌘", "Y"],
    category: "history",
    paletteAction: true,
  },
  {
    id: "redo-shift-z",
    label: "Redo (alternate)",
    keys: ["⌘", "⇧", "Z"],
    category: "history",
    paletteAction: false,
  },
  {
    id: "group-blocks",
    label: "Group selected blocks",
    keys: ["⌘", "⇧", "G"],
    category: "selection",
    paletteAction: false,
  },
  {
    id: "align-blocks-left",
    label: "Align selected blocks left",
    keys: ["⌘", "⇧", "L"],
    category: "selection",
    paletteAction: false,
  },

  // ── selection ────────────────────────────────────────────────────────
  {
    id: "deselect",
    label: "Deselect / dismiss drawer",
    keys: ["Esc"],
    category: "selection",
    paletteAction: false,
  },

  // ── WS4 additions ────────────────────────────────────────────────────
  {
    id: "toggle-preview",
    label: "Toggle preview mode",
    description: "Switch between edit and preview-only canvas view.",
    // ⌘P is browser print on macOS — intentionally no global bind.
    keys: [],
    category: "navigation",
    paletteAction: true,
  },
  {
    id: "exit-to-live-site",
    label: "Exit to live site",
    description: "Leave the editor and view the published storefront.",
    // No global key — accidental exit is destructive on an unsaved draft.
    keys: [],
    category: "navigation",
    paletteAction: true,
  },
];

/** Inputs shared by `isShortcutVisible` + `filterVisibleShortcuts`. */
export type ShortcutVisibilityOptions = {
  canEditSiteShell: boolean;
  /** Homepage composition editor — Revisions drawer exists here only (matches ⌘K palette). */
  homepageEditing: boolean;
};

/**
 * Capability-aware shortcut visibility gate.
 *
 * Keeps plan-based hiding logic in one place so command palette rows and
 * the keyboard reference overlay don't drift.
 */
export function isShortcutVisible(
  shortcutId: string,
  options: ShortcutVisibilityOptions,
): boolean {
  if (shortcutId === "open-theme") {
    return options.canEditSiteShell;
  }
  if (shortcutId === "open-revisions") {
    return options.homepageEditing;
  }
  return true;
}

export function filterVisibleShortcuts(
  shortcuts: ReadonlyArray<Shortcut>,
  options: ShortcutVisibilityOptions,
): ReadonlyArray<Shortcut> {
  return shortcuts.filter((entry) =>
    isShortcutVisible(entry.id, options),
  );
}

/**
 * Lookup a shortcut by id. Returns undefined for unknown ids — callers
 * decide whether that should warn or silently render no chip.
 */
export function getShortcut(id: string): Shortcut | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}

/** Group the registry by category for the keyboard overlay. */
export function shortcutsByCategory(): Record<ShortcutCategory, Shortcut[]> {
  const out: Record<ShortcutCategory, Shortcut[]> = {
    search: [],
    navigation: [],
    drawers: [],
    editing: [],
    history: [],
    selection: [],
  };
  for (const s of SHORTCUTS) {
    out[s.category].push(s);
  }
  return out;
}

/** Sentence-case category headings rendered in the overlay. */
export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  search: "Search",
  navigation: "Navigation",
  drawers: "Drawers",
  editing: "Editing",
  history: "History",
  selection: "Selection",
};
