/**
 * tree-depth — the ONE nesting-depth number the builder agrees on.
 *
 * WHY ITS OWN MODULE
 * ──────────────────
 * Four places need this cap and they must never drift apart:
 *   • `validate.ts` — the STRICT publish/AI/clipboard validator, which REJECTS
 *     (and therefore drops) a subtree deeper than the cap;
 *   • `normalize-tree-layout.ts` — the draft-save canonicalizer, which flattens
 *     pass-through wrappers so the strict validator never has a reason to drop;
 *   • `performance-budget.ts` — the advisory editor-performance budget;
 *   • `builder-core/ai/generate-nodes.ts` — AI coerce drops nodes deeper than
 *     this before validate ever sees them. A mirrored local `8` here silently
 *     flattened generated trees after the validator moved to 12.
 * `normalize-tree-layout` already imports `validate`, so the constant cannot
 * live in `normalize` (import cycle) and putting it in `validate` would make
 * every consumer of the number pull the whole validator. A leaf constants
 * module keeps the single source of truth cheap to import.
 *
 * WHY 12 (was 8)
 * ──────────────
 * 8 bit real designs. A perfectly ordinary modern marketing mockup spends its
 * levels like this:
 *
 *   1 section · 2 band wrapper · 3 grid · 4 card · 5 media wrap · 6 overlay
 *   · 7 stack · 8 row · 9 icon+label
 *
 * — nine levels before anything unusual happens, so the old cap silently
 * restructured a routine card grid on every save. 12 gives that shape three
 * spare levels (a nested tab panel, an accordion inside a card, a component
 * instance expanded in place) and is still a hard ceiling.
 *
 * Why not higher: the cap is not arbitrary taste, it is what the two consumers
 * can actually take.
 *   • RENDERER: `renderBuilderNodes` recurses once per level with no memo
 *     boundary, and the per-node responsive CSS-var payload is emitted at every
 *     level; depth multiplies the attribute payload on the published HTML.
 *   • VALIDATOR: `validateBuilderNodeTree` walks the same recursion for every
 *     save and every publish preflight.
 * Both are linear in NODE count and only bounded-recursive in depth, so 12 is
 * comfortable (JS stack limits are three orders of magnitude away) — but the
 * editor's own hit-testing and the layers tree get genuinely hard to operate
 * past a dozen levels, so the number is a UX ceiling, not an engine one. The
 * advisory `performance-budget` warn tier fires well before it and tells the
 * operator to flatten by hand, which is the honest order of events: warn first,
 * restructure never-without-telling-you.
 */

/**
 * Max node depth (a root section is depth 1). Shared by the strict validator's
 * default `maxDepth`, the draft normalizer's flatten cap, the performance
 * budget's error tier, and AI coerce — changing it here changes all four
 * together, which is the entire point of this module.
 */
export const BUILDER_MAX_TREE_DEPTH = 12;
