/**
 * Canvas-only hydration for the Template Factory editor (pure, client-safe).
 *
 * The editor document keeps `{{token}}` placeholders; the canvas shows them
 * filled with a demo talent's content. Unlike `hydrateTalentTree` this NEVER
 * prunes a node (every node must stay selectable) and keeps every node id. A
 * string that resolves to nothing shows a localized ghost line instead of an
 * invisible empty box, so the editor can still see and click it.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export const EMPTY_GHOST = {
  en: "Empty for this talent",
  es: "Vacío para este talento",
} as const;

/** Props that carry a URL: an empty value stays empty (a ghost sentence there would be a broken link). */
const URL_KEY_RE = /^(src|href|url|poster|image|imageurl|logo|logourl|video|embed)$|(href|url|src)$/i;

function ghostFor(locale: string | null | undefined): string {
  return (locale ?? "").toLowerCase().startsWith("es") ? EMPTY_GHOST.es : EMPTY_GHOST.en;
}

function resolveString(value: string, key: string, tokens: Readonly<Record<string, string>>, ghost: string): string {
  if (!value.includes("{{")) return value;
  const out = value.replace(TOKEN_RE, (_m, name: string) => tokens[name] ?? "");
  if (out.trim() === "" && !URL_KEY_RE.test(key)) return ghost;
  return out;
}

function resolveValue(value: unknown, key: string, tokens: Readonly<Record<string, string>>, ghost: string): unknown {
  if (typeof value === "string") return resolveString(value, key, tokens, ghost);
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, key, tokens, ghost));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = resolveValue(v, k, tokens, ghost);
    return out;
  }
  return value;
}

/**
 * Replace `{{token}}` in every string prop (deep). Pure, returns a new tree,
 * never drops or re-ids a node. An unknown or empty token reads as the ghost
 * line (non-URL props) or "" (URL props).
 */
export function hydratePlaceholders(
  tree: ReadonlyArray<BuilderNode>,
  placeholders: Readonly<Record<string, string>>,
  locale?: string | null,
): BuilderNode[] {
  const ghost = ghostFor(locale);
  const visit = (node: BuilderNode): BuilderNode => {
    const props = resolveValue(node.props ?? {}, "", placeholders, ghost) as Record<string, unknown>;
    const kids = "children" in node && Array.isArray(node.children) ? node.children.map(visit) : undefined;
    return { ...node, props, ...(kids ? { children: kids } : {}) } as BuilderNode;
  };
  return tree.map(visit);
}
