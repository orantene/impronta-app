import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";
loadEnvLocal();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Migration tracking
const { data, error } = await s.schema("supabase_migrations").from("schema_migrations").select("version").order("version", { ascending: false }).limit(20);
if (error) console.log("migrations err:", error.message);
else {
  console.log("Latest 20 migrations applied to remote:");
  data.forEach((m) => console.log(`  ${m.version}`));
  console.log("\nHas 20260918000000_rls_staff_tenant_scope?", data.some((m) => m.version.startsWith("20260918")));
}
