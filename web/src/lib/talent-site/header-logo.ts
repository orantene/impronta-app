import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/**
 * Put the talent's own site logo (talent_sites.logo_url) into a `site_header`
 * landmark. The talent's logo OVERRIDES any theme default brand logo.
 *
 * Two header shapes exist:
 *  - classic: `brand` + `brandDisplay` (text | image | image-and-text);
 *  - regions (most themes): items `wordmark` / `logo`. A theme that ships only
 *    a `wordmark` item never rendered the logo, even with one saved. Every
 *    `wordmark` item becomes a `logo` item in the same slot, so the logo takes
 *    the wordmark's place. With NO logo this function is never called and the
 *    wordmark stays.
 */
export function withHeaderLogo(node: BuilderNode, logoUrl: string): BuilderNode {
  const props = node.props as Record<string, unknown>;
  if (node.kind !== "section" || props.sectionTypeKey !== "site_header") return node;
  const sp = (props.sectionProps ?? {}) as Record<string, unknown>;
  const brand = (sp.brand ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = {
    ...sp,
    brand: { ...brand, logoUrl },
    brandDisplay: sp.brandDisplay === "text" || !sp.brandDisplay ? "image-and-text" : sp.brandDisplay,
  };
  const regions = sp.regions as Record<string, unknown> | undefined;
  if (regions && typeof regions === "object") {
    const swap = (items: unknown): unknown => {
      if (!Array.isArray(items)) return items;
      const hasLogo = items.some((i) => (i as { type?: string })?.type === "logo");
      return items.flatMap((i) => {
        const item = i as { type?: string };
        if (item?.type !== "wordmark") return [i];
        return hasLogo ? [] : [{ ...item, type: "logo" }];
      });
    };
    next.regions = {
      ...regions,
      left: swap(regions.left),
      center: swap(regions.center),
      right: swap(regions.right),
    };
  }
  return { ...node, props: { ...props, sectionProps: next } } as unknown as BuilderNode;
}
