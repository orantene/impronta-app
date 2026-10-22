/**
 * TUL-1812: a public visitor never sees an empty placeholder.
 *
 * Template components that find no facts emit one honest line inside a band
 * ("Hours are not published yet."). That line is a hint for the owner, not
 * content for a visitor. A band whose only children are such lines is hidden
 * on the published site and still shown in the editor preview.
 *
 * Pure leaf module: safe for client and unit tests.
 */

import { COMPONENT_EMPTY_STATES } from "@/lib/site-admin/builder-core/site-templates/copy";

const PLACEHOLDERS: ReadonlySet<string> = new Set(
  Object.values(COMPONENT_EMPTY_STATES).flatMap((pair) => [pair.es, pair.en]).filter((s) => s.length > 0),
);

type LooseNode = {
  kind?: unknown;
  props?: { text?: unknown; i18n?: unknown } | null;
  children?: unknown;
};

function paragraphIsPlaceholder(child: LooseNode): boolean {
  if (child.kind !== "paragraph") return false;
  const text = child.props?.text;
  if (typeof text !== "string" || !PLACEHOLDERS.has(text.trim())) return false;
  // An owner who rewrote the line in another locale has authored content.
  const i18n = child.props?.i18n;
  if (i18n && typeof i18n === "object") {
    for (const overlay of Object.values(i18n as Record<string, unknown>)) {
      const t = (overlay as { text?: unknown } | null)?.text;
      if (typeof t === "string" && t.trim() && !PLACEHOLDERS.has(t.trim())) return false;
    }
  }
  return true;
}

/** True when a container holds nothing but template empty-state lines. */
export function isEmptyPlaceholderBand(node: LooseNode): boolean {
  if (node.kind !== "container") return false;
  const children = node.children;
  if (!Array.isArray(children) || children.length === 0) return false;
  return children.every((c) => !!c && typeof c === "object" && paragraphIsPlaceholder(c as LooseNode));
}
