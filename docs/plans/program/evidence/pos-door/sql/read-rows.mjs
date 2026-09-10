// Reads the rows the Door mode wrote on the isolated QA database (run 4, night "Door night 1789071294985").
// Run from web/ with .env.capacity-isolated.local exported. No secret is printed.
import { createClient } from "@supabase/supabase-js";
const T = "33333333-3333-4333-8333-333333333333";
const TITLE = process.argv[2] ?? "Door night 1789071294985";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const event = await q(sb.from("events").select("id, title, status, offering_id").eq("tenant_id", T).eq("title", TITLE).maybeSingle());
const variants = await q(sb.from("talent_offering_variants").select("id, label, pool_key, amount_cents, admits_per_unit").eq("offering_id", event.offering_id));
const session = await q(sb.from("sessions").select("id, title, status, starts_at, ends_at, event_id").eq("tenant_id", T).eq("event_id", event.id).maybeSingle());
const pools = await q(sb.from("capacity_pools").select("id, pool_key, units_total, is_active").eq("subject_kind", "session_tier").eq("subject_id", session.id));
const admissions = await q(sb.from("admissions").select("id, order_line_id, holder_name, party_size, admitted_count, status, seated_at, no_show_at, token_version, door_amount_cents").eq("tenant_id", T).eq("session_id", session.id).order("created_at"));
const lineIds = admissions.map((a) => a.order_line_id).filter(Boolean);
const lines = await q(sb.from("order_lines").select("id, order_id, label, units, unit_cents, variant_id, session_id").in("id", lineIds));
const orderIds = [...new Set(lines.map((l) => l.order_id))];
const orders = await q(sb.from("orders").select("id, status, total_cents, currency, source_channel, source_page, receipt_code, version, updated_at").in("id", orderIds));
const transactions = await q(sb.from("booking_transactions").select("id, order_id, status, provider, gross_amount_cents, net_amount_cents, currency, metadata, paid_at").in("order_id", orderIds));
const allocations = await q(sb.from("capacity_allocations").select("id, pool_id, state, units, order_line_id").in("pool_id", pools.map((p) => p.id)));
const shift = await q(sb.from("pos_shifts").select("id, status, opened_at").eq("tenant_id", T).eq("status", "open"));
const agency = await q(sb.from("agencies").select("timezone, settings->pos").eq("id", T).maybeSingle());
console.log(JSON.stringify({ at: new Date().toISOString(), agency, event, variants, session, pools, admissions, lines, orders, transactions, allocations, open_shift: shift }, null, 2));
