import { google } from "googleapis";
import { withAnalyticsCache } from "@/lib/server/analytics-api-cache";

function getSearchConsole() {
  const json = process.env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON?.trim();
  if (!json) return null;
  try {
    const credentials = JSON.parse(json) as Record<string, unknown>;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    });
    return google.searchconsole({ version: "v1", auth });
  } catch {
    return null;
  }
}

function siteUrl(): string | null {
  const u = process.env.GSC_SITE_URL?.trim();
  return u && u.length > 0 ? u : null;
}

export type GscQueryRow = { query: string; clicks: number; impressions: number; ctr: number; position: number };

export async function fetchGscQueries(
  startDate: string,
  endDate: string,
): Promise<{ rows: GscQueryRow[]; error?: string }> {
  const sc = getSearchConsole();
  const site = siteUrl();
  if (!sc || !site) {
    return { rows: [], error: "Search Console not configured (GSC_SITE_URL, GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON)." };
  }

  const cacheKey = `gsc:queries:${startDate}:${endDate}`;
  return withAnalyticsCache(
    cacheKey,
    "gsc",
    10 * 60_000,
    async (): Promise<{ rows: GscQueryRow[]; error?: string }> => {
      const res = await sc.searchanalytics.query({
        siteUrl: site,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: 50,
        },
      });

      const rows: GscQueryRow[] = [];
      for (const row of res.data.rows ?? []) {
        const query = row.keys?.[0] ?? "";
        if (!query) continue;
        rows.push({
          query,
          clicks: row.clicks ?? 0,
          impressions: row.impressions ?? 0,
          ctr: row.ctr ?? 0,
          position: row.position ?? 0,
        });
      }
      return { rows };
    },
  );
}

export type GscPageRow = { page: string; clicks: number; impressions: number; ctr: number; position: number };

export async function fetchGscPages(
  startDate: string,
  endDate: string,
): Promise<{ rows: GscPageRow[]; error?: string }> {
  const sc = getSearchConsole();
  const site = siteUrl();
  if (!sc || !site) {
    return { rows: [], error: "Search Console not configured." };
  }

  const cacheKey = `gsc:pages:${startDate}:${endDate}`;
  return withAnalyticsCache(
    cacheKey,
    "gsc",
    10 * 60_000,
    async (): Promise<{ rows: GscPageRow[]; error?: string }> => {
      const res = await sc.searchanalytics.query({
        siteUrl: site,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["page"],
          rowLimit: 50,
        },
      });

      const rows: GscPageRow[] = [];
      for (const row of res.data.rows ?? []) {
        const page = row.keys?.[0] ?? "";
        if (!page) continue;
        rows.push({
          page,
          clicks: row.clicks ?? 0,
          impressions: row.impressions ?? 0,
          ctr: row.ctr ?? 0,
          position: row.position ?? 0,
        });
      }
      return { rows };
    },
  );
}
