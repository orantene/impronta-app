"use client";

import { mergeClientMessages } from "@/i18n/messages.client";

/**
 * TUL-1935: hands the browser translator the full `public.thread` subtree for the locale the
 * pay page renders in. The root layout inlines the full catalog only for ITS locale and the
 * other locales as just the keys the first one lacks, so when the page locale differs from the
 * layout's the pay labels resolved to their raw keys. Merging during render (not an inline
 * script) also covers soft navigation from /account, where a nested script would not execute.
 */
export function PayClientMessages({ code, thread }: { code: string; thread: unknown }) {
  if (thread && typeof thread === "object") {
    mergeClientMessages({ [code]: { public: { thread: thread as Record<string, unknown> } } });
  }
  return null;
}
