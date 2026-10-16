/**
 * TUL-876: option and extra labels in the visitor's language. The public
 * loader already reads `label_i18n`, but a detail built elsewhere can carry the
 * plain (main-language) label; the map rides along as `labelI18n`, so the sheet
 * resolves it for its own locale. A language the talent did not write keeps
 * the plain label (never an invented translation).
 */
type Labelled = { label: string; labelI18n?: Record<string, string | null | undefined> };

function labelFor(o: Labelled, locale: string): string {
  const own = o.labelI18n?.[locale.trim().toLowerCase().slice(0, 2)]?.trim();
  return own || o.label;
}

export function localizeOptionLabels<
  D extends { variants?: Array<Labelled & { id: string }>; addOns?: Array<Labelled & { id: string }> },
>(detail: D, locale: string): D {
  const swap = <T extends Labelled>(list: T[] | undefined): T[] | undefined =>
    list?.map((o) => {
      const label = labelFor(o, locale);
      return label === o.label ? o : { ...o, label };
    });
  if (!detail.variants?.length && !detail.addOns?.length) return detail;
  return { ...detail, variants: swap(detail.variants), addOns: swap(detail.addOns) };
}
