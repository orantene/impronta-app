/**
 * Builder block clipboard — sessionStorage + OS clipboard (Builder 2026 M3).
 *
 * Writes a versioned JSON payload to both sessionStorage (same-tab fallback)
 * and `navigator.clipboard` so blocks can move across tabs and sessions.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node";

export const BUILDER_CLIPBOARD_MIME =
  "application/x-impronta-builder-node+json";

export interface SerializedBuilderNodeClipboard {
  version: 2;
  nodes: BuilderNode[];
}

export function serializeBuilderClipboard(
  clipboard: SerializedBuilderNodeClipboard,
): string {
  return JSON.stringify(clipboard);
}

export async function writeOsBuilderClipboard(
  clipboard: SerializedBuilderNodeClipboard,
): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write) {
    return false;
  }
  const json = serializeBuilderClipboard(clipboard);
  try {
    const item = new ClipboardItem({
      [BUILDER_CLIPBOARD_MIME]: new Blob([json], { type: BUILDER_CLIPBOARD_MIME }),
      "text/plain": new Blob(
        [clipboard.nodes.map((n) => n.kind).join(", ") || "builder-block"],
        { type: "text/plain" },
      ),
    });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return false;
  }
}

export async function readOsBuilderClipboard(): Promise<SerializedBuilderNodeClipboard | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) {
    return null;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes(BUILDER_CLIPBOARD_MIME)) {
        const blob = await item.getType(BUILDER_CLIPBOARD_MIME);
        const text = await blob.text();
        const parsed = JSON.parse(text) as Partial<SerializedBuilderNodeClipboard>;
        if (parsed.version === 2 && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
          return { version: 2, nodes: parsed.nodes as BuilderNode[] };
        }
      }
    }
  } catch {
    // Permission denied or unsupported — fall back to sessionStorage.
  }
  return null;
}
