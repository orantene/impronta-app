/**
 * Gridline demo page copy, derived from a demo's content fixture.
 *
 * The Gridline design ships its hero spec cells, spec-table values, task
 * targets and top-bar line empty on purpose (they are design-owned editable
 * defaults, never baked into the payload for every talent). A demo fills them
 * the way a talent would in the builder: through the site-copy mechanism
 * (`site-copy.ts`, `DemoSiteCopy.gridline`). This module is the pure bridge
 * from the fixture to that copy. No I/O.
 */
import { BUILDER_ICON_NAMES } from "@/lib/site-admin/builder-node/icon-registry";
import type { DemoContentFixture } from "./content-fixture";
import type { GridlineSiteCopy } from "./site-copy";

/** The mockup's own glyph keys, mapped to the product's icon registry. */
const MOCKUP_ICONS: Readonly<Record<string, string>> = {
  dark: "moon",
  lamp: "sun",
  trip: "zap",
  panel: "grid",
  plug: "zap",
  spark: "flame",
};

export function taskIconFor(key: string): string {
  const mapped = MOCKUP_ICONS[key] ?? key;
  return (BUILDER_ICON_NAMES as readonly string[]).includes(mapped) ? mapped : "check";
}

/** Fixture to `DemoSiteCopy.gridline`. `offeringIdOf` resolves a fixture service id to its offering row. */
export function gridlineCopyFromFixture(
  f: DemoContentFixture,
  offeringIdOf: (serviceId: string) => string | undefined,
): GridlineSiteCopy {
  const out: GridlineSiteCopy = {};
  if (f.topBar || f.urgency) {
    out.topBar = {
      ...(f.topBar?.subtitle ? { subtitle: f.topBar.subtitle } : {}),
      ...(f.topBar?.phoneAriaLabel ? { callLabel: f.topBar.phoneAriaLabel } : {}),
      ...(f.urgency?.statusOn ? { statusOn: f.urgency.statusOn } : {}),
      ...(f.urgency?.statusOff ? { statusOff: f.urgency.statusOff } : {}),
    };
  }
  if (f.urgency) {
    out.alert = {
      title: f.urgency.band.title,
      safetyLead: f.urgency.band.safetyLead,
      safety: f.urgency.band.safety,
      ctaLabel: f.urgency.dock.on.label,
    };
  }
  const h = f.hero;
  out.hero = {
    ...(h.eyebrow ? { kicker: h.eyebrow } : {}),
    ...(h.headline ? { headline: h.headline } : {}),
    ...(h.facts?.length ? { facts: h.facts } : {}),
    ...(h.facts?.length && h.factsI18n ? { factsI18n: h.factsI18n } : {}),
    ...(h.badges?.length ? { badges: h.badges } : {}),
    ...(h.ctas?.length === 2 ? { ctas: [h.ctas[0]!, h.ctas[1]!] as [string, string] } : {}),
  };
  if (f.tasks) {
    const other = f.locale === "es" ? "en" : "es";
    const tr = f.translations?.[other];
    const text = (id: string, own: { label: string; hint: string }) => {
      const t = tr?.tasks?.[id];
      return f.locale === "es"
        ? { label: t?.label ?? own.label, labelEs: own.label, hint: t?.hint ?? own.hint, hintEs: own.hint }
        : { label: own.label, labelEs: t?.label ?? own.label, hint: own.hint, hintEs: t?.hint ?? own.hint };
    };
    const items = f.tasks.items.flatMap((t) => {
      const offeringId = offeringIdOf(t.serviceId);
      if (!offeringId) return [];
      return [{ id: t.id, icon: taskIconFor(t.icon), offeringId, ...text(t.id, t) }];
    });
    const fb = f.tasks.fallback;
    const dk = f.locale === "es"
      ? { defaultKicker: tr?.taskDefault?.kicker ?? fb.kicker, defaultKickerEs: fb.kicker, defaultHint: tr?.taskDefault?.hint ?? fb.body, defaultHintEs: fb.body }
      : { defaultKicker: fb.kicker, defaultKickerEs: tr?.taskDefault?.kicker ?? fb.kicker, defaultHint: fb.body, defaultHintEs: tr?.taskDefault?.hint ?? fb.body };
    out.tasks = { title: f.tasks.title, items, defaultOfferingId: offeringIdOf(fb.serviceId) ?? "", ...dk };
  }
  if (f.specTable) {
    out.specTable = { eyebrow: f.specTable.subtitle, title: f.specTable.title, rows: f.specTable.rows, ...(f.specTable.i18n ? { i18n: f.specTable.i18n } : {}) };
  }
  out.services = { title: f.menu.title, subtitle: f.menu.subtitle };
  return out;
}
