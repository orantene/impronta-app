// Reads the rows the Front desk journey wrote on the isolated QA database
// (qa-journeys, fxlankepwnvelxjrahwk). Usage, from web/:
//   cp ../docs/plans/program/evidence/pos-classes/sql/read-rows.mjs scripts/.read-rows.mjs && node --env-file=.env.capacity-isolated.local scripts/.read-rows.mjs <stamp>
// (copied under web/ so @supabase/supabase-js resolves)
// <stamp> is the Date.now() the spec minted (it is in every name it wrote).
// No secret is printed.
import { createClient } from "@supabase/supabase-js";
const T = "33333333-3333-4333-8333-333333333333";
const stamp = process.argv[2];
if (!stamp) { console.error("usage: read-rows.mjs <stamp>"); process.exit(2); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };

const bookings = await q(sb.from("agency_bookings").select("id, contact_name, status, starts_at, ends_at, order_id, updated_by_staff_id").eq("tenant_id", T).like("contact_name", `%${stamp}%`).order("starts_at"));
const orderIds = bookings.map((b) => b.order_id).filter(Boolean);
const events = await q(sb.from("events").select("id, title, status").eq("tenant_id", T).like("title", `%${stamp}%`));
const sessions = events.length ? await q(sb.from("sessions").select("id, title, starts_at, ends_at, status, offering_id").in("event_id", events.map((e) => e.id))) : [];
const sessionIds = sessions.map((s) => s.id);
const pools = sessionIds.length ? await q(sb.from("capacity_pools").select("id, subject_id, pool_key, units_total").eq("subject_kind", "session_tier").in("subject_id", sessionIds)) : [];
const admissions = sessionIds.length ? await q(sb.from("admissions").select("id, session_id, status, party_size, admitted_count, seated_at, allocation_id, order_line_id, holder_name").in("session_id", sessionIds).order("created_at")) : [];
const lines = admissions.length ? await q(sb.from("order_lines").select("id, order_id, offering_id, session_id, units").in("id", admissions.map((a) => a.order_line_id).filter(Boolean))) : [];
for (const l of lines) orderIds.push(l.order_id);
const orders = orderIds.length ? await q(sb.from("orders").select("id, status, total_cents, currency, source_channel, source_page, version, customer_id").in("id", orderIds)) : [];
const customers = orders.length ? await q(sb.from("customers").select("id, display_name, email").in("id", orders.map((o) => o.customer_id).filter(Boolean))) : [];
const txns = orderIds.length ? await q(sb.from("booking_transactions").select("id, order_id, status, gross_amount_cents, provider, metadata, paid_at").in("order_id", orderIds)) : [];
const holds = orderIds.length ? await q(sb.from("talent_holds").select("operation_key, talent_profile_id, starts_at, ends_at, expires_at").in("operation_key", orderIds.map((id) => `order:${id}:reserve`))) : [];
const allocations = admissions.length ? await q(sb.from("capacity_allocations").select("id, pool_id, state, units, order_line_id").in("id", admissions.map((a) => a.allocation_id).filter(Boolean))) : [];
const waitlist = sessionIds.length ? await q(sb.from("session_waitlist_entries").select("id, session_id, customer_name, status, joined_at, offered_at, offer_expires_at, accepted_allocation_id").in("session_id", sessionIds).order("joined_at")) : [];
const waitAllocs = waitlist.filter((w) => w.accepted_allocation_id).length ? await q(sb.from("capacity_allocations").select("id, pool_id, state, units, order_line_id").in("id", waitlist.map((w) => w.accepted_allocation_id).filter(Boolean))) : [];
const agency = await q(sb.from("agencies").select("timezone, settings->pos").eq("id", T).maybeSingle());
console.log(JSON.stringify({ at: new Date().toISOString(), stamp, agency, bookings, orders, customers, booking_transactions: txns, talent_holds: holds, events, sessions, capacity_pools: pools, admissions, order_lines: lines, admission_allocations: allocations, waitlist, waitlist_allocations: waitAllocs }, null, 2));
