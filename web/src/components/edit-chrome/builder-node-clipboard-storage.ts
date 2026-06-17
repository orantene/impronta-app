/**
 * Builder node clipboard — sessionStorage seam (Builder 2026 M3).
 *
 * Self-contained persistence helpers peeled out of edit-context.tsx (MAINT-1).
 * These read/write a single copied builder node (v1) and a multi-node clipboard
 * (v2) to `window.sessionStorage` so a copied block survives a same-tab reload.
 * Pure functions — no React state, no surface branches. The cross-tab / OS
 * clipboard half lives in ./builder-clipboard.ts; these are the in-session
 * fallback store. Behavior is byte-identical to the inlined originals.
 */

import {
  BUILDER_NODE_REGISTRY,
  builderNodeKindAllowedAtRoot,
  validateBuilderNodeTree,
  type BuilderNode,
} from "@/lib/site-admin/builder-node";
import type { SerializedBuilderNodeClipboard } from "./builder-clipboard";

export const BUILDER_NODE_CLIPBOARD_STORAGE_KEY =
  "impronta.builderNodeClipboard.v1";
export const BUILDER_NODE_MULTI_CLIPBOARD_STORAGE_KEY =
  "impronta.builderNodeClipboard.v2";

export function validateStoredBuilderNodeClipboard(
  input: unknown,
): BuilderNode | null {
  if (typeof input !== "object" || input == null) return null;
  const rawKind = (input as { kind?: unknown }).kind;
  if (typeof rawKind !== "string" || !(rawKind in BUILDER_NODE_REGISTRY)) {
    return null;
  }
  const kind = rawKind as BuilderNode["kind"];
  if (kind === "section") return null;

  if (builderNodeKindAllowedAtRoot(kind)) {
    const validation = validateBuilderNodeTree([input]);
    return validation.ok ? (validation.tree[0] ?? null) : null;
  }

  const wrapper =
    kind === "accordion_item"
      ? {
          id: "__clipboard_accordion__",
          kind: "accordion" as const,
          props: {},
          children: [input],
        }
      : kind === "tab_panel"
        ? {
            id: "__clipboard_tabs__",
            kind: "tabs" as const,
            props: {},
            children: [input],
          }
        : {
            id: "__clipboard_container__",
            kind: "container" as const,
            props: { layout: "stack" as const },
            children: [input],
          };

  const validation = validateBuilderNodeTree([wrapper]);
  if (!validation.ok) return null;
  const parsedWrapper = validation.tree[0];
  if (
    !parsedWrapper ||
    !("children" in parsedWrapper) ||
    !Array.isArray(parsedWrapper.children)
  ) {
    return null;
  }
  return parsedWrapper.children[0] ?? null;
}

export function readStoredBuilderNodeClipboard(): BuilderNode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BUILDER_NODE_CLIPBOARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return validateStoredBuilderNodeClipboard(parsed);
  } catch {
    return null;
  }
}

export function writeStoredBuilderNodeClipboard(node: BuilderNode | null) {
  if (typeof window === "undefined") return;
  try {
    if (!node || node.kind === "section") {
      window.sessionStorage.removeItem(BUILDER_NODE_CLIPBOARD_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      BUILDER_NODE_CLIPBOARD_STORAGE_KEY,
      JSON.stringify(node),
    );
  } catch {
    // Storage can fail in private browsing or under quota. The in-memory
    // clipboard still works for the current edit session.
  }
}

export function readStoredBuilderNodeMultiClipboard(): SerializedBuilderNodeClipboard | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BUILDER_NODE_MULTI_CLIPBOARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SerializedBuilderNodeClipboard>;
    if (parsed.version !== 2 || !Array.isArray(parsed.nodes)) return null;
    const nodes = parsed.nodes
      .map((node) => validateStoredBuilderNodeClipboard(node))
      .filter((node): node is BuilderNode => Boolean(node));
    return nodes.length > 0 ? { version: 2, nodes } : null;
  } catch {
    return null;
  }
}

export function writeStoredBuilderNodeMultiClipboard(
  clipboard: SerializedBuilderNodeClipboard | null,
) {
  if (typeof window === "undefined") return;
  try {
    if (!clipboard || clipboard.nodes.length === 0) {
      window.sessionStorage.removeItem(BUILDER_NODE_MULTI_CLIPBOARD_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      BUILDER_NODE_MULTI_CLIPBOARD_STORAGE_KEY,
      JSON.stringify(clipboard),
    );
  } catch {
    // Clipboard persistence is best-effort only.
  }
}
