/**
 * F6: where a visit came from, as a CLASS and a NAME, never as a URL.
 *
 * AI assistants and search engines are the new front door for a service
 * business, so the analytics rows say which one sent the visit. The inputs are
 * already scrubbed (TUL-751): the referrer is an ORIGIN only, and the one query
 * parameter that matters, `utm_source`, arrives as a short token that is used to
 * pick a name and then DISCARDED. What is stored is `traffic_channel` and
 * `traffic_source`, two short words from a fixed list. No full URL, no query
 * string, no raw token is ever kept.
 *
 * PURE.
 */

export type TrafficChannel = "ai" | "search" | "social" | "messaging" | "internal" | "other" | "direct";

export type TrafficSource = { channel: TrafficChannel; source: string };

export const TRAFFIC_CHANNELS: readonly TrafficChannel[] = ["ai", "search", "social", "messaging", "internal", "other", "direct"];

type Rule = { channel: TrafficChannel; source: string; host: RegExp; utm: readonly string[] };

/** First match wins. `host` tests a bare hostname (no www.); `utm` are lower-case utm_source tokens. */
const RULES: readonly Rule[] = [
  // AI assistants
  { channel: "ai", source: "chatgpt", host: /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/, utm: ["chatgpt.com", "chatgpt", "openai"] },
  { channel: "ai", source: "perplexity", host: /(^|\.)perplexity\.ai$/, utm: ["perplexity", "perplexity.ai"] },
  { channel: "ai", source: "claude", host: /(^|\.)claude\.ai$/, utm: ["claude", "claude.ai"] },
  { channel: "ai", source: "gemini", host: /(^|\.)gemini\.google\.com$/, utm: ["gemini", "gemini.google.com"] },
  { channel: "ai", source: "copilot", host: /(^|\.)(copilot\.microsoft\.com|copilot\.cloud\.microsoft)$/, utm: ["copilot", "copilot.microsoft.com"] },
  { channel: "ai", source: "meta-ai", host: /(^|\.)meta\.ai$/, utm: ["meta.ai", "meta-ai"] },
  { channel: "ai", source: "you", host: /(^|\.)you\.com$/, utm: ["you.com"] },
  { channel: "ai", source: "poe", host: /(^|\.)poe\.com$/, utm: ["poe", "poe.com"] },
  { channel: "ai", source: "deepseek", host: /(^|\.)deepseek\.com$/, utm: ["deepseek"] },
  { channel: "ai", source: "grok", host: /(^|\.)grok\.com$/, utm: ["grok"] },
  // Search engines
  { channel: "search", source: "google", host: /(^|\.)google\.[a-z.]+$/, utm: ["google"] },
  { channel: "search", source: "bing", host: /(^|\.)bing\.com$/, utm: ["bing"] },
  { channel: "search", source: "duckduckgo", host: /(^|\.)duckduckgo\.com$/, utm: ["duckduckgo"] },
  { channel: "search", source: "yahoo", host: /(^|\.)search\.yahoo\.com$|(^|\.)yahoo\.[a-z.]+$/, utm: ["yahoo"] },
  { channel: "search", source: "ecosia", host: /(^|\.)ecosia\.org$/, utm: ["ecosia"] },
  { channel: "search", source: "brave", host: /(^|\.)search\.brave\.com$/, utm: ["brave"] },
  { channel: "search", source: "yandex", host: /(^|\.)yandex\.[a-z.]+$/, utm: ["yandex"] },
  { channel: "search", source: "baidu", host: /(^|\.)baidu\.com$/, utm: ["baidu"] },
  // Social
  { channel: "social", source: "instagram", host: /(^|\.)instagram\.com$/, utm: ["instagram", "ig"] },
  { channel: "social", source: "facebook", host: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/, utm: ["facebook", "fb"] },
  { channel: "social", source: "tiktok", host: /(^|\.)tiktok\.com$/, utm: ["tiktok"] },
  { channel: "social", source: "linkedin", host: /(^|\.)(linkedin\.com|lnkd\.in)$/, utm: ["linkedin"] },
  { channel: "social", source: "youtube", host: /(^|\.)(youtube\.com|youtu\.be)$/, utm: ["youtube"] },
  { channel: "social", source: "x", host: /(^|\.)(twitter\.com|x\.com|t\.co)$/, utm: ["twitter", "x"] },
  { channel: "social", source: "pinterest", host: /(^|\.)pinterest\.[a-z.]+$/, utm: ["pinterest"] },
  // Messaging
  { channel: "messaging", source: "whatsapp", host: /(^|\.)(whatsapp\.com|wa\.me)$/, utm: ["whatsapp", "wa"] },
  { channel: "messaging", source: "telegram", host: /(^|\.)(telegram\.org|t\.me)$/, utm: ["telegram"] },
];

