/**
 * Seed the Demo Foundation talents (Plan 1.1): up to 224 complete free talents
 * read from the workbook JSON files, not from demos.ts. Creates or updates, per
 * demo: auth user (with the one shared demo password), profile, primary
 * taxonomy row, four offerings, booking hours, profile field values, languages,
 * service areas, hub roster row and an UNPUBLISHED draft site. The 10 live
 * demos are updated in place and never lose their name, city, email, photos or
 * published site.
 *
 * Safety:
 *  - DEMO_SEED_TARGET_REF must match the project ref in NEXT_PUBLIC_SUPABASE_URL.
 *  - A real run refuses unless DEMO_PASSWORD is set: 16+ characters with upper case,
 *    lower case and a digit. One shared password for every demo. It is never printed,
 *    logged or written anywhere (status.json, manifest, errors).
 *  - Only demo rows: TAL-93xxx, @impronta.test or @demo.tulala.digital, auth user
 *    with app_metadata.demo_batch.
 *  - Every selected demo is validated read-only first; any problem stops the run
 *    before anything is written.
 *  - --dry-run uses a client that throws on any write.
 *
 * Run (from web/):
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=<env> scripts/demo-talents/seed-foundation.mts \
 *     --from-foundation --only TAL-93101,TAL-93110 --dry-run   (or omit --yes-write)
 *   DEMO_PASSWORD=<password> DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=<env> \
 *     scripts/demo-talents/seed-foundation.mts --from-foundation --only <codes> --manifest <path.json> --yes-write
 *   ... --from-foundation --only <codes> --manifest <path.json> --remove --yes-write   # new demos only
 *
 * NOTHING is written unless --yes-write is passed; without it every mode runs as a dry run and says so.
 *
 * Live demos (the 10 curated ones) are left alone by default: only missing field values, a missing
 * English bio and (with --set-live-password) the shared password. --include-live-content replaces their
 * offerings, menu, hours and more; it needs --only listing them and prints a loud warning.
 *
 * Options: --status <path> (default: <foundation dir>/status.json), --dir <foundation dir>,
 *          --all (seed every selected demo without --only).
 */
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { DEMO_BATCH } from "./demos";
import { resolveRunMode } from "./foundation-cli";
import { demoPasswordStatus, readDemoPassword, redact } from "./demo-identity";
import {
  DEFAULT_FOUNDATION_DIR,
  LIVE_DEMO_CODES,
  loadFoundation,
  selectDemos,
} from "./foundation-load";
import { UNIVERSAL_FIELD_KEYS } from "./foundation-plan";
import {
  MIGRATION_HINT,
  assertOutsideRepo,
  loadAuthUsers,
  loadFieldDefs,
  loadLocationIndex,
  loadManifest,
  loadSlugNamespace,
  mergeStatus,
  readOnly,
  removeDemos,
  resolveHubTenantId,
  resolveTermIds,
  saveManifest,
  seedDemo,
  validateDemo,
  type DemoReport,
  type SeedContext,
} from "./foundation-seed-core";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  if (!flag("--from-foundation")) {
    throw new Error("pass --from-foundation (the original 10-demo roster is seeded by seed.mts)");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
  if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
    throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
  }
  const mode = resolveRunMode(args);
  const dryRun = !mode.write && !flag("--remove");
  if (mode.notice) console.log(`NOTE: ${mode.notice}`);
  const includeLiveContent = flag("--include-live-content");
  const setLivePassword = flag("--set-live-password");
  const remove = flag("--remove");
  const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  if (mode.write && !only && !flag("--all")) throw new Error("REFUSE: pass --only <codes> (or --all) for a real run");

  const dir = opt("--dir") ?? process.env.DEMO_FOUNDATION_DIR ?? DEFAULT_FOUNDATION_DIR;
  const statusPath = opt("--status") ?? path.join(dir, "status.json");
  const manifestPath = opt("--manifest");
  if (mode.write) {
    if (!manifestPath) throw new Error("--manifest <path.json> is required");
    assertOutsideRepo(manifestPath);
    assertOutsideRepo(statusPath);
  }

  if (includeLiveContent) {
    if (!only) throw new Error("REFUSE: --include-live-content requires --only listing the live codes");
    console.warn("!!! --include-live-content: live demos will have their offerings, services menu, booking hours, availability and languages REPLACED. Their curated showcase content is at risk.");
  }

  // The password refusal comes first: nothing is read or written without it.
  const demosPreview = selectDemos(loadFoundation({ dir }), only);
  const needsPassword = demosPreview.some((d) => !d.isLive) || setLivePassword;
  const password = !mode.write || remove || !needsPassword ? "" : readDemoPassword();

  const demos = demosPreview;
  if (includeLiveContent) {
    const liveSelected = demos.filter((d) => d.isLive).map((d) => d.profileCode);
    if (liveSelected.length === 0) throw new Error("REFUSE: --include-live-content given but --only lists no live demo");
  }
  console.log(`${remove ? (mode.write ? "REMOVE" : "REMOVE (dry run)") : dryRun ? "DRY RUN (read-only)" : "SEED"}: ${demos.length} demo(s) against ${targetRef}`);
  if (dryRun) console.log(`DEMO_PASSWORD: ${demoPasswordStatus()} (a real run refuses unless ok)`);

  const raw = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = mode.write ? raw : readOnly(raw);
  const now = new Date();

  if (remove) {
    if (!only) throw new Error("REFUSE: --remove needs --only <codes>");
    if (!manifestPath) throw new Error("--manifest <path.json> is required");
    const manifest = loadManifest(manifestPath, targetRef);
    if (!mode.write) {
      const live = new Set(Object.values(LIVE_DEMO_CODES));
      for (const c of only) console.log(`  would remove ${c}${live.has(c) ? " (REFUSED: live demo)" : manifest.entries[c] ? "" : " (not in the manifest)"}`);
      console.log("dry run: nothing removed. Add --yes-write to remove.");
      return;
    }
    await removeDemos(
      { admin, manifest, saveManifest: () => saveManifest(manifestPath!, manifest), log: console.log },
      only,
      new Set(Object.values(LIVE_DEMO_CODES)),
    );
    return;
  }

  const hubTenantId = await resolveHubTenantId(admin);
  const terms = await resolveTermIds(admin, demos.map((d) => d.talentTypeSlug));
  const fieldKeys = [...UNIVERSAL_FIELD_KEYS, ...demos.flatMap((d) => Object.keys(d.typeFields))];
  const fieldDefs = await loadFieldDefs(admin, fieldKeys);
  const ctxBase = {
    includeLiveContent,
    setLivePassword,
    admin,
    hubTenantId,
    termIds: terms.ids,
    fieldDefs,
    namespace: await loadSlugNamespace(admin, now.toISOString()),
    locations: await loadLocationIndex(admin),
    auth: await loadAuthUsers(admin),
    now,
  };

  // Validate every selected demo read-only before any write.
  const reports: DemoReport[] = [];
  for (const d of demos) reports.push(await validateDemo(ctxBase, d));
  const problems = reports.flatMap((r) => r.problems.map((p) => `${r.code}: ${p}`));

  if (dryRun) {
    printDryRun(reports, terms.missing, hubTenantId, fieldDefs.size);
    if (problems.length) process.exitCode = 1;
    return;
  }
  if (problems.length) {
    for (const p of problems) console.error(`  problem ${p}`);
    if (terms.missing.length) console.error(`  ${MIGRATION_HINT}`);
    throw new Error(`${problems.length} problem(s) found; nothing was written`);
  }

  const manifest = loadManifest(manifestPath!, targetRef);
  const ctx: SeedContext = {
    ...ctxBase,
    password,
    manifest,
    saveManifest: () => saveManifest(manifestPath!, manifest),
    onStatus: (e) => mergeStatus(statusPath, e),
    log: console.log,
  };
  // The namespace was consumed by validateDemo's slug picks; reload so the real run starts clean.
  ctx.namespace = await loadSlugNamespace(admin, now.toISOString());
  for (const d of demos) await seedDemo(ctx, d);
  console.log(`done ${demos.length} demo(s); manifest ${manifestPath}; status ${statusPath}; batch ${DEMO_BATCH}`);
}

