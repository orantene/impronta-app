/**
 * What the inspector should render for a node's NESTED translatable text.
 *
 * Pure on purpose: the component is then a thin map over this, and the part
 * worth guaranteeing — which paths appear, which value each locale tab shows,
 * which tabs get a filled dot — is testable against REAL nodes from every
 * component shape, with no DOM and no editor context.
 *
 * Derived from `translatableTextOf`, the one definition shared with the
 * renderer, the migration and the Translations panel. A component that grows
 * nested text later appears here automatically; nothing is registered per kind.
 */
import type { BuilderNode } from "./types";
import { translatableTextOf, isNestedProp } from "./translatable-text";
import { getAtPath, describeNestedPath } from "./nested-prop-path";
import { overlayHasProp, type BuilderNodeI18nOverlay } from "./i18n-overlay";

export interface NestedTextField {
  /** Dotted path into props — the overlay key `nested-i18n` applies at render. */
  path: string;
  /** Operator-facing row label ("fields 4 · label"). */
  label: string;
  /** The value each locale tab should show. Default locale = the base prop. */
  valueFor: (locale: string) => string;
  /** Whether a locale's dot is filled. */
  hasValueFor: (locale: string) => boolean;
}

export function deriveNestedTextFields(
  node: BuilderNode,
  defaultLocale: string,
): NestedTextField[] {
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  const overlay = (node as { i18n?: BuilderNodeI18nOverlay }).i18n;

  return translatableTextOf(node)
    .filter((entry) => isNestedProp(entry.prop))
    .map(({ prop, value }) => ({
      path: prop,
      label: describeNestedPath(prop),
      valueFor: (locale: string) =>
        locale === defaultLocale
          ? (getAtPath(props, prop) ?? "")
          : (overlay?.[locale]?.[prop] ?? ""),
      hasValueFor: (locale: string) =>
        locale === defaultLocale
          ? value.trim().length > 0
          : overlayHasProp(overlay, locale, prop),
    }));
}
