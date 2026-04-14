import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { withAnalyticsCache } from "@/lib/server/analytics-api-cache";

function propertyPath(): string | null {
  const raw = process.env.GA4_PROPERTY_ID?.trim();
  if (!raw) return null;
  return raw.startsWith("properties/") ? raw : `properties/${raw}`;
}

function createClient(): BetaAnalyticsDataClient | null {
  const json = process.env.GOOGLE_ANALYTICS_CREDENTIALS_JSON?.trim();
  if (!json) return null;
  try {
    const credentials = JSON.parse(json) as Record<string, unknown>;
    return new BetaAnalyticsDataClient({ credentials });
  } catch {
    return null;
  }
}

export type Ga4ChannelsRow = { channel: string; sessions: number };

export async function fetchGa4ChannelSessions(
  startDate: string,
  endDate: string,
): Promise<{ rows: Ga4ChannelsRow[]; error?: string }> {
  const property = propertyPath();
  const client = createClient();
  if (!client || !property) {
    return { rows: [], error: "GA4 not configured (GA4_PROPERTY_ID, GOOGLE_ANALYTICS_CREDENTIALS_JSON)." };
  }

  const cacheKey = `ga4:channels:${startDate}:${endDate}`;
  return withAnalyticsCache(
    cacheKey,
    "ga4",
    5 * 60_000,
    async (): Promise<{ rows: Ga4ChannelsRow[]; error?: string }> => {
      const [resp] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        limit: 50,
      });

      const rows: Ga4ChannelsRow[] = [];
      for (const row of resp.rows ?? []) {
        const channel = row.dimensionValues?.[0]?.value ?? "";
        const sessions = Number(row.metricValues?.[0]?.value ?? 0);
        if (channel) rows.push({ channel, sessions });
      }
      return { rows };
    },
  );
}

export async function fetchGa4LandingPages(
  startDate: string,
  endDate: string,
): Promise<{ rows: { page: string; views: number }[]; error?: string }> {
  const property = propertyPath();
  const client = createClient();
  if (!client || !property) {
    return { rows: [], error: "GA4 not configured." };
  }

  const cacheKey = `ga4:landings:${startDate}:${endDate}`;
  return withAnalyticsCache(
    cacheKey,
    "ga4",
    5 * 60_000,
    async () => {
      const [resp] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "landingPagePlusQueryString" }],
        metrics: [{ name: "sessions" }],
        limit: 25,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      });

      const rows: { page: string; views: number }[] = [];
      for (const row of resp.rows ?? []) {
        const page = row.dimensionValues?.[0]?.value ?? "";
        const views = Number(row.metricValues?.[0]?.value ?? 0);
        if (page) rows.push({ page, views });
      }
      return { rows };
    },
  );
}

export async function fetchGa4DeviceCategories(
  startDate: string,
  endDate: string,
): Promise<{ rows: { category: string; sessions: number }[]; error?: string }> {
  const property = propertyPath();
  const client = createClient();
  if (!client || !property) {
    return { rows: [], error: "GA4 not configured." };
  }

  const cacheKey = `ga4:devices:${startDate}:${endDate}`;
  return withAnalyticsCache(
    cacheKey,
    "ga4",
    5 * 60_000,
    async () => {
      const [resp] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "sessions" }],
        limit: 10,
      });

      const rows: { category: string; sessions: number }[] = [];
      for (const row of resp.rows ?? []) {
        const category = row.dimensionValues?.[0]?.value ?? "";
        const sessions = Number(row.metricValues?.[0]?.value ?? 0);
        if (category) rows.push({ category, sessions });
      }
      return { rows };
    },
  );
}

export async function fetchGa4Countries(
  startDate: string,
  endDate: string,
): Promise<{ rows: { country: string; sessions: number }[]; error?: string }> {
  const property = propertyPath();
  const client = createClient();
  if (!client || !property) {
    return { rows: [], error: "GA4 not configured." };
  }

  const cacheKey = `ga4:countries:${startDate}:${endDate}`;
  return withAnalyticsCache(
    cacheKey,
    "ga4",
    5 * 60_000,
    async () => {
      const [resp] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "country" }],
        metrics: [{ name: "sessions" }],
        limit: 30,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      });

      const rows: { country: string; sessions: number }[] = [];
      for (const row of resp.rows ?? []) {
        const country = row.dimensionValues?.[0]?.value ?? "";
        const sessions = Number(row.metricValues?.[0]?.value ?? 0);
        if (country) rows.push({ country, sessions });
      }
      return { rows };
    },
  );
}

/** GA4 Realtime API — short cache (30s). */
export async function fetchGa4Realtime(): Promise<{
  activeUsers: number;
  error?: string;
}> {
  const property = propertyPath();
  const client = createClient();
  if (!client || !property) {
    return { activeUsers: 0, error: "GA4 not configured." };
  }

  const cacheKey = "ga4:realtime:activeUsers";
  return withAnalyticsCache(
    cacheKey,
    "ga4_realtime",
    30_000,
    async () => {
      const [resp] = await client.runRealtimeReport({
        property,
        metrics: [{ name: "activeUsers" }],
      });
      const v = resp.rows?.[0]?.metricValues?.[0]?.value;
      const activeUsers = v ? Number(v) : 0;
      return { activeUsers };
    },
  );
}
