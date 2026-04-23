#!/usr/bin/env node
// Reset the Midnight Muse Collective owner password so QA can sign in.
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL } = process.env;
const url = SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL;
if (!url || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const admin = createClient(url, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = "owner@midnightmuse.demo";
const password = "Midnight-Muse-Owner-2026!";
const userId = "1260a7bc-709d-4ae4-a824-7d89bae468e4";

const { data, error } = await admin.auth.admin.updateUserById(userId, {
  password,
  email_confirm: true,
});
if (error) {
  console.error("update failed:", error.message);
  process.exit(1);
}
console.log(`✓ ${email} password set to: ${password}`);
console.log(`✓ user id: ${data.user?.id}`);
