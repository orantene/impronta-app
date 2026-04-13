import { cache } from "react";
import { headers } from "next/headers";

const LOG_NS = "impronta";

/**
 * Stable id for correlating logs within one RSC / route handler request.
 */
export const getRequestCorrelationId = cache(async (): Promise<string> => {
  const h = await headers();
  return (
    h.get("x-vercel-id")?.trim() ||
    h.get("x-request-id")?.trim() ||
    `local-${crypto.randomUUID()}`
  );
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
    requestId = await getRequestCorrelationId();
  } catch {
    /* e.g. middleware or non-request context */
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
