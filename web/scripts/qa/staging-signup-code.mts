/**
 * QA-T Q1: print the 6-digit email sign-in code for a QA account on STAGING (fxlankepwnvelxjrahwk),
 * so a browser tester can finish the real email-code step without a mailbox.
 *
 * Usage (from web/):
 *   npx tsx scripts/qa/staging-signup-code.mts --email qa-onb-choice+story-a-1@impronta.test --env-file <staging env file>
 *
 * Env (process env, or --env-file <path>; values are never printed):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (must be the fxlank project)
 *
 * Guards (any failure: exit 2, NO client created, NO network call):
 *   - project ref must be fxlankepwnvelxjrahwk; the production ref anywhere in the env refuses
 *   - email allow-list: qa-onb-choice+*@impronta.test, tulalaqa+* (any domain), *@mail.grokbot.com
 *   - --email, URL and service key are all required
 *   - the shared scripts/isolated-target-guard.mjs also runs
 * Prints ONLY the code (or, when Supabase returns no email_otp, the action link). Exit 0 ok, 1 lookup failed.
 */
import { readFileSync } from "node:fs";

import { assertIsolatedJourneysTarget } from "../isolated-target-guard.mjs";
import { parseEnvText } from "../lib/group6-fixtures.mjs";
import { parseArgv, run } from "./staging-signup-code.core.mjs";

const argv = process.argv.slice(2);
const { envFile } = parseArgv(argv);
let fileEnv: Record<string, string> = {};
if (envFile) {
  if (envFile.endsWith(".env.vercel.local")) {
    console.error("[staging-signup-code] refusing: .env.vercel.local is a production dump");
    process.exit(2);
  }
  try {
    fileEnv = parseEnvText(readFileSync(envFile, "utf8")) as Record<string, string>;
  } catch {
    console.error("[staging-signup-code] could not read --env-file");
    process.exit(2);
  }
}
const env: Record<string, string | undefined> = { ...process.env, ...fileEnv };

const code = await run({
  argv,
  env,
  guard: (e: Record<string, string | undefined>) => {
    assertIsolatedJourneysTarget(e);
  },
  createAdminClient: async (url: string, key: string) => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  },
  out: (line: string) => console.log(line),
  err: (line: string) => console.error(line),
});
process.exit(code);
