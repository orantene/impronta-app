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
 * inspector / drawer where they belong). The registry is purely
 * declarative — it doesn't dispatch. The `id` field is what consumers
 * lookup by; the `keys` array is what gets rendered as `<Kbd>` chips.
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
    id: "open-revisions",
    label: "Open Revisions",
    description: "Browse and restore prior drafts.",
    keys: ["⌘", "H"],
    category: "drawers",
    paletteAction: true,
  },
  {
    id: "open-theme",
    label: "Open Theme drawer",
    description: "Colors, typography, layout, effects.",
    keys: ["⌘", "T"],
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
    label: "Duplicate selected section",
    keys: ["⌘", "D"],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "delete-section",
    label: "Delete selected section",
    keys: ["⌫"],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "move-section-up",
    label: "Move selected section up",
    keys: ["⌥", "↑"],
    category: "editing",
    paletteAction: false,
  },
  {
    id: "move-section-down",
    label: "Move selected section down",
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
    keys: ["⌘", "⇧", "Z"],
    category: "history",
    paletteAction: true,
  },

  // ── selection ────────────────────────────────────────────────────────
  {
    id: "deselect",
    label: "Deselect / dismiss drawer",
    keys: ["Esc"],
    category: "selection",
    paletteAction: false,
  },
];

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
