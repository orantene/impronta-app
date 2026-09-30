/**
 * Build the Maison v2 and Folio demo talents as real sites (2026-09-30).
 *
 * For each demo in THEME_DEMOS: apply the design's section layout hydrated
 * with the talent's OWN profile, services and photos (theme-apply-core
 * `buildDesignTrees`, the same core the builder uses) plus the demo's look as
 * draft tokens.
 *
 * Maison v2 demos with a style in MAISON_V2_DEMO_STYLES (theme-demos.ts) then
 * become visually DISTINCT sites through editable settings only:
 *  - palette: built-in gallery palette, or a custom palette (custom_palette +
 *    colour tokens, exactly what the builder's custom-colours step writes);
 *  - font pair (Google Fonts catalogue families as typography tokens) and
 *    shape/type tokens (corners, button style, accent style);
 *  - section variants: hero photo side + columns, hero portrait (the talent's
 *    card, F21) and inset (a detail shot from her own media, F20), ticker
 *    on/off, portfolio layout, menu thumbnails / category nav / columns,
 *    footer band tone;
 *  - section order per trade.
 *
 * Publishing:
 *  - new demos (live: false) stay unpublished; the gallery "Demo content"
 *    preview reads their draft trees + design_tokens_draft;
 *  - live demos (live: true) get the draft rewritten AND published (owner
 *    approved 2026-09-30), so the gallery shows the new version.
 * Camila (TAL-93003) also gets the guide's 4th service (batch-1.json DEMO001,
 * "Relleno de acrílico", guide price), inserted once.
 *
 * Safety: every row is re-checked as a demo (profile code in THEME_DEMOS,
 * demo_batch user, @demo.tulala.digital or demo-*@impronta.test email) and
 * the site + page rows are backed up as JSON before any write. Idempotent:
 * a demo whose draft (and, when live, published state) already matches is
 * reported "unchanged" and not touched.
 *
 * The core lives in src/lib/talent-site/server/demo-pipeline.server.ts (shared with
 * Builder Lab's release manager); this file is only the CLI around it.
 *
 * Dry run by default (prints the plan and whether each site would change).
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=.env.local \
 *     scripts/demo-talents/apply-theme-demos.mts [--only TAL-93103,TAL-93109] [--yes-write]
 *     [--backup-dir <dir>] [--sync-catalog]
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { applyThemeDemos } = await import("../../src/lib/talent-site/server/demo-pipeline.server");

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
const write = args.includes("--yes-write");
const backupDir =
  opt("--backup-dir") ?? path.join(os.homedir(), "Desktop/tulala-exports/demo-foundation/backups");

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

await applyThemeDemos(admin, {
  write,
  syncCatalog: args.includes("--sync-catalog"),
  ...(opt("--only") ? { only: opt("--only")!.split(",") } : {}),
  backup: (fileName, json) => {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, fileName), json);
  },
  log: (line) => console.log(line),
});
console.log(write ? "done" : "dry run done (pass --yes-write to apply)");
