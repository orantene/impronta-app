/**
 * Shared style-class registry STORAGE + cross-subtree bridge (Marathon W1-T1).
 *
 * Linked style classes (see `style-classes.ts`) are PAGE-SCOPED and persisted
 * per-browser in localStorage under `tulala:builder:style-classes:v1:<pageId>`.
 * Before this module the read/write helpers were duplicated in TWO places with
 * subtly independent validation:
 *   - `inspectors/linked-style-classes-bar.tsx` (the writer surface), and
 *   - `navigator-panel.tsx`'s ClassManagerPanel (the reader surface).
 * That meant the editor canvas + the publish path had no single source of
 * truth for "what classes exist on this page." This module is that source.
 *
 * It also hosts the minimal CROSS-SUBTREE bridge the client canvas needs. The
 * storefront body (`homepage-cms-sections.tsx`, where `<ClientBuilderCanvas>`
 * lives) renders in the page `{children}` slot, while the editor's
 * `EditProvider` is a SIBLING subtree — React context can't cross between them
 * (the exact reason `client-builder-canvas-bridge.ts` exists for the tree).
 * The registry follows the same pattern: a process-singleton store that the
 * editor PUBLISHES into and the canvas SUBSCRIBES to via `useSyncExternalStore`.
 * `writeClasses` republishes automatically, so the canvas restyles linked
 * blocks the instant a class is created / edited / deleted.
 */
import type {
  BuilderStyleClass,
  BuilderStyleClassRegistry,
} from "./style-classes";

const STORAGE_PREFIX = "tulala:builder:style-classes:v1";

/** localStorage key for a page's class registry. `null` → the home page key. */
export function styleClassStorageKey(pageId: string | null): string {
  return `${STORAGE_PREFIX}:${pageId ?? "home"}`;
}

/** Narrow an unknown value to a well-formed BuilderStyleClass. */
function isStyleClass(value: unknown): value is BuilderStyleClass {
  return (
    Boolean(value) &&
    typeof (value as BuilderStyleClass).id === "string" &&
    typeof (value as BuilderStyleClass).name === "string" &&
    Boolean((value as BuilderStyleClass).style)
  );
}

/**
 * Read the page's class list from localStorage. Returns `[]` on any problem
 * (missing key, malformed JSON, SSR/no-window) so callers never crash on a
 * bad/absent registry. Filters out malformed entries defensively.
 */
export function readClasses(pageId: string | null): BuilderStyleClass[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(styleClassStorageKey(pageId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(isStyleClass);
  } catch {
    return [];
  }
}

/**
 * Persist the page's class list. Returns `true` only when the write actually
 * succeeded — a caller that is about to collapse a block down to a bare
 * `{ classRef }` can first confirm the class landed (otherwise the reference
 * would resolve to nothing and blank the block; see W1-T3). A successful write
 * also republishes the registry to the cross-subtree bridge so the live canvas
 * repaints.
 */
export function writeClasses(
  pageId: string | null,
  classes: ReadonlyArray<BuilderStyleClass>,
): boolean {
  let ok = false;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        styleClassStorageKey(pageId),
        JSON.stringify(classes),
      );
      ok = true;
    }
  } catch {
    /* quota / private-mode — non-fatal; caller keeps the block's own style */
    ok = false;
  }
  // Always refresh the live bridge from what we (attempted to) store so the
  // editor canvas reflects the operator's intent even if persistence failed
  // this session — the reference still resolves in-memory for the live edit.
  publishStyleClassRegistry(toRegistry(classes));
  return ok;
}

/** Build the id→class registry map the renderer's `styleClasses` option wants. */
export function toRegistry(
  classes: ReadonlyArray<BuilderStyleClass>,
): BuilderStyleClassRegistry {
  const out: Record<string, BuilderStyleClass> = {};
  for (const c of classes) out[c.id] = c;
  return out;
}

// ── Cross-subtree live registry bridge ──────────────────────────────────────
//
// Mirrors `client-builder-canvas-bridge.ts` exactly: a singleton store the
// editor publishes into and the client canvas subscribes to. The empty
// registry is a stable shared reference so `useSyncExternalStore`'s snapshot is
// referentially stable between publishes (no infinite re-render).

type Listener = () => void;

const EMPTY_REGISTRY: BuilderStyleClassRegistry = Object.freeze({});

let currentRegistry: BuilderStyleClassRegistry = EMPTY_REGISTRY;
const listeners = new Set<Listener>();

/**
 * Publish the latest live registry. Called from `EditProvider` (on mount /
 * pageId change) and from `writeClasses` (on every create/edit/delete). A
 * no-op when the reference is unchanged, so subscribers don't churn.
 */
export function publishStyleClassRegistry(
  registry: BuilderStyleClassRegistry | null,
): void {
  const next = registry ?? EMPTY_REGISTRY;
  if (Object.is(currentRegistry, next)) return;
  currentRegistry = next;
  for (const listener of listeners) listener();
}

/** `useSyncExternalStore` subscribe — returns an unsubscribe fn. */
export function subscribeStyleClassRegistry(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `useSyncExternalStore` snapshot getter. Stable reference between publishes. */
export function getStyleClassRegistrySnapshot(): BuilderStyleClassRegistry {
  return currentRegistry;
}

/** Server snapshot getter — the canvas has no live registry during SSR. */
export function getStyleClassRegistryServerSnapshot(): BuilderStyleClassRegistry {
  return EMPTY_REGISTRY;
}
