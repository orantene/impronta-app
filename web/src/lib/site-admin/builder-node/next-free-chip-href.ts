/**
 * The one rule for where a `next_free_chip` may link (release 2.5, HE-6): a
 * same-page anchor (`#services`) or a path on the same site (`/menu`). A
 * protocol-relative `//host`, `javascript:` and absolute URLs are all refused,
 * so a chip can never send a visitor off-site. The schema, the renderer and
 * the inspector all use this one pattern; plain module (no "use client") so
 * the server-side schema can import it.
 */
export const CHIP_HREF_RE = /^(?:#[\w\-./#?=&%]*|\/(?!\/)[\w\-./#?=&%]*)$/;

/** The href when it is allowed, else null (the chip then renders as plain text). */
export function safeChipHref(href?: string): string | null {
  const h = href?.trim();
  return h && CHIP_HREF_RE.test(h) ? h : null;
}
