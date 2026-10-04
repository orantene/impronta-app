import { createClient } from "@supabase/supabase-js";
const { syncBuiltinTalentThemes } = await import("../src/lib/talent-site/theme-catalog/sync-builtins.server");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { persistSession: false } });
const r = await syncBuiltinTalentThemes(admin);
console.log(r);
