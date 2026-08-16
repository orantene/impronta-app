/**
 * Token-key constants for the Card Design Studio.
 *
 * The keys themselves now live in `lib/site-admin/tokens/card-design-scope.ts`
 * because the SERVER publish path needs the same list: publishing from this
 * studio promotes exactly this scope and nothing else. This module re-exports
 * them so existing shell imports keep working.
 *
 * CYCLE WARNING (2026-08-03 sev-1, still binding). This file used to import
 * CARD_FAMILY_TOKEN_KEY / CARD_COLOR_KNOBS from ./CardDesignStudio-3 while
 * CardDesignStudio-3 re-exported CARD_DESIGN_TOKEN_KEYS from here — a
 * two-module cycle. In the production chunk graph CardDesignStudio-3 evaluated
 * first, hit the re-export above its own const declarations, and this module
 * read CARD_COLOR_KNOBS inside its temporal dead zone: `ReferenceError: Cannot
 * access 'oo' before initialization` at module evaluation, which took down the
 * ENTIRE admin shell on production (dev chunking masked it, so tsc / lint /
 * `next build` / dev QA were all green).
 *
 * The rule that prevents it: this file may only import from LEAF modules that
 * import nothing themselves. `card-design-scope.ts` is exactly that — it is
 * dependency-free by contract, so no cycle can form through it. UI vocabulary
 * (labels/hints) still lives in CardDesignStudio-3, and the import direction
 * stays strictly CardDesignStudio-* → this file. The key-parity contract with
 * CARD_COLOR_KNOBS is pinned in
 * lib/site-admin/edit-mode/save-card-design-tokens-merge.test.ts.
 */

export {
  CARD_COLOR_KNOB_KEYS,
  CARD_DESIGN_TOKEN_KEYS,
  CARD_FAMILY_TOKEN_KEY,
} from "@/lib/site-admin/tokens/card-design-scope";
