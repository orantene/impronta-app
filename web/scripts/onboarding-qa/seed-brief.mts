/**
 * Isolated-only: load a fixture's facts onto the owner's live brief so the
 * understood card can be exercised without a model or KV.
 *   JOURNEYS_ISOLATED=1 npx tsx --env-file=.env.local scripts/onboarding-qa/seed-brief.ts <email> <rosa|mariana|el-paisa> [intent]
 */
import { createClient } from "@supabase/supabase-js";
import { assertIsolatedJourneysTarget } from "../isolated-target-guard.mjs";
import { fixtureById } from "../../src/lib/onboarding/fixtures";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });
const [email, id, intent = "unknown"] = process.argv.slice(2);
const fx = fixtureById(id as "rosa");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const users = (await admin.auth.admin.listUsers({ perPage: 500 })).data?.users ?? [];
const user = users.find((u) => u.email === email);
if (!user) throw new Error("no user " + email);
await admin.from("tulala_briefs").update({ status: "abandoned" }).eq("profile_id", user.id).neq("status", "abandoned");
const input = fx.link ? { kind: "url", value: fx.link } : { kind: "text", value: fx.sentence.en };
const { data: brief, error } = await admin.from("tulala_briefs").insert({ profile_id: user.id, locale: "en", module_state: { intent, step: "understood", input, locale: "en", updatedAt: new Date().toISOString() } }).select("id").single();
if (error || !brief) throw error;
const rows = fx.facts.map(([factKey, value, source = "user_stated", status]) => ({
  brief_id: brief.id, fact_key: factKey, fact_value: value, source,
  status: status ?? (source === "user_stated" ? "confirmed" : "needs_approval"),
  confidence: source === "user_stated" ? 1 : 0.7, source_url: fx.link ?? null,
}));
const ins = await admin.from("tulala_brief_facts").insert(rows);
console.log("brief", brief.id, "facts", rows.length, ins.error?.message ?? "ok");
