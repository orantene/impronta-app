import type { BuilderNodeKind } from "./types";

/**
 * Mint a unique builder node id.
 *
 * Kept in its own module (no runtime imports beyond the pure `types` file) so
 * that any file in the builder-node graph can import it without participating
 * in the circular-dependency chain that runs through `create.ts` →
 * `section-embed-presets.ts` → page-designs → `impronta.ts`.
 */
/**
 * RFC-4122-shaped random id. Prefers `crypto.randomUUID()`, but that is only
 * defined in a SECURE CONTEXT (https / localhost). The builder must not hard
 * crash when opened over plain http on a custom host (e.g. a local
 * `*.lvh.me` QA host), so fall back to `crypto.getRandomValues` and finally to
 * `Math.random`. A builder node id only needs uniqueness, not cryptographic
 * strength, so any of these is acceptable.
 */
export function randomUuid(): string {
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Set RFC-4122 version (4) + variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function makeId(kind: BuilderNodeKind): string {
  return `builder-${kind}-${randomUuid()}`;
}
