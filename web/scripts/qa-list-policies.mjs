import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";
loadEnvLocal();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const tables = ["inquiries", "inquiry_messages", "inquiry_participants", "inquiry_offers"];
for (const tbl of tables) {
  console.log(`\n=== ${tbl} ===`);
  const { data, error } = await s.rpc("exec_sql", { sql: `SELECT policyname, cmd, qual::text, with_check::text FROM pg_policies WHERE schemaname='public' AND tablename='${tbl}'` });
  if (error) console.log("err", error.message);
  else console.log(data);
}
