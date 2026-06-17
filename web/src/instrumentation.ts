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
