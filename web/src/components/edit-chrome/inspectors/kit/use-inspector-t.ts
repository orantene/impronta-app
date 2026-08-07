"use client";

/**
 * WAVE 4.4 — the inspector TRANSLATION BOUNDARY.
 *
 * The deep inspectors (style, layout, motion, data, site-header, and the
 * per-block content panels) carry roughly 700 developer-authored strings that
 * reach the operator exclusively as props on the inspector kit primitives:
 * `label`, `title`, `hint`, `help`, `description`, `placeholder`, and the
 * `label` of an option in a Segmented / Select / chip / card group.
 *
 * Wrapping each of those ~700 call sites in `t(...)` individually would mean a
 * 20,000-line diff across files that three other lanes are actively editing,
 * for zero behavioural difference from translating them once, here, where they
 * are rendered. So the kit primitives translate string props at the boundary:
 * every panel that already passes a plain English string gets Spanish with no
 * edit at all, and a panel that passes a `ReactNode` (icon, fragment, already
 * interpolated value) is passed through untouched.
 *
 * NOT A SECOND i18n SYSTEM. This file owns no strings and no catalog: it is a
 * thin `useEditorLocale()` wrapper that adds the two `ReactNode` / optional
 * shapes the kit props actually have. Every lookup still goes through
 * `editorT` into the one EN-text-keyed `ES_TEXT` map (`editor-i18n.ts`, split
 * across `editor-i18n-es*.ts` for the 800-line cap). The inspector strings
 * live in `editor-i18n-es-inspectors.ts`, spread into that same map, and are
 * seen by both the parity guard and the duplicate-key guard. Unknown strings
 * fall back to their English input unchanged, so tenant-authored values that
 * flow through a `label` prop are never mangled.
 *
 * The coverage is enforced by `es-parity-inspectors.static.test.ts`, which
 * harvests those same boundary props out of `inspectors/**` and fails when one
 * has no Spanish entry: the analogue of the wave-0 call-site guard for
 * strings that are translated at the boundary rather than at the call site.
 */

import { useMemo } from "react";
import type { ReactNode } from "react";

import { useEditorLocale } from "../../use-editor-locale";

export interface InspectorTranslator {
  /** Translate a required string (label, title, placeholder). */
  t: (value: string) => string;
  /** Translate a `ReactNode` prop: plain strings only, everything else passes through. */
  tn: <T extends ReactNode>(node: T) => T | string;
  /** Translate an optional string prop, preserving `undefined`. */
  to: (value: string | undefined) => string | undefined;
}

export function useInspectorT(): InspectorTranslator {
  const { t } = useEditorLocale();
  return useMemo<InspectorTranslator>(
    () => ({
      t: (value: string) => t(value),
      tn: <T extends ReactNode>(node: T) =>
        typeof node === "string" ? t(node) : node,
      to: (value: string | undefined) =>
        typeof value === "string" ? t(value) : value,
    }),
    [t],
  );
}