/** A utm_source is only ever a short plain token; anything else is not even looked at. */
const UTM_TOKEN = /^[a-z0-9._-]{1,40}$/;

/** Bare lower-case hostname of an origin or URL; null when it is not http(s). */
export function referrerHost(referrer: unknown): string | null {
  if (typeof referrer !== "string" || !referrer.trim()) return null;
  try {
    const u = new URL(referrer.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Classify one visit. Order of trust: a known `utm_source` (the link itself says
 * who sent it; AI assistants add it), then the referrer host, then our own
 * domains (`internal`), then any other referrer (`other`), else `direct`.
 *
 * `ownHosts` are hostnames of the site being measured, so a click from the
 * business's own pages is `internal` rather than `other`.
 */
export function classifyTrafficSource(input: {
  referrer?: unknown;
  utmSource?: unknown;
  ownHosts?: readonly string[];
}): TrafficSource {
  const utm = typeof input.utmSource === "string" ? input.utmSource.trim().toLowerCase() : "";
  if (UTM_TOKEN.test(utm)) {
    const byUtm = RULES.find((r) => r.utm.includes(utm));
    if (byUtm) return { channel: byUtm.channel, source: byUtm.source };
  }
  const host = referrerHost(input.referrer);
  if (!host) return { channel: "direct", source: "direct" };
  const byHost = RULES.find((r) => r.host.test(host));
  if (byHost) return { channel: byHost.channel, source: byHost.source };
  const own = (input.ownHosts ?? []).map((h) => h.toLowerCase().replace(/^www\./, ""));
  if (own.includes(host) || /(^|\.)tulala\.digital$/.test(host)) return { channel: "internal", source: "internal" };
  return { channel: "other", source: "other" };
}

/** The two payload keys the events route stores (class and name only). */
export function trafficPayloadFields(src: TrafficSource): { traffic_channel: TrafficChannel; traffic_source: string } {
  return { traffic_channel: src.channel, traffic_source: src.source };
}

/** A `utm_source` token from a location.search string, or null. Client-side only; never stored. */
export function utmSourceToken(search: string | null | undefined): string | null {
  if (!search) return null;
  const raw = new URLSearchParams(search).get("utm_source")?.trim().toLowerCase() ?? "";
  return UTM_TOKEN.test(raw) ? raw : null;
}

export type TrafficRow = { payload: Record<string, unknown> | null };

export type TrafficChannelRow = { channel: TrafficChannel; visits: number; sharePct: number; sources: Array<{ source: string; visits: number }> };

/**
 * Fold view rows into channels with their sources. Rows written before F6 have
 * no stored class: they are classified from `payload.referrer` (already an
 * origin), so history reads the same as new data.
 */
export function groupTrafficChannels(rows: readonly TrafficRow[], ownHosts: readonly string[] = []): TrafficChannelRow[] {
  const acc = new Map<TrafficChannel, Map<string, number>>();
  for (const row of rows) {
    const p = row.payload ?? {};
    const storedChannel = typeof p.traffic_channel === "string" && (TRAFFIC_CHANNELS as readonly string[]).includes(p.traffic_channel) ? (p.traffic_channel as TrafficChannel) : null;
    const storedSource = typeof p.traffic_source === "string" && /^[a-z0-9-]{1,24}$/.test(p.traffic_source) ? p.traffic_source : null;
    const t: TrafficSource =
      storedChannel && storedSource ? { channel: storedChannel, source: storedSource } : classifyTrafficSource({ referrer: p.referrer, ownHosts });
    const sources = acc.get(t.channel) ?? new Map<string, number>();
    sources.set(t.source, (sources.get(t.source) ?? 0) + 1);
    acc.set(t.channel, sources);
  }
  const total = rows.length;
  return [...acc.entries()]
    .map(([channel, sources]) => {
      const visits = [...sources.values()].reduce((a, b) => a + b, 0);
      return {
        channel,
        visits,
        sharePct: total > 0 ? Math.round((visits / total) * 100) : 0,
        sources: [...sources.entries()].map(([source, v]) => ({ source, visits: v })).sort((a, b) => b.visits - a.visits || a.source.localeCompare(b.source)),
      };
    })
    .sort((a, b) => b.visits - a.visits || TRAFFIC_CHANNELS.indexOf(a.channel) - TRAFFIC_CHANNELS.indexOf(b.channel));
}
