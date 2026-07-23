/**
 * prune-duplicate-system-notes.mts — W1-2 one-shot cleanup of historical
 * system-note spam (message_kind='system_event') from inquiry threads.
 *
 * DRY-RUN by default: prints per-inquiry counts and the ids it WOULD delete.
 * Pass `--apply` to actually delete. Idempotent (re-running after an apply finds
 * nothing). Never touches human messages, cards, or non-adjacent notes — it only
 * removes all-but-the-newest of a run of consecutive same-body system rows, the
 * exact noise W1-1 folds away in the UI.
 *
 *   Dry run:  npx tsx --env-file=.env.local scripts/prune-duplicate-system-notes.mts
 *   Apply:    npx tsx --env-file=.env.local scripts/prune-duplicate-system-notes.mts --apply
 *
 * Reads Supabase creds from the env (.env.local). Service-role only.
 */

import { findPrunableSystemRowIds, type PrunableRow } from "../src/lib/inquiry/prune-duplicate-system-notes";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "");
if (!url || !key) {
  console.error("Missing SUPABASE env. Run with --env-file=.env.local");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const H = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res;
}

async function main() {
  console.log(`\n=== prune-duplicate-system-notes (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  // Pull all system_event rows, grouped by inquiry, chronological.
  const rows = (await (
    await rest(
      "inquiry_messages?select=id,inquiry_id,message_kind,body,created_at&message_kind=eq.system_event&order=inquiry_id.asc,created_at.asc&limit=100000",
    )
  ).json()) as Array<{ id: string; inquiry_id: string; body: string; created_at: string }>;

  // Group by inquiry preserving chronological order.
  const byInquiry = new Map<string, PrunableRow[]>();
  for (const r of rows) {
    const list = byInquiry.get(r.inquiry_id) ?? [];
    list.push({ id: r.id, authorRole: "system", body: r.body, createdAt: r.created_at });
    byInquiry.set(r.inquiry_id, list);
  }

  const allDeleteIds: string[] = [];
  let inquiriesAffected = 0;
  for (const [inquiryId, list] of byInquiry) {
    const del = findPrunableSystemRowIds(list);
    if (del.length > 0) {
      inquiriesAffected += 1;
      allDeleteIds.push(...del);
      console.log(`  inquiry ${inquiryId.slice(0, 8)} : ${list.length} notes → prune ${del.length}`);
    }
  }

  console.log(`\nTotals: ${byInquiry.size} inquiries scanned · ${inquiriesAffected} affected · ${allDeleteIds.length} duplicate rows to delete.`);

  if (!APPLY) {
    console.log("\nDRY-RUN — nothing deleted. Re-run with --apply to delete.\n");
    return;
  }
  if (allDeleteIds.length === 0) {
    console.log("\nNothing to delete.\n");
    return;
  }

  // Delete in chunks (URL length safety).
  let deleted = 0;
  const CHUNK = 100;
  for (let i = 0; i < allDeleteIds.length; i += CHUNK) {
    const ids = allDeleteIds.slice(i, i + CHUNK);
    const inList = ids.map((x) => `"${x}"`).join(",");
    await rest(`inquiry_messages?id=in.(${inList})&message_kind=eq.system_event`, { method: "DELETE" });
    deleted += ids.length;
  }
  console.log(`\nAPPLIED — deleted ${deleted} duplicate system-note rows.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
