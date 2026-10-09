/**
 * TUL-429 repair: an accepted offer used to get TWO orders. The booking
 * trigger's `source_channel = 'offer'` order stayed pending for ever next to
 * the pay path's `messages_offer` order, and the Money page read a paid sale
 * as "Pago parcial / Te deben". This cancels the dead pending duplicate.
 *
 * SAFE BY DEFAULT.
 *   dry run (default): reads, prints the plan, writes NOTHING.
 *   --apply --confirm-ref <ref>: writes a backup file FIRST, then cancels.
 *   --restore <backup.json> --confirm-ref <ref>: puts those orders back.
 * The target is whatever SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL points at, and
 * a write is refused unless --confirm-ref equals that URL's project ref, so a
 * wrong env file cannot write to a project the operator did not name.
 *
 * A pending `offer` order is only a duplicate when ALL hold:
 *   - a sibling `messages_offer` order exists on the same inquiry with the same
 *     currency and total, and the sibling is not cancelled;
 *   - NOTHING references the pending order: no payment link, booking,
 *     collection reservation or money row. Anything referenced is reported
 *     and left alone for a person to look at.
 *
 *   node --env-file=<env file> scripts/repair-duplicate-offer-orders.mjs
 *   node --env-file=<env file> scripts/repair-duplicate-offer-orders.mjs --apply --confirm-ref <ref>
 *   node --env-file=<env file> scripts/repair-duplicate-offer-orders.mjs --restore <backup.json> --confirm-ref <ref>
 *
 * Exit codes: 0 ok, 1 a write failed, 2 refused.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** Pure: which pending offer orders are duplicates, and which are held back. */
export function planDuplicateOrderRepairs({ pending, siblings, referenced }) {
  const toCancel = [];
  const heldBack = [];
  for (const o of pending) {
    const twin = siblings.find(
      (s) => s.inquiry_id === o.inquiry_id && s.currency === o.currency && Number(s.total_cents) === Number(o.total_cents) && s.status !== "cancelled" && s.id !== o.id,
    );
    if (!twin) continue;
    const refs = referenced[o.id] ?? [];
    if (refs.length > 0) heldBack.push({ order: o, twin: twin.id, referencedBy: refs });
    else toCancel.push({ order: o, twin: twin.id });
  }
  return { toCancel, heldBack };
}

export function projectRefOf(url) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url ?? "");
  return m ? m[1] : null;
}

const CHUNK = 150;
const chunks = (a) => Array.from({ length: Math.ceil(a.length / CHUNK) }, (_, i) => a.slice(i * CHUNK, (i + 1) * CHUNK));

async function loadAll(sb, table, col, ids, select) {
  const out = [];
  for (const part of chunks(ids)) {
    const { data, error } = await sb.from(table).select(select).in(col, part);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const ref = projectRefOf(url);
  if (!ref || !key) {
    console.error("REFUSED: no Supabase URL / service role key in the environment.");
    process.exit(2);
  }
  const writing = flag("--apply") || flag("--restore");
  if (writing && val("--confirm-ref") !== ref) {
    console.error(`REFUSED: this env points at project ${ref}; pass --confirm-ref ${ref} to write to it.`);
    process.exit(2);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  console.log(`target project: ${ref}  mode: ${flag("--restore") ? "restore" : flag("--apply") ? "APPLY" : "dry run"}`);

  if (flag("--restore")) {
    const backup = JSON.parse(readFileSync(val("--restore"), "utf8"));
    if (backup.ref !== ref) {
      console.error(`REFUSED: backup was taken on project ${backup.ref}, not ${ref}.`);
      process.exit(2);
    }
    let failed = 0;
    for (const o of backup.orders) {
      const { error } = await sb.from("orders").update({ status: o.status }).eq("id", o.id).eq("status", "cancelled");
      if (error) {
        failed++;
        console.error(`restore ${o.id}: ${error.message}`);
      } else console.log(`restored ${o.id} -> ${o.status}`);
    }
    process.exit(failed ? 1 : 0);
  }

  const { data: pending, error: pe } = await sb
    .from("orders")
    .select("id, tenant_id, inquiry_id, currency, total_cents, status, created_at")
    .eq("source_channel", "offer")
    .eq("status", "pending_payment")
    .not("inquiry_id", "is", null);
  if (pe) throw new Error(`orders: ${pe.message}`);
  const inquiryIds = [...new Set((pending ?? []).map((o) => o.inquiry_id))];
  const siblings = inquiryIds.length ? await loadAll(sb, "orders", "inquiry_id", inquiryIds, "id, inquiry_id, currency, total_cents, status, source_channel") : [];
  const twins = siblings.filter((s) => s.source_channel === "messages_offer");
  const candidateIds = (pending ?? []).filter((o) => twins.some((s) => s.inquiry_id === o.inquiry_id)).map((o) => o.id);
  const referenced = {};
  const refTables = [
    ["payment_links", "order_id"],
    ["agency_bookings", "order_id"],
    ["order_collection_reservations", "order_id"],
    ["booking_transactions", "order_id"],
  ];
  for (const [table, col] of refTables) {
    for (const row of await loadAll(sb, table, col, candidateIds, col)) (referenced[row[col]] ??= []).push(table);
  }
  const { toCancel, heldBack } = planDuplicateOrderRepairs({ pending: pending ?? [], siblings: twins, referenced });
  console.log(`pending offer orders: ${(pending ?? []).length}; duplicates to cancel: ${toCancel.length}; held back (referenced): ${heldBack.length}`);
  for (const d of toCancel) console.log(`  cancel ${d.order.id} (inquiry ${d.order.inquiry_id}, ${d.order.total_cents} ${d.order.currency}) twin ${d.twin}`);
  for (const h of heldBack) console.log(`  HOLD   ${h.order.id} referenced by ${[...new Set(h.referencedBy)].join(",")} twin ${h.twin}`);
  if (!flag("--apply")) {
    console.log("dry run: nothing written. Re-run with --apply --confirm-ref " + ref + " to cancel.");
    return;
  }
  if (toCancel.length === 0) return;
  const file = `duplicate-offer-orders-backup-${ref}-${Date.now()}.json`;
  writeFileSync(file, JSON.stringify({ ref, takenAt: new Date().toISOString(), orders: toCancel.map((d) => d.order) }, null, 2));
  console.log(`backup written: ${file}`);
  let failed = 0;
  for (const d of toCancel) {
    const { error } = await sb.from("orders").update({ status: "cancelled" }).eq("id", d.order.id).eq("status", "pending_payment");
    if (error) {
      failed++;
      console.error(`cancel ${d.order.id}: ${error.message}`);
    } else console.log(`cancelled ${d.order.id}`);
  }
  process.exit(failed ? 1 : 0);
}

import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
