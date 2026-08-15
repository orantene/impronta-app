"use client";

import { createShareLinkAction } from "@/lib/site-admin/share-link/share-actions";

/**
 * Page identity of the surface the operator is editing. Forwarded verbatim to
 * `createShareLinkAction` so the minted token binds THIS page's latest
 * revision. Omitting it falls back to the homepage — correct for the
 * storefront homepage (it mounts with no slug), wrong for anything else,
 * which is exactly the bug this parameter exists to close.
 */
export interface SharePreviewPageRef {
  pageId?: string | null;
  pageSlug?: string | null;
  locale?: string;
}

/**
 * Default share flow used by ⌘K “Share preview link” and the global ⌘⇧S bind.
 * Mirrors `command-palette.tsx` row `share-link`.
 */
export async function copySharePreviewLinkToClipboard(
  reportMutationError: (msg: string) => void,
  pageRef: SharePreviewPageRef = {},
): Promise<void> {
  try {
    const res = await createShareLinkAction({
      locale: pageRef.locale,
      pageId: pageRef.pageId ?? null,
      pageSlug: pageRef.pageSlug ?? null,
    });
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
      err instanceof Error ? err.message : "Couldn't create the share link. Try again.",
    );
  }
}
