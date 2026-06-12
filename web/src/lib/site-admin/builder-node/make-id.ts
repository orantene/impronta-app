import type { BuilderNodeKind } from "./types";

/**
 * Mint a unique builder node id.
 *
 * Kept in its own module (no runtime imports beyond the pure `types` file) so
 * that any file in the builder-node graph can import it without participating
 * in the circular-dependency chain that runs through `create.ts` →
 * `section-embed-presets.ts` → page-designs → `impronta.ts`.
 */
export function makeId(kind: BuilderNodeKind): string {
  return `builder-${kind}-${crypto.randomUUID()}`;
}
