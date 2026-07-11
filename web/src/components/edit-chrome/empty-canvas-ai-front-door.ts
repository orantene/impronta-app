/**
 * W3-AI1 — pure helpers for the "Describe your page" AI front door.
 *
 * The generator itself (the model call + `validateBuilderNodeTree`) ships in
 * `builder-core/ai/generate-nodes-action.ts`; these are the small, React-free,
 * unit-testable pieces the front-door UI is built on:
 *
 *   - `deriveSectionLabels`  — turn a generated `BuilderNodeTree` into the human
 *     chips shown in the preview ("Hero", "Services", …). Extracted from the
 *     inline logic in `empty-canvas-starter.tsx` so it can be tested in isolation
 *     and reused by any surface that previews a generated tree.
 *   - `computeAiFrontDoorPhase` — the idle → generating → preview → error state
 *     machine, derived purely from the flags the component already tracks. The
 *     component stamps the result on `data-ai-front-door-phase` so every state is
 *     observable (and every button therefore answers, never a dead control).
 *   - `shouldOpenAiFrontDoor` / `aiCreatePageHref` — the deep-link contract that
 *     lets the hub "Describe with AI" create entry land on a fresh page with the
 *     brief field focused (`?ai=1`), instead of a second bespoke generate flow.
 *
 * Kept client-safe (no React, no server imports) so it runs under the builder
 * unit-test lane.
 */

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

/** The four states the AI create module can be in. */
export type AiFrontDoorPhase = "idle" | "generating" | "preview" | "error";

/**
 * Human labels for the sections the generator produced, in order. Prefers the
 * node's `props.label`, falls back to its `kind`. Blank/whitespace labels fall
 * through to the kind so a chip is never empty.
 */
export function deriveSectionLabels(tree: BuilderNodeTree): string[] {
  return tree.map((node) => {
    const label = (node as { props?: { label?: unknown } }).props?.label;
    if (typeof label === "string" && label.trim()) return label.trim();
    return (node as { kind?: unknown }).kind != null
      ? String((node as { kind: unknown }).kind)
      : "block";
  });
}

/**
 * Derive the front-door phase from the flags the component tracks. Priority:
 * an in-flight generate wins (show the "Designing…" state); a stashed preview
 * wins over a compose-level error (the operator is reviewing a draft, any
 * apply/regenerate error is shown inline within the preview); a compose-level
 * error with no preview surfaces the retry state; otherwise idle.
 */
export function computeAiFrontDoorPhase(input: {
  generating: boolean;
  hasPreview: boolean;
  error: string | null | undefined;
}): AiFrontDoorPhase {
  if (input.generating) return "generating";
  if (input.hasPreview) return "preview";
  if (input.error) return "error";
  return "idle";
}

/** Minimal read-only view of a URLSearchParams-like object. */
interface ReadableSearchParams {
  get(key: string): string | null;
}

/**
 * Whether the surface should open with the AI brief focused. True only for the
 * explicit `?ai=1` deep-link the hub "Describe with AI" create entry appends —
 * a normal `?edit=1` load keeps the manual "Start here" affordance in focus.
 */
export function shouldOpenAiFrontDoor(
  search: ReadableSearchParams | null | undefined,
): boolean {
  if (!search) return false;
  return search.get("ai") === "1";
}

/**
 * The href a "Describe with AI" create entry navigates to after it mints a fresh
 * draft page: the new page in edit mode with the AI front door primed (`ai=1`).
 * An empty/blank slug is the homepage (root) — matching the rest of the page
 * manager's `slug ? "/${slug}" : "/"` convention.
 */
export function aiCreatePageHref(slug: string | null | undefined): string {
  const clean = (slug ?? "").trim();
  const base = clean ? `/${clean}` : "/";
  return `${base}?edit=1&ai=1`;
}
