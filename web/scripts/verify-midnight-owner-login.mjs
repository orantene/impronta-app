import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const client = createClient(url, anonKey);
const { data, error } = await client.auth.signInWithPassword({
  email: "owner@midnightmuse.demo",
  password: "Midnight-Muse-Owner-2026!",
});
if (error) {
  console.error("LOGIN FAILED:", error.message);
  process.exit(1);
}
console.log("✓ Owner login works. User id:", data.user.id);
console.log("✓ Access token issued (first 20 chars):", data.session?.access_token?.slice(0, 20) + "…");
