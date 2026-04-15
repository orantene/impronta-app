import { cache } from "react";

const LOG_NS = "impronta";

/**
 * Stable id for correlating logs within one RSC / route handler request.
 *
 * Intentionally does **not** use `next/headers` so this module stays safe to import from code
 * shared with the Pages Router or other bundles where `headers()` is unavailable at build time.
 */
export const getRequestCorrelationId = cache((): string => {
  return `req-${crypto.randomUUID()}`;
});

export type ImprontaLogFields = Record<string, string | number | boolean | null | undefined>;

/**
 * Production-safe structured line (single JSON object per log) for grep/filter.
 */
export async function improntaLog(
  event: string,
  fields: ImprontaLogFields = {},
): Promise<void> {
  let requestId = "no-request";
  try {
    requestId = getRequestCorrelationId();
  } catch {
    /* non-request context */
  }
  const payload = {
    ns: LOG_NS,
    event,
    requestId,
    ts: new Date().toISOString(),
    ...fields,
  };
  console.info(JSON.stringify(payload));
}
