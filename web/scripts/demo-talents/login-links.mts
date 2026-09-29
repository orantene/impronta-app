/**
 * Write one-time sign-in links for the demo accounts in a seed manifest to a CSV
 * outside the repo: demo_id, code, email, action_link, generated_at, expires_at.
 * Links are single use and expire (about an hour), so run this whenever you need
 * fresh ones. Prints counts only, never a link.
 *
 * Run (from web/):
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=<env> scripts/demo-talents/login-links.mts \
 *     --manifest <path.json> --yes-write [--only TAL-93103,TAL-93104] [--out <csv>] [--dir <foundation dir>]
 *
 * Generating a link changes the auth user's token, so this is a write: without --yes-write it only
 * counts the accounts that would get a link and touches nothing.
 *
 * Default output: <foundation dir>/login-links.csv
 */
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { redact } from "./demo-identity";
import { resolveRunMode } from "./foundation-cli";
import { DEFAULT_FOUNDATION_DIR, loadFoundation } from "./foundation-load";
import { buildLoginLinks, writeLoginLinksCsv } from "./foundation-login-links";
import { loadManifest } from "./foundation-seed-core";

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
  const manifestPath = opt("--manifest");
  if (!manifestPath) throw new Error("--manifest <path.json> is required");
  const dir = opt("--dir") ?? process.env.DEMO_FOUNDATION_DIR ?? DEFAULT_FOUNDATION_DIR;
  const out = opt("--out") ?? path.join(dir, "login-links.csv");
  const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);

  const mode = resolveRunMode(args);
  if (mode.notice) console.log(`NOTE: ${mode.notice}`);
  const manifest = loadManifest(manifestPath, targetRef);
  if (!mode.write) {
    const n = Object.values(manifest.entries).filter((e) => !only || only.includes(e.profileCode)).length;
    console.log(`dry run: ${n} account(s) would get a link, written to ${out}. Nothing generated.`);
    return;
  }
  const demoIdByCode = new Map(loadFoundation({ dir }).map((d) => [d.profileCode, d.demoId]));
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { rows, skipped } = await buildLoginLinks(admin, manifest, demoIdByCode, new Date(), only);
  writeLoginLinksCsv(out, rows);
  console.log(`wrote ${rows.length} link(s) to ${out} (owner-only file); skipped ${skipped.length}`);
  for (const s of skipped) console.log(`  skipped ${s.code}: ${s.reason}`);
  const unknown = rows.filter((r) => !r.demo_id).length;
  if (unknown) console.log(`  ${unknown} row(s) are not in the 224 workbook demos (blank demo_id)`);
}

main().catch((e: unknown) => {
  console.error(redact(e instanceof Error ? e.message : String(e), [process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""]));
  process.exit(1);
});
