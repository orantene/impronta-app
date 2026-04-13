/**
 * Runs once per server process (Node). Surfaces misconfigured env in Vercel/runtime logs.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { logDeployEnvReadiness } = await import("@/lib/deploy-env");
  logDeployEnvReadiness();
}
