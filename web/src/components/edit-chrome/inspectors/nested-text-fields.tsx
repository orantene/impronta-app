"use client";

/**
 * ONE editor for NESTED translatable text, for every node kind.
 *
 * The inspector edits top-level props by key, so text one level down had no
 * editor at all. On the Spanish contact page the panel listed the form's fields
 * as "Name / Email / Send the brief" while the canvas beside it rendered
 * "Nombre / Correo / Enviar el brief" — the panel was showing the BASE prop and
 * the page was rendering the overlay. Typing a Spanish label there would have
 * overwritten the ENGLISH copy while `/es` kept rendering the overlay on top.
 *
 * WHY GENERIC, not per component: the fields are derived from
 * `translatableTextOf(node)` — the same single definition the renderer, the
 * migration and the Translations panel use. A component that grows nested text
 * later gets a locale editor for free, with no work here. Building this per
 * kind would mean re-solving it for `form`, then `section_embed`, then the next
 * one, and the gap would silently reopen every time.
 *
 * Renders NOTHING for a node with no nested text, so nodes that already work
 * are visually unchanged.
 */
import { useEditContext } from "../edit-context";
import { useActiveContentLocale } from "../active-content-locale-bridge";
import { KIT } from "./kit/tokens";
import { LocaleFieldTabs } from "./locale-field-tabs";
import type { BuilderNode } from "@/lib/site-admin/builder-node";
import { deriveNestedTextFields } from "@/lib/site-admin/builder-node/nested-text-editor-model";
import {
  setAtPath,
  rootKeyOf,
} from "@/lib/site-admin/builder-node/nested-prop-path";
import {
  setOverlayProp,
  type BuilderNodeI18nOverlay,
} from "@/lib/site-admin/builder-node/i18n-overlay";

export function BuilderNodeNestedTextFields({ node }: { node: BuilderNode }) {
  const { availableLocales, defaultLocale, tenantLocales, patchBuilderNodeProps } =
    useEditContext();
  const { locale: activeContentLocale } = useActiveContentLocale();

  // Which rows, which value per tab, which dots — all decided by the pure model
  // that is unit-tested against a real node of every shape on the site.
  const nested = deriveNestedTextFields(node, defaultLocale);
  if (nested.length === 0) return null;

  // Tenant truth, never the adapter's per-row list: a freeform page reports one
  // locale by design, which is exactly what hid the locale tabs on these
  // surfaces in the first place.
  const supported =
    (tenantLocales?.length ?? 0) > 1
      ? tenantLocales
      : availableLocales.length > 0
        ? availableLocales
        : [defaultLocale];
  if (supported.length <= 1) return null;

  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  const overlay = (node as { i18n?: BuilderNodeI18nOverlay }).i18n;

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={KIT.blockHeading}>Nested text</h3>
      {nested.map((field) => (
        <div className={KIT.field} key={field.path}>
          <label className={KIT.label}>{field.label}</label>
          <LocaleFieldTabs
            supportedLocales={supported}
            defaultLocale={defaultLocale}
            activeContentLocale={activeContentLocale}
            ariaLabel={`${field.label} language`}
            hasValueForLocale={field.hasValueFor}
            renderField={(locale, isDefault) => (
              <input
                className={KIT.input}
                defaultValue={field.valueFor(locale)}
                // Remount per (path, locale) so switching tabs shows that
                // locale's value instead of a stale uncontrolled input.
                key={`${node.id}:${field.path}:${locale}`}
                onBlur={(event) => {
                  const next = event.currentTarget.value;
                  if (isDefault) {
                    // The DEFAULT locale is the base prop, written in place.
                    const updated = setAtPath(props, field.path, next);
                    if (updated === props) return; // path vanished — never invent structure
                    const key = rootKeyOf(field.path);
                    void patchBuilderNodeProps(node.id, {
                      [key]: (updated as Record<string, unknown>)[key],
                    });
                    return;
                  }
                  // Every other locale is an overlay entry keyed by the SAME
                  // dotted path `nested-i18n` applies at render.
                  void patchBuilderNodeProps(node.id, {
                    i18n: setOverlayProp(overlay, locale, field.path, next),
                  });
                }}
              />
            )}
          />
        </div>
      ))}
    </section>
  );
}
