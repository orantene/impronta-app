import type { BuilderNode } from "@/lib/site-admin/builder-node";
import { MAX_ITEMS_PER_ZONE } from "@/lib/site-admin/sections/site_header/regions-editing";

/**
 * TUL-240: add a `{ type: "social" }` item right after the `language` item of the
 * header regions, AT RENDER TIME for paid Web Office sites only. Never baked into
 * design payloads (authored-overlay hashes stay put). Idempotent: a header that
 * already has a social item is left alone, and a full zone is never overfilled
 * (the header schema caps a zone, and a failed parse would drop the whole header).
 * What the item shows comes from `siteChrome.social`, set by the renderer.
 */
export function withSocialItem(header: BuilderNode): BuilderNode {
  const props = (header.props ?? {}) as Record<string, unknown>;
  const sectionProps = (props.sectionProps ?? {}) as Record<string, unknown>;
  const regions = sectionProps.regions as Record<string, unknown> | undefined;
  if (!regions || typeof regions !== "object") return header;
  const has = Object.values(regions).some(
    (items) => Array.isArray(items) && items.some((i) => (i as { type?: string } | null)?.type === "social"),
  );
  if (has) return header;
  const out: Record<string, unknown> = {};
  let done = false;
  for (const [zone, items] of Object.entries(regions)) {
    if (!Array.isArray(items)) {
      out[zone] = items;
      continue;
    }
    const at = items.findIndex((i) => (i as { type?: string } | null)?.type === "language");
    if (!done && at >= 0 && items.length < MAX_ITEMS_PER_ZONE) {
      out[zone] = [...items.slice(0, at + 1), { type: "social", responsive: { mobile: "show" } }, ...items.slice(at + 1)];
      done = true;
    } else out[zone] = items;
  }
  if (!done) return header;
  return { ...header, props: { ...props, sectionProps: { ...sectionProps, regions: out } } } as unknown as BuilderNode;
}
