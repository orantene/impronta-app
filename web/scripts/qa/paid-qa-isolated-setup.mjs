#!/usr/bin/env node
/**
 * Paid QA (TUL-8, S4-S7) fixture setup on the ISOLATED qa-journeys project ONLY.
 *
 *   node scripts/qa/paid-qa-isolated-setup.mjs            # dry run: prints the plan, writes nothing
 *   node scripts/qa/paid-qa-isolated-setup.mjs --apply    # does the writes
 *
 * What it does (idempotent):
 *   1. Refuses unless the Supabase target is the isolated project (guard + explicit ref assert
 *      before EVERY write) and the Stripe MX key is a TEST key.
 *   2. Picks the isolated fixture talent (TAL-93023, tenant qa-journeys) and a client user.
 *   3. Generates credentials with crypto.randomBytes and sets them via the Auth admin API of
 *      the ISOLATED project. They are written ONLY to web/.env.paid-qa-isolated.local (mode 600,
 *      git-ignored). Nothing secret is ever printed.
 *   4. Creates (or reuses) a Stripe MX TEST connected account, then points the fixture talent at it
 *      (stripe_account_id, stripe_account_platform='mx', default_currency='MXN') and inserts the
 *      payout_accounts row, all in the isolated DB.
 *
 * It never touches production: it does not read .env.vercel.local, and the only Stripe key it uses
 * is STRIPE_MX_SECRET_KEY from .env.local after asserting the sk_test_ prefix (the Supabase values in
 * .env.local, which are production, are NEVER read).
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { assertIsolatedJourneysTarget, QA_JOURNEYS_PROJECT_REF } from "../isolated-target-guard.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, "..", "..");
const APPLY = process.argv.includes("--apply");
const OUT = join(webDir, ".env.paid-qa-isolated.local");
const TALENT_CODE = "TAL-93023";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";

function parseEnv(path, only) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (only && !only.includes(m[1])) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// Supabase values come ONLY from the isolated env file; Stripe MX key only from .env.local.
const iso = parseEnv(join(webDir, ".env.capacity-isolated.local"), [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);
const stripeMxKey = parseEnv(join(webDir, ".env.local"), ["STRIPE_MX_SECRET_KEY"]).STRIPE_MX_SECRET_KEY ?? "";
const prior = existsSync(OUT) ? parseEnv(OUT) : {};

assertIsolatedJourneysTarget({ ...iso, JOURNEYS_ISOLATED: "1" }, { requireIsolatedFlag: true });
const assertIsolated = () => {
  if (!iso.NEXT_PUBLIC_SUPABASE_URL.includes(QA_JOURNEYS_PROJECT_REF)) {
    console.error("[paid-qa] REFUSING: Supabase URL is not the isolated project.");
    process.exit(2);
  }
};
if (!stripeMxKey.startsWith("sk_test_")) {
  console.error("[paid-qa] REFUSING: STRIPE_MX_SECRET_KEY is missing or not a TEST key.");
  process.exit(2);
}
assertIsolated();

const admin = createClient(iso.NEXT_PUBLIC_SUPABASE_URL, iso.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const stripe = new Stripe(stripeMxKey);
const gen = () => randomBytes(18).toString("base64url");
const log = (...a) => console.log("[paid-qa]", ...a);

const { data: talent, error: tErr } = await admin
  .from("talent_profiles")
  .select("id, user_id, display_name, default_currency, processing_fee_payer, stripe_account_id")
  .eq("profile_code", TALENT_CODE)
  .maybeSingle();
if (tErr || !talent?.user_id) {
  console.error("[paid-qa] fixture talent not found / has no user:", tErr?.message ?? "no user_id");
  process.exit(1);
}
const { data: tUser } = await admin.auth.admin.getUserById(talent.user_id);
const talentEmail = tUser?.user?.email;
log(`talent ${TALENT_CODE} (${talent.display_name}), email ${talentEmail ? "present" : "MISSING"}, currency ${talent.default_currency}, fee payer ${talent.processing_fee_payer}`);

const clientEmail = prior.QA_CLIENT_EMAIL || `qa-paid-${new Date().toISOString().slice(0, 10)}@impronta.test`;
log(`client ${clientEmail}`);
log(`stripe MX test connected account: ${prior.QA_MX_ACCOUNT_ID ? "reuse " + prior.QA_MX_ACCOUNT_ID : "create"}`);

if (!APPLY) {
  log("dry run only. Re-run with --apply to write (isolated DB + Stripe TEST).");
  process.exit(0);
}

// 1. credentials ------------------------------------------------------------
const env = { ...prior };
assertIsolated();
env.QA_TALENT_EMAIL = talentEmail;
env.QA_TALENT_PASSWORD = prior.QA_TALENT_PASSWORD || gen();
{
  const { error } = await admin.auth.admin.updateUserById(talent.user_id, { password: env.QA_TALENT_PASSWORD, email_confirm: true });
  if (error) throw new Error("talent password set failed: " + error.message);
}
env.QA_CLIENT_EMAIL = clientEmail;
env.QA_CLIENT_PASSWORD = prior.QA_CLIENT_PASSWORD || gen();
{
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list.data?.users?.find((u) => u.email === clientEmail);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password: env.QA_CLIENT_PASSWORD, email_confirm: true });
    if (error) throw new Error("client password set failed: " + error.message);
    env.QA_CLIENT_USER_ID = existing.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: clientEmail, password: env.QA_CLIENT_PASSWORD, email_confirm: true });
    if (error) throw new Error("client create failed: " + error.message);
    env.QA_CLIENT_USER_ID = data.user.id;
  }
}

const persist = () => {
  writeFileSync(OUT, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
  chmodSync(OUT, 0o600);
};
persist();

// 2. Stripe MX TEST connected account --------------------------------------
if (!env.QA_MX_ACCOUNT_ID) {
  const now = Math.floor(Date.now() / 1000);
  const acct = await stripe.accounts.create({
    type: "custom",
    country: "MX",
    email: talentEmail,
    business_type: "individual",
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_profile: { mcc: "7230", product_description: "QA paid test services" },
    individual: {
      first_name: "Qa",
      last_name: "Talent",
      email: talentEmail,
      phone: "+525512345678",
      dob: { day: 1, month: 1, year: 1990 },
      address: { line1: "Av Reforma 100", city: "Ciudad de Mexico", state: "CDMX", postal_code: "06600", country: "MX" },
      id_number: "ABCD900101HDFRRL09", // Stripe MX test CURP-style value; adjust per Stripe's error if rejected
      rfc: undefined,
    },
    external_account: { object: "bank_account", country: "MX", currency: "mxn", account_number: "000000001234567897" },
    tos_acceptance: { date: now, ip: "127.0.0.1" },
    metadata: { purpose: "paid-qa-tul-8", project: QA_JOURNEYS_PROJECT_REF },
  });
  env.QA_MX_ACCOUNT_ID = acct.id;
  persist();
  log(`created Stripe MX test account ${acct.id}`);
}
const acct = await stripe.accounts.retrieve(env.QA_MX_ACCOUNT_ID);
log(`account charges_enabled=${acct.charges_enabled} payouts_enabled=${acct.payouts_enabled} details_submitted=${acct.details_submitted}`);
if (acct.requirements?.currently_due?.length) log("currently_due:", acct.requirements.currently_due.join(", "));

// 3. isolated DB wiring ------------------------------------------------------
assertIsolated();
{
  const { error } = await admin
    .from("talent_profiles")
    .update({
      stripe_account_id: env.QA_MX_ACCOUNT_ID,
      stripe_account_platform: "mx",
      stripe_account_status: acct.charges_enabled ? "enabled" : "pending",
      stripe_charges_enabled: acct.charges_enabled === true,
      stripe_payouts_enabled: acct.payouts_enabled === true,
      stripe_details_submitted: acct.details_submitted === true,
      default_currency: "MXN",
      processing_fee_payer: "seller",
    })
    .eq("id", talent.id);
  if (error) throw new Error("talent update failed: " + error.message);
}
{
  const { data: ex } = await admin
    .from("payout_accounts")
    .select("id")
    .eq("tenant_id", TENANT_ID)
    .eq("owner_type", "talent")
    .eq("owner_id", talent.id)
    .in("status", ["pending_verification", "connected"])
    .maybeSingle();
  if (!ex) {
    const { error } = await admin.from("payout_accounts").insert({
      tenant_id: TENANT_ID,
      owner_type: "talent",
      owner_id: talent.id,
      display_name: talent.display_name || "QA paid talent",
      provider: "stripe",
      provider_account_id: env.QA_MX_ACCOUNT_ID,
      status: "connected",
      connected_at: new Date().toISOString(),
    });
    if (error) throw new Error("payout_accounts insert failed: " + error.message);
  }
}

// 4. write the secrets file (600, git-ignored); print names only -------------
writeFileSync(OUT, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
chmodSync(OUT, 0o600);
log(`wrote ${Object.keys(env).length} values to ${OUT} (names: ${Object.keys(env).join(", ")})`);
log("done.");
