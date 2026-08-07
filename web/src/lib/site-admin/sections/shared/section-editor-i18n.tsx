"use client";

/**
 * Section Editor panel i18n seam (WAVE 4.5).
 *
 * WHY A CONTEXT AND NOT A DIRECT IMPORT
 * ─────────────────────────────────────
 * The editor-chrome translator lives in `components/edit-chrome/`
 * (`useEditorLocale` + the `ES_TEXT` catalog). `lib/site-admin/**` is forbidden
 * from importing `components/edit-chrome/**` — that edge is frozen by
 * `builder-core/lib-edit-chrome-cycle-guard.static.test.ts`, whose allow-list is
 * explicitly a burn-down, not a place to add 55 new entries.
 *
 * So the dependency is inverted: this leaf module (in lib, importing nothing)
 * owns the CONTRACT, and the edit-chrome host that renders a section Editor
 * supplies the implementation through `SectionEditorI18nProvider`. Section
 * Editors call `useSectionT()` and never learn where the translation came from.
 *
 * The default is the identity function, so a section Editor rendered outside a
 * provider (tests, storybook-style harnesses, the composer route) keeps showing
 * its English source strings instead of blanks.
 */

import { createContext, useContext, type ReactNode } from "react";

/** Translate an English source string. Returns the input when uncovered. */
export type SectionEditorTranslate = (text: string) => string;

const identity: SectionEditorTranslate = (text) => text;

const SectionEditorI18nContext = createContext<SectionEditorTranslate>(identity);

export function SectionEditorI18nProvider({
  t,
  children,
}: {
  t: SectionEditorTranslate;
  children: ReactNode;
}) {
  return (
    <SectionEditorI18nContext.Provider value={t}>
      {children}
    </SectionEditorI18nContext.Provider>
  );
}

/**
 * The translator for a section Editor panel. Wrap user-visible English copy:
 * `t("Background image")`. Every wrapped literal needs an ES entry in the same
 * commit — enforced by `edit-chrome/es-parity.static.test.ts`.
 */
export function useSectionT(): SectionEditorTranslate {
  return useContext(SectionEditorI18nContext);
}
