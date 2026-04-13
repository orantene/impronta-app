/**
 * Server-side logging for dashboard loaders. Does not call `createClient()` (avoids
 * nested `cookies()` during prerender / error paths).
 */
export async function logDashboardLoaderFailure(
  loaderName: string,
  error: unknown,
  extra?: Record<string, unknown>,
): Promise<void> {
  const e = error instanceof Error ? error : new Error(String(error));
  console.error(`[${loaderName}] FATAL`, {
    message: e.message,
    stack: e.stack,
    name: e.name,
    ...(extra && Object.keys(extra).length > 0 ? { context: extra } : {}),
  });
}
