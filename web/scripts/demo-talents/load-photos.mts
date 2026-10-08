/**
 * Photos-only loader for the Demo Foundation talents (see load-photos-core.ts).
 * Unlike load-pack.mts it never replaces services, bio or any profile field.
 *
 * Run (from web/):
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=<env> scripts/demo-talents/load-photos.mts \
 *     --pack <pack.json> --manifest <manifest.json> [--only <codes>] [--replace] [--strict] [--include-live] [--yes-write]
 * Without --yes-write it is a dry run on a read-only client and prints the planned uploads.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { resolveRunMode } from "./foundation-cli";
import { redact } from "./demo-identity";
import { assertOutsideRepo, loadFieldDefs, loadManifest, readOnly, resolveHubTenantId, saveManifest } from "./foundation-seed-core";
import { loadAllPhotos, type PhotoPack } from "./load-photos-core";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
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
  const mode = resolveRunMode(args);
  if (mode.notice) console.log(`NOTE: ${mode.notice}`);
  const packPath = opt("--pack");
  const manifestPath = opt("--manifest");
  if (!packPath || !manifestPath) throw new Error("--pack <pack.json> and --manifest <manifest.json> are required");
  if (mode.write) assertOutsideRepo(manifestPath);
  const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8")) as PhotoPack;
  const manifest = loadManifest(manifestPath, targetRef);

  const raw = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = mode.write ? raw : readOnly(raw);
  const hubTenantId = await resolveHubTenantId(admin);
  const defs = await loadFieldDefs(admin, ["albums.list"]);
  const albumsFieldId = defs.get("albums.list")?.id ?? null;

  console.log(`${mode.write ? "LOAD PHOTOS" : "DRY RUN (read-only)"} against ${targetRef}; hub ${hubTenantId}`);
  const results = await loadAllPhotos(
    {
      admin,
      hubTenantId,
      albumsFieldId,
      manifest,
      saveManifest: () => saveManifest(manifestPath, manifest),
      log: console.log,
      write: mode.write,
      replace: flag("--replace"),
      includeLive: flag("--include-live"),
      strict: flag("--strict"),
    },
    pack,
    only,
  );
  for (const r of results) for (const w of r.warnings) console.log(`warn ${r.code}: ${w}`);
  console.log(`\n${mode.write ? "done" : "dry run: nothing written. Add --yes-write to write."} ${results.length} demo(s)`);
}

main().catch((e: unknown) => {
  console.error(redact(e instanceof Error ? e.message : String(e), [process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""]));
  process.exit(1);
});
