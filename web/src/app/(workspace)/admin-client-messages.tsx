"use client";

import { mergeClientMessages } from "@/i18n/messages.client";

/**
 * TUL-1773: hands the browser translator the workspace-only message subtrees. Renders nothing;
 * the merge happens during render so it precedes every descendant's first key lookup.
 */
export function AdminClientMessages({ payload }: { payload: Record<string, Record<string, unknown>> }) {
  mergeClientMessages(payload);
  return null;
}
