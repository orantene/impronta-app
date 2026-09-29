/**
 * Tiny tree walk for Max-site data-source needs (keeps render-max-site under
 * the 800-line cap).
 */
export function builderTreeHasKind(nodes: unknown, kind: string): boolean {
  if (Array.isArray(nodes)) return nodes.some((n) => builderTreeHasKind(n, kind));
  if (!nodes || typeof nodes !== "object") return false;
  const n = nodes as { kind?: unknown; children?: unknown };
  return n.kind === kind || builderTreeHasKind(n.children, kind);
}

/** An accordion bound to the talent's published FAQ (`talent_faq_items`). */
export function builderTreeHasFaqBind(nodes: unknown): boolean {
  if (Array.isArray(nodes)) return nodes.some((n) => builderTreeHasFaqBind(n));
  if (!nodes || typeof nodes !== "object") return false;
  const n = nodes as { kind?: unknown; props?: { bindSource?: unknown }; children?: unknown };
  return (
    (n.kind === "accordion" && n.props?.bindSource === "talent_faq_items") ||
    builderTreeHasFaqBind(n.children)
  );
}
