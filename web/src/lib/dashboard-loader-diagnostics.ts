import { improntaLog } from "@/lib/server/structured-log";
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
  void improntaLog("dashboard_loader_diagnostics.error", {
    context: `[${loaderName}] FATAL`,
    message: e.message,
    stack: e.stack,
    name: e.name,
    extra: extra && Object.keys(extra).length > 0 ? JSON.stringify(extra) : undefined,
  });
}
