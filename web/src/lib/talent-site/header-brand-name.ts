import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/**
 * Never-empty header brand (TUL-425). Every Design wears the shared
 * `site_header` whose brand label was baked from `{{displayName}}` when the
 * Design was applied. A fresh onboarding site can apply before the profile has
 * a display name, so the label baked as "" and the header showed only the nav.
 * This pure render-time fallback fixes every theme without touching a payload:
 * logo > the name already in the header > display name > site slug.
 * A label the talent wrote (or any non-blank label) is never overwritten.
 */
type Rec = Record<string, unknown>;

const usable = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && !s.includes("{{") ? s : "";
};

/** First usable candidate (display name first, then slug), else "". */
export function resolveHeaderBrandName(candidates: ReadonlyArray<string | null | undefined>): string {
  for (const c of candidates) {
    const s = usable(c);
    if (s) return s;
  }
  return "";
}

const hasBrandItem = (regions: Rec): boolean =>
  ["left", "center", "right"].some(
    (z) => Array.isArray(regions[z]) && (regions[z] as Rec[]).some((i) => i?.type === "wordmark" || i?.type === "logo"),
  );

export function withHeaderBrandName(node: BuilderNode, name: string): BuilderNode {
  const props = node.props as unknown as Rec;
  if (node.kind !== "section" || props.sectionTypeKey !== "site_header" || !name) return node;
  const sp = (props.sectionProps ?? {}) as Rec;
  const brand = (sp.brand ?? {}) as Rec;
  if (usable(brand.label) || usable(brand.logoUrl)) return node;
  const next: Rec = {
    ...sp,
    brand: { ...brand, label: name, ...(usable(brand.logoAlt) ? {} : { logoAlt: name }) },
    brandDisplay: sp.brandDisplay === "image" || sp.brandDisplay === "image-and-text" ? "text" : (sp.brandDisplay ?? "text"),
  };
  const regions = sp.regions as Rec | undefined;
  if (regions && typeof regions === "object" && !hasBrandItem(regions)) {
    const left = Array.isArray(regions.left) ? (regions.left as unknown[]) : [];
    next.regions = { ...regions, left: [{ type: "wordmark" }, ...left] };
  }
  return { ...node, props: { ...props, sectionProps: next } } as unknown as BuilderNode;
}

/** Blank `utility_bar` name (Gridline's header lockup) gets the same fallback. */
function withUtilityBarName(node: BuilderNode, name: string): BuilderNode {
  if (node.kind === "utility_bar") {
    const props = node.props as unknown as Rec;
    return usable(props.name) ? node : ({ ...node, props: { ...props, name } } as unknown as BuilderNode);
  }
  const kids = (node as { children?: BuilderNode[] }).children;
  if (!Array.isArray(kids) || kids.length === 0) return node;
  const next = kids.map((k) => withUtilityBarName(k, name));
  return next.every((k, i) => k === kids[i]) ? node : ({ ...node, children: next } as BuilderNode);
}

/** Apply to the shell header (a `site_header` section, or a utility bar inside the header container). */
export function withShellBrandName(
  tree: BuilderNode[],
  candidates: ReadonlyArray<string | null | undefined>,
): BuilderNode[] {
  const name = resolveHeaderBrandName(candidates);
  return name ? tree.map((n) => withUtilityBarName(withHeaderBrandName(n, name), name)) : tree;
}
