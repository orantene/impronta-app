/**
 * THEME RELEASES: read-only sync status per design (F102). Shows, for every
 * catalog Design, the catalog row's version, every snapshot version, every
 * release (from -> to, channel, status) and whether the current code payload
 * differs from the newest snapshot (i.e. whether a sync WOULD cut a release).
 * Reads only. No writes of any kind.
 *
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs npx tsx --tsconfig scripts/demo-talents/tsconfig.json \
 *     --env-file=.env.local scripts/theme-releases/sync-status.mts [--only maison-v2]
 */
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { hashBuiltinPayload } = await import("../../src/lib/talent-site/theme-catalog/sync-builtins.server");
const { BUILTIN_DESIGNS } = await import("../../src/lib/talent-site/theme-catalog/builtins");
const { MAISON_BUILTIN_DESIGN } = await import("../../src/lib/talent-site/theme-catalog/maison/builtins");
const { COLLECTION_DESIGNS } = await import("../../src/lib/talent-site/theme-catalog/collection/designs");
const code = new Map(
  [...BUILTIN_DESIGNS, MAISON_BUILTIN_DESIGN, ...COLLECTION_DESIGNS].map((d) => [d.slug, d.buildPayload()] as const),
);

const { data: catalog, error: cErr } = await admin
  .from("talent_theme_catalog")
  .select("slug, version, payload")
  .eq("kind", "design")
  .order("sort_order", { ascending: true });
if (cErr) throw cErr;
const { data: snaps, error: sErr } = await admin.from("talent_theme_versions").select("design, version, payload");
if (sErr) throw sErr;
const { data: rels, error: rErr } = await admin
  .from("talent_theme_releases")
  .select("design_slug, from_version, to_version, channel, status, rollout_pct");
if (rErr) throw rErr;

for (const row of catalog ?? []) {
  const slug = row.slug as string;
  if (only && slug !== only) continue;
  const mine = (snaps ?? []).filter((s) => s.design === slug).sort((a, b) => (a.version as number) - (b.version as number));
  const rs = (rels ?? []).filter((r) => r.design_slug === slug).sort((a, b) => (a.to_version as number) - (b.to_version as number));
  const latest = mine.length ? mine[mine.length - 1]! : null;
  const latestVersion = Math.max(row.version as number, latest ? (latest.version as number) : 0);
  const latestPayload = latest && (latest.version as number) > (row.version as number) ? latest.payload : row.payload;
  const codePayload = code.get(slug);
  const verdict = !codePayload
    ? "no code entry"
    : hashBuiltinPayload(codePayload) === hashBuiltinPayload(latestPayload)
      ? "code == latest (sync is a no-op)"
      : `code differs: a sync would cut v${Math.max(latestVersion, ...rs.map((r) => r.to_version as number)) + 1}`;
  console.log(`\n${slug}`);
  console.log(`  catalog: v${row.version}${latestVersion > (row.version as number) ? `  (held back, newest snapshot v${latestVersion})` : ""}`);
  console.log(`  snapshots: ${mine.map((s) => `v${s.version}`).join(", ") || "none"}`);
  console.log(
    `  releases: ${rs.map((r) => `${r.from_version}->${r.to_version} [${r.channel}/${r.status}${r.rollout_pct ? ` ${r.rollout_pct}%` : ""}]`).join(", ") || "none"}`,
  );
  console.log(`  ${verdict}`);
}
