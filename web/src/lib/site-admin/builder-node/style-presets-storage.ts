/**
 * STYLE-1 — site-scoped style-PRESET registry STORAGE.
 *
 * Mirrors `style-classes-storage.ts`. Style presets + the copy/paste clipboard
 * used to live in TWO GLOBAL (per-browser, cross-site) localStorage keys
 * (`tulala:builder:style-presets` / `tulala:builder:style-clipboard`) inside
 * `style-presets-bar.tsx`. That leaked presets across every site a browser
 * touched. STYLE-1 moves them onto the SAME site-scoped, DB-backed envelope as
 * style classes: presets travel with the page/site through
 * `CompositionData.stylePresets` and persist via the active adapter's save path.
 *
 * This module is the per-browser MIRROR keyed by `pageId` (site scope) — the
 * SSR-hydrated seed on load, the inspector's read/write surface, and a small
 * cross-subtree bridge so the canvas/inspector stay in sync. The DB read seeds
 * it on composition load (EditProvider), and the editor's save/publish call
 * sites read it back into the `stylePresets` envelope, exactly like classes.
 */
import type {
  BuilderStylePreset,
  BuilderStylePresetRegistry,
} from "./style-classes";
import type { BuilderNodeStyle } from "./types";

const STORAGE_PREFIX = "tulala:builder:style-presets:v1";

/** localStorage key for a page's preset envelope. `null` → the home page key. */
export function stylePresetStorageKey(pageId: string | null): string {
  return `${STORAGE_PREFIX}:${pageId ?? "home"}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStylePreset(value: unknown): value is BuilderStylePreset {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isPlainObject(value.style)
  );
}

const EMPTY_REGISTRY: BuilderStylePresetRegistry = Object.freeze({
  presets: Object.freeze([]) as ReadonlyArray<BuilderStylePreset>,
});

/** Normalise an unknown value into a well-formed presets envelope. */
export function normalizePresetRegistry(
  raw: unknown,
): BuilderStylePresetRegistry {
  let presets: BuilderStylePreset[] = [];
  let clipboard: BuilderNodeStyle | null | undefined;
  if (Array.isArray(raw)) {
    presets = raw.filter(isStylePreset);
  } else if (isPlainObject(raw)) {
    if (Array.isArray(raw.presets)) presets = raw.presets.filter(isStylePreset);
    if (isPlainObject(raw.clipboard)) clipboard = raw.clipboard as BuilderNodeStyle;
  }
  return clipboard ? { presets, clipboard } : { presets };
}

/**
 * Read the page's preset envelope from localStorage. Returns an empty envelope
 * on any problem (missing key, malformed JSON, SSR/no-window).
 */
export function readPresets(pageId: string | null): BuilderStylePresetRegistry {
  try {
    if (typeof window === "undefined") return EMPTY_REGISTRY;
    const raw = window.localStorage.getItem(stylePresetStorageKey(pageId));
    if (!raw) return EMPTY_REGISTRY;
    return normalizePresetRegistry(JSON.parse(raw) as unknown);
  } catch {
    return EMPTY_REGISTRY;
  }
}

/**
 * Persist the page's preset envelope. Returns `true` only when the write
 * actually succeeded. Always republishes to the cross-subtree bridge so the
 * inspector reflects the latest envelope even if persistence failed this
 * session (quota/private-mode).
 */
export function writePresets(
  pageId: string | null,
  registry: BuilderStylePresetRegistry,
): boolean {
  let ok = false;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        stylePresetStorageKey(pageId),
        JSON.stringify(registry),
      );
      ok = true;
    }
  } catch {
    ok = false;
  }
  publishStylePresetRegistry(registry);
  return ok;
}

/**
 * Seed the page's preset envelope from the SSR/DB-hydrated registry on load.
 * Only writes when localStorage has nothing yet for this page (so an in-session
 * edit isn't clobbered by a reload's DB seed), and always publishes to the
 * bridge. Mirrors how the classes registry is seeded from `data.styleClasses`.
 */
export function seedPresetsFromHydration(
  pageId: string | null,
  hydrated: BuilderStylePresetRegistry | undefined,
): void {
  const registry = hydrated ?? EMPTY_REGISTRY;
  try {
    if (typeof window !== "undefined") {
      const existing = window.localStorage.getItem(stylePresetStorageKey(pageId));
      if (!existing) {
        window.localStorage.setItem(
          stylePresetStorageKey(pageId),
          JSON.stringify(registry),
        );
      }
    }
  } catch {
    /* non-fatal */
  }
  publishStylePresetRegistry(registry);
}

/** Is this envelope worth persisting to the adapter (non-empty)? */
export function presetRegistryHasContent(
  registry: BuilderStylePresetRegistry | undefined,
): boolean {
  return Boolean(
    registry && (registry.presets.length > 0 || registry.clipboard),
  );
}

// ── Cross-subtree live registry bridge ──────────────────────────────────────

type Listener = () => void;

let currentRegistry: BuilderStylePresetRegistry = EMPTY_REGISTRY;
const listeners = new Set<Listener>();

/** Publish the latest preset envelope to subscribers. No-op when unchanged. */
export function publishStylePresetRegistry(
  registry: BuilderStylePresetRegistry | null,
): void {
  const next = registry ?? EMPTY_REGISTRY;
  if (Object.is(currentRegistry, next)) return;
  currentRegistry = next;
  for (const listener of listeners) listener();
}

/** `useSyncExternalStore` subscribe — returns an unsubscribe fn. */
export function subscribeStylePresetRegistry(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `useSyncExternalStore` snapshot getter. Stable reference between publishes. */
export function getStylePresetRegistrySnapshot(): BuilderStylePresetRegistry {
  return currentRegistry;
}

/** Server snapshot getter — no live registry during SSR. */
export function getStylePresetRegistryServerSnapshot(): BuilderStylePresetRegistry {
  return EMPTY_REGISTRY;
}
