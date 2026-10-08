/**
 * Demo rebuild without a dev server: the same orchestrator the API route and
 * Builder Lab call (`rebuildDemos`), run straight against the project named by
 * DEMO_SEED_TARGET_REF. Dry run by default; `--write` applies. Every demo is
 * re-checked by `assertDemoTarget` (registry + is_demo + demo account), so a
 * real talent, Jor or a QA user is refused before any read of its site rows.
 *
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=.env.local \
 *     scripts/demo-talents/rebuild-direct.mts [--design gridline] [--only TAL-93206,...] [--write] [--no-publish]
 */
import { createClient } from "@supabase/supabase-js";
const { rebuildDemos } = await import("../../src/lib/talent-site/demos/demo-rebuild.server");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const write = args.includes("--write");
const design = opt("--design") as "maison-v2" | "folio" | "gridline" | undefined;
const only = opt("--only")?.split(",").filter(Boolean);

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
console.log(`${write ? "WRITING" : "DRY RUN (add --write to apply)"} against ${targetRef}${design ? `, design ${design}` : ""}${only ? `, only ${only.join(",")}` : ""}`);
const result = await rebuildDemos(admin, {
  ...(design ? { design } : {}),
  ...(only ? { only } : {}),
  dryRun: !write,
  publish: !args.includes("--no-publish"),
});
const pad = (v: string, n: number) => v.padEnd(n);
console.log(`${pad("code", 10)} ${pad("design", 9)} ${pad("version", 8)} ${pad("status", 12)} ${pad("changed", 32)} runId/error`);
for (const r of result.rows) {
  console.log(
    `${pad(r.profileCode, 10)} ${pad(r.design, 9)} ${pad(r.version === null ? "-" : `v${r.version}`, 8)} ${pad(r.status, 12)} ${pad(r.changed.join(",") || "-", 32)} ${r.runId ?? r.error ?? ""}`.trimEnd(),
  );
}
if (result.rows.some((r) => r.status === "failed" || r.status === "refused")) {
  console.error("At least one demo failed or was refused.");
  process.exit(1);
}
