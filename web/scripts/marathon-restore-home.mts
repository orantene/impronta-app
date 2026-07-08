/**
 * DISASTER RECOVERY: restore the Impronta published home from the committed
 * backup, in case the visual builder's empty draft is ever published over the
 * live editorial home. This IS a prod write — run only when you mean to restore.
 *   npx tsx --env-file=.env.local scripts/marathon-restore-home.mts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PAGE = "90552cf6-2230-4a40-8320-c2e303e3ee56";
const backup = JSON.parse(readFileSync("docs/backups/impronta-home-published-2026-07-08.json", "utf8"));
const snap = backup.snapshot;
if (!snap?.builderTree?.length) throw new Error("backup missing builderTree");
const { error } = await sb.from("cms_pages").update({ published_homepage_snapshot: snap }).eq("id", PAGE);
if (error) throw error;
console.log(`RESTORED published home from backup (version ${backup.version}, ${backup.nodeCount} nodes).`);
