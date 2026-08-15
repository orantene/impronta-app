/**
 * Minimal ambient types for `jsdom`.
 *
 * `jsdom` is a declared devDependency but ships no bundled types, and
 * `@types/jsdom` is not installed — so importing it in a test fails tsc with
 * TS7016 ("implicitly has an 'any' type"). The repo already carries hand-
 * written shims for untyped modules under `src/types/`, so this follows that
 * pattern rather than adding a dependency.
 *
 * Deliberately narrow: it declares the surface the builder tests actually use
 * (construct a document, reach into `window` to borrow DOM globals) and types
 * `window` as the real DOM `Window`, so callers keep full DOM typing on
 * everything they pull off it. It is NOT a blanket `declare module "jsdom"`,
 * which would silently type the whole module as `any` and hide real mistakes.
 */
declare module "jsdom" {
  export interface ConstructorOptions {
    url?: string;
    referrer?: string;
    contentType?: string;
    includeNodeLocations?: boolean;
    pretendToBeVisual?: boolean;
    runScripts?: "dangerously" | "outside-only";
  }

  export class JSDOM {
    constructor(html?: string, options?: ConstructorOptions);
    /**
     * The simulated window. Typed as the DOM lib's `Window` (plus the globals
     * jsdom exposes on it that the lib type does not model as own members), so
     * borrowed globals keep their real types.
     */
    readonly window: Window &
      typeof globalThis & {
        HTMLElement: typeof HTMLElement;
        HTMLIFrameElement: typeof HTMLIFrameElement;
        Element: typeof Element;
        Node: typeof Node;
        MutationObserver: typeof MutationObserver;
        CustomEvent: typeof CustomEvent;
      };
    serialize(): string;
  }
}
