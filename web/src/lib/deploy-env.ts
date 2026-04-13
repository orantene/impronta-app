/**
 * Startup / CI checks for Vercel and production deploys.
 * Does not throw — logs warnings so cold starts stay resilient.
 */

function isTruthy(s: string | undefined): boolean {
  return Boolean(s?.trim());
}

export type DeployEnvCheckResult = {
  ok: boolean;
  issues: string[];
};

/**
 * Required for any hosted build where Supabase-backed pages run.
 */
export function checkPublicSupabaseEnv(): DeployEnvCheckResult {
  const issues: string[] = [];
  if (!isTruthy(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL missing or empty");
  }
  if (!isTruthy(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY missing or empty");
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Canonical URLs, OAuth redirects, and metadata base need a real HTTPS origin on Vercel.
 */
export function checkSiteUrlForVercel(): DeployEnvCheckResult {
  const issues: string[] = [];
  if (process.env.VERCEL !== "1") {
    return { ok: true, issues };
  }
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
  if (!raw) {
    issues.push("NEXT_PUBLIC_SITE_URL missing on Vercel — set to https://<your-preview-or-prod-host>");
  } else if (raw.startsWith("http://localhost") || raw.startsWith("http://127.")) {
    issues.push(
      "NEXT_PUBLIC_SITE_URL points at localhost on Vercel — OAuth/metadata will break; use the deployment URL",
    );
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Called from `instrumentation.ts` on server startup (Node runtime).
 */
export function logDeployEnvReadiness(): void {
  const supa = checkPublicSupabaseEnv();
  const site = checkSiteUrlForVercel();
  const issues = [...supa.issues, ...site.issues];
  if (issues.length === 0) return;
  console.warn(
    JSON.stringify({
      ns: "impronta",
      event: "deploy_env_warning",
      issues,
      vercel: process.env.VERCEL === "1",
      nodeEnv: process.env.NODE_ENV,
    }),
  );
}