function printDryRun(reports: DemoReport[], missingTerms: string[], hub: string, defCount: number) {
  console.log(`hub tenant ${hub}; ${defCount} field definitions resolved`);
  const totals: Record<string, number> = {};
  for (const r of reports) {
    const c = Object.entries(r.counts).map(([k, v]) => `${k.split(" ")[0]}=${v}`).join(" ");
    console.log(`\n${r.code} ${r.demoId} ${r.name}${r.live ? " [LIVE, content only]" : ""} slug=${r.slug}`);
    console.log(`  planned: ${c}`);
    console.log(`  field values ${r.fieldValues} (skipped ${r.skippedFields})`);
    for (const w of r.warnings) console.log(`  warn ${w}`);
    for (const p of r.problems) console.log(`  PROBLEM ${p}`);
    for (const [k, v] of Object.entries(r.counts)) totals[k] = (totals[k] ?? 0) + v;
  }
  console.log("\nPlanned rows by table (all selected demos):");
  for (const [k, v] of Object.entries(totals)) console.log(`  ${k.padEnd(42)} ${v}`);
  const problems = reports.reduce((n, r) => n + r.problems.length, 0);
  console.log(`\n${problems === 0 ? "OK: no problems" : `${problems} problem(s)`}${missingTerms.length ? `; missing taxonomy slugs: ${missingTerms.join(", ")}` : ""}`);
}

main().catch((e: unknown) => {
  const secrets = [process.env.DEMO_PASSWORD ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""];
  console.error(redact(e instanceof Error ? e.message : String(e), secrets));
  process.exit(1);
});
