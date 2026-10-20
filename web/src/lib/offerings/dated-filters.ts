/**
 * dated-filters.ts — directory filters for items sold as dated places:
 * date window, price, duration, language (TUL-1344 slice 6). Pure.
 *
 * Money in the query string is in whole currency units (`max=50`) and held in
 * cents here. An item with no open date is never listed: it cannot be booked.
 */

export type DatedListItem = {
  id: string;
  title: string;
  /** Next date that is open for sale, or null. */
  nextStartsAt: string | null;
  fromPriceCents: number | null;
  durationMinutes: number | null;
  languages: string[];
  hasOpenDate: boolean;
};

export type DatedFilters = {
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  maxDurationMinutes?: number;
  language?: string;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function units(raw: string | null): number | undefined {
  if (raw == null || !/^\d{1,7}$/.test(raw)) return undefined;
  return Number.parseInt(raw, 10);
}

export function parseDatedFilters(q: URLSearchParams): DatedFilters {
  const out: DatedFilters = {};
  const from = q.get("from");
  const to = q.get("to");
  if (from && YMD.test(from) && Number.isFinite(Date.parse(from))) out.from = from;
  if (to && YMD.test(to) && Number.isFinite(Date.parse(to))) out.to = to;
  const min = units(q.get("min"));
  const max = units(q.get("max"));
  const dur = units(q.get("dur"));
  if (min !== undefined) out.minPriceCents = min * 100;
  if (max !== undefined) out.maxPriceCents = max * 100;
  if (dur !== undefined && dur > 0) out.maxDurationMinutes = dur;
  const lang = q.get("lang")?.trim();
  if (lang) out.language = lang.slice(0, 40);
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function filterDatedItems(items: readonly DatedListItem[], f: DatedFilters): DatedListItem[] {
  const fromMs = f.from ? Date.parse(`${f.from}T00:00:00Z`) : null;
  const toMs = f.to ? Date.parse(`${f.to}T23:59:59Z`) : null;
  const lang = f.language ? fold(f.language) : null;
  return items
    .filter((i) => {
      if (!i.hasOpenDate || !i.nextStartsAt) return false;
      const t = Date.parse(i.nextStartsAt);
      if (!Number.isFinite(t)) return false;
      if (fromMs != null && t < fromMs) return false;
      if (toMs != null && t > toMs) return false;
      if (f.minPriceCents != null && (i.fromPriceCents == null || i.fromPriceCents < f.minPriceCents)) return false;
      if (f.maxPriceCents != null && (i.fromPriceCents == null || i.fromPriceCents > f.maxPriceCents)) return false;
      if (f.maxDurationMinutes != null && (i.durationMinutes == null || i.durationMinutes > f.maxDurationMinutes)) return false;
      if (lang && !i.languages.some((l) => fold(l) === lang)) return false;
      return true;
    })
    .sort((a, b) => Date.parse(a.nextStartsAt!) - Date.parse(b.nextStartsAt!));
}
