// Reads the fixture floor's rows on the isolated QA database. No secret is printed.
import { createClient } from "@supabase/supabase-js";
const T = "33333333-3333-4333-8333-333333333333";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const spaces = await q(sb.from("spaces").select("id, code, name, party_min, party_max, needs_reset_at").eq("tenant_id", T).order("code"));
const visits = await q(sb.from("visits").select("id, space_id, joined_space_id, status, party_size, service_kind, opened_at, closed_at, version").eq("tenant_id", T).order("opened_at", { ascending: false }).limit(8));
const orders = await q(sb.from("orders").select("id, status, total_cents, currency, visit_id, updated_at").eq("tenant_id", T).not("visit_id", "is", null).order("updated_at", { ascending: false }).limit(6));
const tickets = await q(sb.from("preparation_tickets").select("id, order_id, visit_id, destination, status, revision, submitted_at").eq("tenant_id", T).order("submitted_at", { ascending: false }).limit(6));
const agency = await q(sb.from("agencies").select("settings->pos").eq("id", T).maybeSingle());
console.log(JSON.stringify({ at: new Date().toISOString(), pos_settings: agency, spaces, visits, orders, tickets }, null, 2));
