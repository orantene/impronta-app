#!/usr/bin/env node
/**
 * Switch the local web/.env.local Stripe keys between the SANDBOX and LIVE
 * Stripe accounts — so we can run the app/tests against either, one at a time
 * (only one key set is ever active, so a live key never sits loaded by accident).
 *
 * Sources: web/.env.stripe.sandbox and web/.env.stripe.live (gitignored; you
 * maintain the live one — NEVER commit it, NEVER paste keys in chat).
 * Each source file holds 3 lines:
 *   STRIPE_SECRET_KEY=…
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=…
 *   STRIPE_WEBHOOK_SECRET=…
 *
 * Usage:
 *   node scripts/stripe-target.mjs status     # show the active account (masked)
 *   node scripts/stripe-target.mjs sandbox    # load the sandbox keys
 *   node scripts/stripe-target.mjs live       # load the live keys
 *
 * Switching ALWAYS clears STRIPE_ALLOW_LIVE_PAYOUTS (money-safe by default): even
 * on live, real-money OutboundPayments stay blocked until you explicitly set
 * STRIPE_ALLOW_LIVE_PAYOUTS=true (see lib/payments/global-payouts.ts).
 */
import fs from "node:fs";
import path from "node:path";

const KEYS = ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"];
const webDir = process.cwd();
const envLocal = path.join(webDir, ".env.local");

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
function mask(v) {
  if (!v) return "(unset)";
  const m = v.match(/^((?:sk|pk|whsec)_(?:test|live)_?[A-Za-z0-9]{0,10})/);
  return m ? `${m[1]}…` : "(set)";
}
function modeOf(secret) {
  if (!secret) return "none";
  if (secret.startsWith("sk_live_")) return "LIVE";
  if (secret.startsWith("sk_test_")) return "sandbox/test";
  return "unknown";
}

const cmd = process.argv[2] || "status";

if (cmd === "status") {
  const env = readEnvFile(envLocal);
  console.log(`Active Stripe target: ${modeOf(env.STRIPE_SECRET_KEY)}`);
  for (const k of KEYS) console.log(`  ${k} = ${mask(env[k])}`);
  const allow = env.STRIPE_ALLOW_LIVE_PAYOUTS === "true";
  console.log(`  STRIPE_ALLOW_LIVE_PAYOUTS = ${allow ? "true  ⚠️ REAL MONEY ENABLED" : "(unset) — money-safe"}`);
  process.exit(0);
}

if (cmd !== "sandbox" && cmd !== "live") {
  console.error("usage: node scripts/stripe-target.mjs [status|sandbox|live]");
  process.exit(1);
}

const src = path.join(webDir, `.env.stripe.${cmd}`);
if (!fs.existsSync(src)) {
  console.error(
    `Missing ${path.basename(src)}. Create it (gitignored) with your ${cmd} keys:\n` +
      KEYS.map((k) => `  ${k}=…`).join("\n") +
      `\nNever commit it; never paste keys in chat.`,
  );
  process.exit(1);
}
const srcEnv = readEnvFile(src);
const missing = KEYS.filter((k) => !srcEnv[k]);
if (missing.length) {
  console.error(`${path.basename(src)} is missing: ${missing.join(", ")}`);
  process.exit(1);
}

let lines = fs.existsSync(envLocal) ? fs.readFileSync(envLocal, "utf8").split("\n") : [];
const setLine = (name, val) => {
  const idx = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (idx >= 0) lines[idx] = `${name}=${val}`;
  else lines.push(`${name}=${val}`);
};
for (const k of KEYS) setLine(k, srcEnv[k]);
// Always clear the live-payout allow flag on switch → money-safe by default.
lines = lines.filter((l) => !l.startsWith("STRIPE_ALLOW_LIVE_PAYOUTS="));
fs.writeFileSync(envLocal, lines.join("\n"));

console.log(`Switched .env.local → ${cmd} (${modeOf(srcEnv.STRIPE_SECRET_KEY)}). STRIPE_ALLOW_LIVE_PAYOUTS cleared.`);
if (cmd === "live") {
  console.log("⚠️  LIVE account active. Real-money OutboundPayments stay BLOCKED until you set STRIPE_ALLOW_LIVE_PAYOUTS=true.");
}
