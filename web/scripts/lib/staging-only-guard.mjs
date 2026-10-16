/**
 * Pure staging-only guard for fixture scripts that write to qa-journeys.
 * Exact host match, no substring tricks (a "fxlank...supabase.co.evil.com"
 * or a prod project must never pass).
 */
export const STAGING_SUPABASE_HOST = "fxlankepwnvelxjrahwk.supabase.co";
export const QA_JOURNEYS_TENANT_ID = "33333333-3333-4333-8333-333333333333";

/** @returns {{ ok: true } | { ok: false, reason: string }} */
export function checkStagingOnly(env) {
  const raw = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!raw) return { ok: false, reason: "NEXT_PUBLIC_SUPABASE_URL is not set" };
  let host;
  try {
    host = new URL(raw).host;
  } catch {
    return { ok: false, reason: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL" };
  }
  if (host !== STAGING_SUPABASE_HOST) {
    return { ok: false, reason: `host ${host} is not the staging project (${STAGING_SUPABASE_HOST})` };
  }
  return { ok: true };
}

/** Open Mon-Sun windows so any 14-day window has bookable times. */
export function everyDayWeekly(startMin = 9 * 60, endMin = 18 * 60) {
  const w = {};
  for (let d = 0; d < 7; d += 1) w[d] = [{ startMin, endMin }];
  return w;
}
