"use client";

import { useMemo } from "react";

import {
  detectEditorLocale,
  editorT,
  type EditorLocale,
} from "./editor-i18n";

/** Editor chrome locale — separate from page content locale. */
export function useEditorLocale(): {
  locale: EditorLocale;
  t: typeof editorT;
} {
  const locale = useMemo(() => detectEditorLocale(), []);
  return useMemo(
    () => ({
      locale,
      t: (key: Parameters<typeof editorT>[0]) => editorT(key, locale),
    }),
    [locale],
  );
}
