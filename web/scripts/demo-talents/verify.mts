/**
 * Read-only check of seeded foundation demos (Plan 1.2). For each code: the auth
 * user exists with the demo marker, is_demo, taxonomy row, four offerings with
 * the expected modes and prices, booking hours iff expected, field values that
 * match the workbook, languages, and a site that is still an unpublished draft
 * (new demos). When DEMO_PASSWORD is set it also signs in with the anon-key
 * client and signs out at once.
 *
 * Exit 1 on any mismatch. Never writes, never prints a password.
 *
 *   DEMO_SEED_TARGET_REF=<ref> [DEMO_PASSWORD=<password>] npx tsx --env-file=<env> \
 *     scripts/demo-talents/verify.mts --only TAL-93103,TAL-93104 [--dir <foundation dir>] [--manifest <path.json>]
 */
import { createClient } from "@supabase/supabase-js";
import { demoPasswordStatus, redact } from "./demo-identity";
import { DEFAULT_FOUNDATION_DIR, loadFoundation, selectDemos } from "./foundation-load";
import { UNIVERSAL_FIELD_KEYS } from "./foundation-plan";
import {
  loadAuthUsers,
  loadFieldDefs,
  loadLocationIndex,
  loadManifest,
  readOnly,
  resolveHubTenantId,
  resolveTermIds,
} from "./foundation-seed-core";
import { verifyDemo } from "./foundation-verify";

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
  if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
    throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
  }
  const only = (opt("--only") ?? opt("--codes"))?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!only?.length) throw new Error("pass --only <codes>");
  const dir = opt("--dir") ?? process.env.DEMO_FOUNDATION_DIR ?? DEFAULT_FOUNDATION_DIR;
  const demos = selectDemos(loadFoundation({ dir }), only);

  const admin = readOnly(
    createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }),
  );
  const password = process.env.DEMO_PASSWORD ?? "";
  const pwStatus = demoPasswordStatus();
  console.log(`verify ${demos.length} demo(s) against ${targetRef}; sign-in check: ${pwStatus === "ok" ? "on" : `off (DEMO_PASSWORD ${pwStatus})`}`);

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const signIn =
    pwStatus === "ok" && anonKey
      ? async (email: string, pw: string) => {
          const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
          const { error } = await anon.auth.signInWithPassword({ email, password: pw });
          if (error) return error.message;
          await anon.auth.signOut();
          return null;
        }
      : undefined;
  if (pwStatus === "ok" && !anonKey) console.log("  note: NEXT_PUBLIC_SUPABASE_ANON_KEY is unset, sign-in check skipped");

  const ctx = {
    admin,
    hubTenantId: await resolveHubTenantId(admin),
    termIds: (await resolveTermIds(admin, demos.map((d) => d.talentTypeSlug))).ids,
    fieldDefs: await loadFieldDefs(admin, [...UNIVERSAL_FIELD_KEYS, ...demos.flatMap((d) => Object.keys(d.typeFields))]),
    authByEmail: (await loadAuthUsers(admin)).byEmail,
    locations: await loadLocationIndex(admin),
    now: new Date(),
    signIn,
    signInLive: args.includes("--check-live-signin"),
    manifest: opt("--manifest") ? loadManifest(opt("--manifest")!, targetRef) : undefined,
    info: (l: string) => console.log(`  info ${l}`),
    password: pwStatus === "ok" ? password : undefined,
  };

  let failed = 0;
  for (const d of demos) {
    const bad = await verifyDemo(ctx, d);
    if (bad.length === 0) {
      console.log(`PASS ${d.profileCode} ${d.displayName}`);
    } else {
      failed += 1;
      console.log(`FAIL ${d.profileCode} ${d.displayName}`);
      for (const b of bad) console.log(`  - ${b}`);
    }
  }
  console.log(`${demos.length - failed}/${demos.length} passed`);
  if (failed) process.exitCode = 1;
}

main().catch((e: unknown) => {
  const secrets = [process.env.DEMO_PASSWORD ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""];
  console.error(redact(e instanceof Error ? e.message : String(e), secrets));
  process.exit(1);
});
