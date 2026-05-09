"use client";

import { createShareLinkAction } from "@/lib/site-admin/share-link/share-actions";

/**
 * Default share flow used by ⌘K “Share preview link” and the global ⌘⇧S bind.
 * Mirrors `command-palette.tsx` row `share-link`.
 */
export async function copySharePreviewLinkToClipboard(
  reportMutationError: (msg: string) => void,
): Promise<void> {
  try {
    const res = await createShareLinkAction({});
    if (!res.ok) {
      reportMutationError(res.error);
      return;
    }
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }
    const url = `${window.location.origin}${res.path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Share link", url);
    }
  } catch (err) {
    reportMutationError(
      err instanceof Error ? err.message : "Failed to create share link.",
    );
  }
}
