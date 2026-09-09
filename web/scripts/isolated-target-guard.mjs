/**
 * Shared refuse rules for journeys seed / cleanup / capacity-proof.
 *
 * Boolean flags are not enough. The script must also see the isolated
 * project ref, URL host, and database name, and must never default to
 * Impronta or load `.env.vercel.local`.
 *
 * Secrets must not be logged. Callers pass already-loaded env.
 */

export const PRODUCTION_PROJECT_REF = "pluhdapdnuiulvxmyspd";
export const QA_JOURNEYS_PROJECT_REF = "fxlankepwnvelxjrahwk";
export const JOURNEYS_TENANT_ID = "33333333-3333-4333-8333-333333333333";
export const IMPRONTA_TENANT_ID = "00000000-0000-0000-0000-000000000001";

const FORBIDDEN_HOST_FRAGMENTS = [
  PRODUCTION_PROJECT_REF,
  "impronta",
  ".env.vercel.local",
];

function haystack(env) {
  return [
    env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    env.DATABASE_URL ?? "",
    env.SUPABASE_PROJECT_REF ?? "",
    env.POSTGRES_HOST ?? "",
    env.PGDATABASE ?? "",
  ].join("\n").toLowerCase();
}

function redact(value) {
  if (!value) return "";
  return String(value).replace(/:[^:@/]+@/g, ":***@");
}

export function assertIsolatedJourneysTarget(env = process.env, opts = {}) {
  const isolatedFlag = env.CAPACITY_PROOF_ISOLATED === "1" || env.JOURNEYS_ISOLATED === "1";
  if (opts.requireIsolatedFlag && !isolatedFlag) {
    console.error(
      "[isolated-target] refusing. Set JOURNEYS_ISOLATED=1 (or CAPACITY_PROOF_ISOLATED=1) against qa-journeys, never production.",
    );
    process.exit(2);
  }

  const blob = haystack(env);
  for (const fragment of FORBIDDEN_HOST_FRAGMENTS) {
    if (blob.includes(fragment)) {
      console.error("[isolated-target] refusing production / Impronta / .env.vercel.local.");
      process.exit(2);
    }
  }

  if ((env.DATABASE_URL ?? "").includes("impronta") && !env.JOURNEYS_ALLOW_SHARED_PROJECT) {
    console.error("[isolated-target] refusing a URL that looks like the live Impronta project.");
    process.exit(2);
  }

  const allowedRef = env.JOURNEYS_ALLOWED_PROJECT_REF ?? QA_JOURNEYS_PROJECT_REF;
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const db = env.DATABASE_URL ?? "";
  const ref = env.SUPABASE_PROJECT_REF ?? "";
  const matches =
    ref === allowedRef ||
    url.includes(allowedRef) ||
    db.includes(allowedRef) ||
    db.includes("127.0.0.1") ||
    db.includes("localhost");

  if (!matches) {
    console.error(
      "[isolated-target] refusing. Project ref / URL host / database name must be the isolated qa-journeys target (or local Postgres).",
    );
    process.exit(2);
  }

  const tenant = env.CAPACITY_PROOF_TENANT_ID ?? env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;
  if (tenant === IMPRONTA_TENANT_ID) {
    console.error("[isolated-target] refusing Impronta tenant id. Use the qa-journeys fixture tenant.");
    process.exit(2);
  }

  return {
    allowedRef,
    tenantId: tenant,
    urlHost: redact(url),
  };
}
