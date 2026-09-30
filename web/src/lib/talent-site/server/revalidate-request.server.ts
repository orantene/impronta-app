import "server-only";

/**
 * Bust a talent's public page cache through a real HTTP request to the app
 * (`/api/cron/revalidate-talent-site`, CRON_SECRET bearer). Needed wherever
 * site rows are written outside a Next request scope (the demo CLI, and
 * server code whose own `revalidateTag` call has no request to attach to).
 * Never throws: a failed bust is reported, not fatal (the data is saved).
 */
export const REVALIDATE_PATH = "/api/cron/revalidate-talent-site";

export function revalidateOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(raw) ? raw : null;
}

export async function requestTalentSiteRevalidate(
  input: { talentProfileId: string; profileCode: string },
  deps: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const env = deps.env ?? process.env;
  const secret = env.CRON_SECRET;
  const origin = revalidateOrigin(env);
  if (!secret) return { ok: false, error: "CRON_SECRET is not set" };
  if (!origin) return { ok: false, error: "NEXT_PUBLIC_APP_URL is not set" };
  try {
    const res = await (deps.fetch ?? fetch)(`${origin}${REVALIDATE_PATH}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `revalidate request returned ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "revalidate request failed" };
  }
}
