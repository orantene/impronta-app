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
