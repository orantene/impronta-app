/**
 * Gridline demo page copy, derived from a demo's content fixture.
 *
 * The Gridline design ships its hero spec cells, spec-table values, task
 * targets and top-bar line empty on purpose (they are design-owned editable
 * defaults, never baked into the payload for every talent). A demo fills them
 * the way a talent would in the builder: through the site-copy mechanism
 * (`site-copy.ts`, `DemoSiteCopy.gridline`). This module is the pure bridge
 * from the fixture to that copy. No I/O.
 *
 * When the fixture carries a second language (`translations.en` on a Spanish
 * primary demo), the copy also carries `overlays.en` so every written node
 * gets `props.i18n.en` and `/en` never falls back to Spanish. Theme seed
 * defaults already ship es+en via `seed-i18n.ts`; this path covers the
 * demo-filled (and talent-edited) chrome the seed leaves empty.
 */
import { BUILDER_ICON_NAMES } from "@/lib/site-admin/builder-node/icon-registry";
import type { DemoContentFixture } from "./content-fixture";
import type { GridlineSiteCopy, GridlineSiteCopyOverlay } from "./site-copy";

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

/** Build the second-language overlay bag from a fixture translation (and factsI18n). */
function overlayFromFixture(
  f: DemoContentFixture,
  lang: "en" | "es",
): GridlineSiteCopyOverlay | undefined {
  const tr = f.translations?.[lang];
  const out: GridlineSiteCopyOverlay = {};
  if (tr?.topBar) {
    out.topBar = { subtitle: tr.topBar.subtitle, callLabel: tr.topBar.phoneAriaLabel };
  }
  if (tr?.urgency) {
    out.topBar = {
      ...(out.topBar ?? {}),
      statusOn: tr.urgency.statusOn,
      statusOff: tr.urgency.statusOff,
    };
    out.alert = {
      title: tr.urgency.band.title,
      safetyLead: tr.urgency.band.safetyLead,
      safety: tr.urgency.band.safety,
      ctaLabel: tr.urgency.ctaLabel,
    };
  }
  if (tr?.hero) {
    out.hero = {
      kicker: tr.hero.eyebrow,
      headline: tr.hero.headline,
      badges: [...tr.hero.badges],
      ctas: [tr.hero.ctas[0]!, tr.hero.ctas[1]!] as [string, string],
    };
  }
  if (tr?.tasksTitle) out.tasks = { title: tr.tasksTitle };
  if (tr?.specTable) {
    out.specTable = {
      eyebrow: tr.specTable.subtitle,
      title: tr.specTable.title,
      rows: tr.specTable.rows.map((r) => ({ ...r })),
    };
  }
  if (tr?.menu) out.services = { title: tr.menu.title, subtitle: tr.menu.subtitle };
  return Object.keys(out).length ? out : undefined;
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
    out.specTable = { eyebrow: f.specTable.subtitle, title: f.specTable.title, rows: f.specTable.rows };
  }
  out.services = { title: f.menu.title, subtitle: f.menu.subtitle };

  const overlays: NonNullable<GridlineSiteCopy["overlays"]> = {};
  for (const lang of ["en", "es"] as const) {
    if (lang === f.locale) continue;
    const bag = overlayFromFixture(f, lang);
    if (bag) overlays[lang] = bag;
  }
  if (Object.keys(overlays).length) out.overlays = overlays;
  return out;
}
