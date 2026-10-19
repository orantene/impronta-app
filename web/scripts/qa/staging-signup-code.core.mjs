/**
 * Pure core of scripts/qa/staging-signup-code.mts (QA-T Q1). No I/O of its own: the Supabase
 * admin client factory, the env, stdout and stderr are all injected, so every guard is
 * unit-testable and a refusal provably makes NO network call (the factory is never invoked).
 *
 * Exit codes: 0 printed a code or a link, 1 the lookup failed, 2 refused by a guard.
 * Never prints keys, tokens, the service-role key or the project URL.
 */
import { PRODUCTION_PROJECT_REF, QA_JOURNEYS_PROJECT_REF } from "../isolated-target-guard.mjs";

export const STAGING_REF = QA_JOURNEYS_PROJECT_REF; // fxlankepwnvelxjrahwk
export const PROD_REFS = [PRODUCTION_PROJECT_REF];

/** Allow-list: qa-onb-choice+*@impronta.test, tulalaqa+* (any domain), *@mail.grokbot.com. */
export function isAllowedQaEmail(raw) {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || /\s/.test(email) || email.split("@").length !== 2) return false;
  const [local, domain] = email.split("@");
  if (!local || !domain) return false;
  if (domain === "impronta.test" && /^qa-onb-choice\+[^+]+$/.test(local)) return true;
  if (/^tulalaqa\+[^+]+$/.test(local)) return true;
  if (domain === "mail.grokbot.com") return true;
  return false;
}

/** Project ref from https://<ref>.supabase.co (or "" when it is not one). */
export function refFromSupabaseUrl(url) {
  try {
    const host = new URL(String(url)).hostname.toLowerCase();
    const m = /^([a-z0-9]+)\.supabase\.(co|in)$/.exec(host);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

export function parseArgv(argv) {
  const out = { email: "", envFile: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--email") out.email = argv[i + 1] ?? "";
    else if (argv[i] === "--env-file") out.envFile = argv[i + 1] ?? "";
  }
  return out;
}

/**
 * @param {{
 *   argv: string[],
 *   env: Record<string, string | undefined>,
 *   createAdminClient: (url: string, key: string) => Promise<any> | any,
 *   guard?: (env: Record<string, string | undefined>) => void,
 *   out: (line: string) => void,
 *   err: (line: string) => void,
 * }} deps `env` is already merged (process env + --env-file) by the caller.
 * @returns {Promise<number>} exit code
 */
export async function run({ argv, env, createAdminClient, guard, out, err }) {
  const refuse = (msg) => {
    err(`[staging-signup-code] refusing: ${msg}`);
    return 2;
  };
  const { email } = parseArgv(argv);
  if (!email) return refuse("--email is required");
  if (!isAllowedQaEmail(email)) {
    return refuse("email is not on the allow-list (qa-onb-choice+*@impronta.test, tulalaqa+*, *@mail.grokbot.com)");
  }
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  if (!url || !key) return refuse("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (env or --env-file)");
  const hay = [url, env.SUPABASE_PROJECT_REF ?? "", env.DATABASE_URL ?? ""].join("\n").toLowerCase();
  for (const prod of PROD_REFS) {
    if (hay.includes(prod)) return refuse("a production project ref is present in the env");
  }
  const ref = refFromSupabaseUrl(url);
  if (ref !== STAGING_REF) return refuse(`target project ref must be the staging project ${STAGING_REF}`);
  if (env.SUPABASE_PROJECT_REF && env.SUPABASE_PROJECT_REF !== STAGING_REF) {
    return refuse("SUPABASE_PROJECT_REF is not the staging project");
  }
  if (guard) guard(env); // the shared isolated-target guard (process.exit(2) on a bad target)

  let admin;
  try {
    admin = await createAdminClient(url, key);
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: email.trim().toLowerCase() });
    if (error) {
      err(`[staging-signup-code] lookup failed: ${String(error.message ?? "unknown error")}`);
      return 1;
    }
    const props = (data && data.properties) || {};
    if (props.email_otp) {
      out(String(props.email_otp));
      return 0;
    }
    if (props.action_link) {
      err("[staging-signup-code] no email_otp returned; printing the action link instead");
      out(String(props.action_link));
      return 0;
    }
    err("[staging-signup-code] lookup returned neither a code nor a link");
    return 1;
  } catch (e) {
    err(`[staging-signup-code] lookup failed: ${e instanceof Error ? e.message : "unknown error"}`);
    return 1;
  }
}
