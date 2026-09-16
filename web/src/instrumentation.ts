/**
 * Runs once per server process (Node/Edge). Initializes Sentry and surfaces
 * misconfigured env in Vercel/runtime logs.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { logDeployEnvReadiness } = await import("@/lib/deploy-env");
    logDeployEnvReadiness();
    await installFetchConnectionCap();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Next.js 16 instrumentation hook — captures unhandled request errors in Sentry.
 *
 * `Sentry.captureRequestError` is available in @sentry/nextjs ≥ 8.x and expects
 * (error, request, errorContext) where errorContext has { routerKind, routePath, routeType }.
 * Next.js passes exactly that shape as the third argument here.
 *
 * Best-effort: if Sentry is not initialised (missing DSN) this is a no-op.
 */
export const onRequestError = async (
  error: unknown,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  context: {
    routerKind?: string;
    routePath?: string;
    routeType?: string;
  },
): Promise<void> => {
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(error, request, {
    routerKind: context.routerKind ?? "unknown",
    routePath: context.routePath ?? request.path,
    routeType: context.routeType ?? "unknown",
  });
};

/**
 * Optional cap on concurrent connections per origin for server-side `fetch`
 * (`TULALA_FETCH_CONNECTIONS=<n>`, off when unset).
 *
 * An admin page fans out 60-150 Supabase reads in parallel. With Node's
 * default dispatcher every one of them that finds no idle socket opens a new
 * TLS connection at once; measured from this codebase against the isolated
 * project, 60 parallel reads took p50 3.6 s / max 7.2 s unbounded and
 * p50 0.49 s / max 0.71 s with ten keep-alive connections (the stall is the
 * burst of handshakes, not the queries: each one answers in ~0.2 s alone).
 * Kept opt-in because the right number depends on the runtime's concurrency
 * per process; the evidence README for perf-1 has the measurements.
 */
async function installFetchConnectionCap(): Promise<void> {
  const raw = process.env.TULALA_FETCH_CONNECTIONS;
  const connections = raw ? Number.parseInt(raw, 10) : 0;
  if (!Number.isFinite(connections) || connections <= 0) return;
  const { Agent, setGlobalDispatcher } = await import("undici");
  setGlobalDispatcher(new Agent({ connections, keepAliveTimeout: 30_000 }));
}
