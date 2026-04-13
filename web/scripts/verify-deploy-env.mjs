#!/usr/bin/env node
/**
 * Fail CI / pre-deploy if required public env is missing.
 * Usage: node scripts/verify-deploy-env.mjs
 * Optional: DEPLOY_ENV_STRICT=1 to also require NEXT_PUBLIC_SITE_URL (recommended before Vercel push).
 */

const strict = process.env.DEPLOY_ENV_STRICT === "1";

function need(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`[verify-deploy-env] Missing ${name}`);
    process.exit(1);
  }
}

need("NEXT_PUBLIC_SUPABASE_URL");
need("NEXT_PUBLIC_SUPABASE_ANON_KEY");

if (strict) {
  need("NEXT_PUBLIC_SITE_URL");
  const site = process.env.NEXT_PUBLIC_SITE_URL.trim();
  if (site.startsWith("http://localhost") || site.startsWith("http://127.")) {
    console.error(
      "[verify-deploy-env] NEXT_PUBLIC_SITE_URL must not be localhost in strict mode (use real deploy URL)",
    );
    process.exit(1);
  }
}

console.log("[verify-deploy-env] OK");
