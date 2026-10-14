/**
 * Pure aggregation for the "Mi presencia" stats card on the talent dashboard
 * home (TUL-582). Dependency-free so it unit-tests without a database.
 *
 * Every number comes from rows that are already collected:
 *   visits         <- analytics_events `view_talent_profile` (talent_id column)
 *   sources        <- payload.referrer on those same rows (document.referrer)
 *   requests       <- inquiries the talent is a named participant on
 *   confirmed      <- agency_bookings (via booking_talent) past "tentative"
 * Nothing here is estimated; a window with no rows is a real zero.
 */

export type PresenceViewRow = {
  created_at: string;
  payload: Record<string, unknown> | null;
};

export type PresenceDatedRow = { created_at: string };

export type PresenceSourceKey =
  | "direct"
  | "google"
  | "instagram"
  | "whatsapp"
  | "facebook"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "x"
  | "tulala"
  | "other";

export type PresenceSource = {
  key: PresenceSourceKey;
  /** Host for "other"; the localized label for known keys is the UI's job. */
  host: string | null;
  visits: number;
  /** Whole percent of the window's visits. */
  sharePct: number;
};

export type PresenceWindow = {
  visits: number;
  requests: number;
  confirmed: number;
};

export type TalentPresenceStats = {
  last30d: PresenceWindow;
  prior30d: PresenceWindow;
  topSources: PresenceSource[];
  /** Whole-percent change per metric; null when the prior window is 0. */
  deltaPct: { visits: number | null; requests: number | null; confirmed: number | null };
  /** True when there is nothing at all in either window. */
  isEmpty: boolean;
};

const KNOWN_HOSTS: Array<[PresenceSourceKey, RegExp]> = [
  ["google", /(^|\.)google\.[a-z.]+$/i],
  ["instagram", /(^|\.)(instagram\.com|l\.instagram\.com)$/i],
  ["whatsapp", /(^|\.)(whatsapp\.com|wa\.me)$/i],
  ["facebook", /(^|\.)(facebook\.com|fb\.com|fb\.me|l\.facebook\.com|lm\.facebook\.com)$/i],
  ["tiktok", /(^|\.)tiktok\.com$/i],
  ["linkedin", /(^|\.)(linkedin\.com|lnkd\.in)$/i],
  ["youtube", /(^|\.)(youtube\.com|youtu\.be)$/i],
  ["x", /(^|\.)(twitter\.com|x\.com|t\.co)$/i],
  ["tulala", /(^|\.)tulala\.digital$/i],
];

function hostOf(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    const h = value.replace(/^https?:\/\//i, "").split(/[/?#]/)[0]?.trim().toLowerCase();
    return h ? h.replace(/^www\./, "") : null;
  }
}

/** Classify one raw referrer into a stable source. Empty/unparseable = direct. */
export function classifyReferrer(raw: unknown): { key: PresenceSourceKey; host: string | null } {
  if (typeof raw !== "string") return { key: "direct", host: null };
  const host = hostOf(raw);
  if (!host) return { key: "direct", host: null };
  for (const [key, re] of KNOWN_HOSTS) if (re.test(host)) return { key, host };
  return { key: "other", host };
}

const UTM_ALIASES: Record<string, PresenceSourceKey> = {
  ig: "instagram", instagram: "instagram",
  wa: "whatsapp", whatsapp: "whatsapp",
  fb: "facebook", facebook: "facebook",
  tt: "tiktok", tiktok: "tiktok",
  li: "linkedin", linkedin: "linkedin",
  yt: "youtube", youtube: "youtube",
  x: "x", twitter: "x",
  google: "google",
  tulala: "tulala",
};

/** Map a utm_source value to a source; unknown values become "other". */
export function classifyUtmSource(raw: unknown): { key: PresenceSourceKey; host: string | null } | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const key = UTM_ALIASES[v];
  return key ? { key, host: null } : { key: "other", host: v };
}

/** utm_source wins over the referrer host (in-app browsers strip referrer). */
export function classifyVisitSource(payload: Record<string, unknown> | null | undefined) {
  return classifyUtmSource(payload?.utm_source) ?? classifyReferrer(payload?.referrer);
}

/** Whole-percent change; null when the baseline is 0. */
export function deltaPct(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

function within(iso: string, fromIso: string, toIso?: string): boolean {
  return iso >= fromIso && (toIso === undefined || iso < toIso);
}

/** Top-N sources by visits (ties break on key, then host), with share. */
export function topPresenceSources(rows: readonly PresenceViewRow[], limit = 3): PresenceSource[] {
  const acc = new Map<string, { key: PresenceSourceKey; host: string | null; visits: number }>();
  for (const row of rows) {
    const c = classifyVisitSource(row.payload);
    const id = c.key === "other" ? `other:${c.host}` : c.key;
    const hit = acc.get(id);
    if (hit) hit.visits += 1;
    else acc.set(id, { ...c, visits: 1 });
  }
  const total = rows.length;
  return Array.from(acc.values())
    .sort(
      (a, b) =>
        b.visits - a.visits ||
        a.key.localeCompare(b.key) ||
        (a.host ?? "").localeCompare(b.host ?? ""),
    )
    .slice(0, limit)
    .map((s) => ({ ...s, sharePct: total > 0 ? Math.round((s.visits / total) * 100) : 0 }));
}

/**
 * Fold 60 days of rows into the last-30 vs prior-30 card model.
 * `start30Iso` is the start of the trailing window; `start60Iso` the prior's.
 */
export function buildTalentPresenceStats(input: {
  start30Iso: string;
  start60Iso: string;
  views: readonly PresenceViewRow[];
  requests: readonly PresenceDatedRow[];
  confirmed: readonly PresenceDatedRow[];
}): TalentPresenceStats {
  const { start30Iso: s30, start60Iso: s60 } = input;
  const cur = (r: { created_at: string }) => within(r.created_at, s30);
  const prev = (r: { created_at: string }) => within(r.created_at, s60, s30);

  const views30 = input.views.filter(cur);
  const last30d: PresenceWindow = {
    visits: views30.length,
    requests: input.requests.filter(cur).length,
    confirmed: input.confirmed.filter(cur).length,
  };
  const prior30d: PresenceWindow = {
    visits: input.views.filter(prev).length,
    requests: input.requests.filter(prev).length,
    confirmed: input.confirmed.filter(prev).length,
  };
  const all = [...Object.values(last30d), ...Object.values(prior30d)];
  return {
    last30d,
    prior30d,
    topSources: topPresenceSources(views30),
    deltaPct: {
      visits: deltaPct(last30d.visits, prior30d.visits),
      requests: deltaPct(last30d.requests, prior30d.requests),
      confirmed: deltaPct(last30d.confirmed, prior30d.confirmed),
    },
    isEmpty: all.every((n) => n === 0),
  };
}
