import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const client = createClient(url, anonKey);
const { data, error } = await client.auth.signInWithPassword({
  email: "owner@midnightmuse.demo",
  password: (process.env.MIDNIGHT_OWNER_PASSWORD?.trim() || (() => { throw new Error("MIDNIGHT_OWNER_PASSWORD is required (QA credential is no longer hardcoded in the repo)"); })()),
});
if (error) {
  console.error("LOGIN FAILED:", error.message);
  process.exit(1);
}
console.log("✓ Owner login works. User id:", data.user.id);
console.log("✓ Access token issued (first 20 chars):", data.session?.access_token?.slice(0, 20) + "…");
