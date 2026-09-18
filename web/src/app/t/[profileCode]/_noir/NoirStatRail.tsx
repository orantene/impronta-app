/**
 * NoirStatRail — the comp-card module of the Noir profile.
 *
 * Eight vitals, always visible, as a typographic rail (label over serif
 * value, unit in small caps). Everything else the catalog exposes for the
 * talent sits behind ONE native <details> disclosure ("Full comp card"),
 * grouped the way the catalog groups it. No cards, no chips, no JS.
 *
 * Server component. Rows arrive already localised and humanised from
 * profile-view (basicInfoDetailRows + otherDetailRows).
 */

import { pickLocale } from "@/lib/i18n/pick-locale";

export type NoirDetailRow = { key: string; label: string; value: string; group: string };

/** Vital keys in rail order. Short labels replace the catalog's long ones. */
const VITALS: Array<{ key: string; en: string; es: string; unit?: string }> = [
  { key: "physical.height_cm", en: "Height", es: "Altura" },
  { key: "physical.bust_cm", en: "Bust", es: "Busto" },
  { key: "physical.waist_cm", en: "Waist", es: "Cintura" },
  { key: "physical.hips_cm", en: "Hips", es: "Cadera" },
  { key: "physical.shoe_size_eu", en: "Shoe", es: "Calzado", unit: "EU" },
  { key: "physical.dress_size", en: "Dress", es: "Talla" },
  { key: "physical.hair_color", en: "Hair", es: "Cabello" },
  { key: "physical.eye_color", en: "Eyes", es: "Ojos" },
];

/** Split "169 cm" into value + unit so the unit can be set small. */
function splitUnit(value: string): { v: string; u: string | null } {
  const m = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]{1,4})$/);
  return m ? { v: m[1], u: m[2] } : { v: value, u: null };
}

export function splitVitals(rows: NoirDetailRow[]): {
  vitals: Array<{ key: string; label: string; v: string; u: string | null }>;
  rest: NoirDetailRow[];
} {
  const byKey = new Map(rows.map((r) => [r.key, r] as const));
  const vitals: Array<{ key: string; label: string; v: string; u: string | null }> = [];
  const taken = new Set<string>();
  for (const spec of VITALS) {
    const row = byKey.get(spec.key);
    if (!row) continue;
    const { v, u } = splitUnit(row.value);
    vitals.push({ key: row.key, label: row.label, v, u: u ?? spec.unit ?? null });
    taken.add(row.key);
  }
  return { vitals, rest: rows.filter((r) => !taken.has(r.key)) };
}

function shortLabel(key: string, fallback: string, locale: string): string {
  const spec = VITALS.find((s) => s.key === key);
  return spec ? pickLocale(locale, { en: spec.en, es: spec.es }) : fallback;
}

/** Group rows by their resolved group label, first-seen order. */
function groupRows(rows: NoirDetailRow[]): Array<{ group: string; rows: NoirDetailRow[] }> {
  const order: string[] = [];
  const byGroup = new Map<string, NoirDetailRow[]>();
  for (const row of rows) {
    if (!byGroup.has(row.group)) {
      byGroup.set(row.group, []);
      order.push(row.group);
    }
    byGroup.get(row.group)!.push(row);
  }
  return order.map((group) => ({ group, rows: byGroup.get(group)! }));
}

/** Long-form rows (sentences) read better as prose than as a key/value pair. */
function isProse(value: string): boolean {
  return value.length > 60 || /[.;]\s/.test(value);
}

export function NoirStatRail({
  rows,
  locale,
  minVitals = 4,
}: {
  rows: NoirDetailRow[];
  locale: string;
  /** Below this many vitals the rail hides and the disclosure is the only entry. */
  minVitals?: number;
}) {
  const { vitals, rest } = splitVitals(rows);
  const showRail = vitals.length >= minVitals;
  const compRows = showRail ? rest : rows;
  const groups = groupRows(compRows);
  if (vitals.length === 0 && rows.length === 0) return null;

  const labels = {
    full: pickLocale(locale, { en: "Full comp card", es: "Ficha completa" }),
    count: pickLocale(locale, {
      en: `${compRows.length} more details`,
      es: `${compRows.length} datos más`,
    }),
  };

  return (
    <div className="nf-stats" data-profile-section="details">
      {showRail ? (
        <dl className="nf-stats__row">
          {vitals.map((s) => (
            <div className="nf-stats__cell" key={s.key}>
              <dt>{shortLabel(s.key, s.label, locale)}</dt>
              <dd>
                {s.v}
                {s.u ? <small>{s.u}</small> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {compRows.length > 0 ? (
        <details className="nf-comp">
          <summary>
            <span>{labels.full}</span>
            <span className="nf-comp__count">{labels.count}</span>
          </summary>
          <div className="nf-comp__body">
            {groups.map((g) => (
              <section key={g.group} className="nf-comp__group">
                <h3>{g.group}</h3>
                <dl>
                  {g.rows.map((r) =>
                    isProse(r.value) ? (
                      <div key={r.key} className="nf-comp__prose">
                        <dt>{r.label}</dt>
                        <dd>{r.value}</dd>
                      </div>
                    ) : (
                      <div key={r.key}>
                        <dt>{r.label}</dt>
                        <dd>{r.value}</dd>
                      </div>
                    ),
                  )}
                </dl>
              </section>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
