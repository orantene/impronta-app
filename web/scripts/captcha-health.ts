/**
 * captcha-health.ts — is the tenant's captcha actually able to accept a visitor?
 *
 * Run:
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx scripts/captcha-health.ts
 *
 * NEEDS `AI_CREDENTIALS_ENCRYPTION_KEY` in the environment. Without it the
 * secret cannot be decrypted and this script reports FAIL for a reason that has
 * nothing to do with production — I nearly filed that false alarm myself. If
 * the key is absent, the script says so instead of pretending to know.
 *
 * WHY IT EXISTS. The submit route fails CLOSED: an active provider whose secret
 * will not resolve rejects every submission with the same "Captcha failed" a
 * visitor sees for a bad token. From the outside the two are indistinguishable,
 * so a misconfigured secret looks exactly like normal captcha friction while
 * every real enquiry is quietly lost.
 *
 * We cannot solve a captcha, and must not. But hCaptcha's siteverify answers a
 * different question for free: send ANY token with the configured secret and
 * the error code tells you which half is wrong.
 *
 *   invalid-input-secret   -> the SECRET is wrong. Every real enquiry is being
 *                            rejected right now and the visitor sees only
 *                            "Captcha failed".
 *   invalid-input-response -> the secret is FINE; only our dummy token is bad,
 *                            which is exactly what a real solved token fixes.
 */
import { resolveTenantCaptcha } from "@/lib/integrations/resolve";

const TENANT = "00000000-0000-0000-0000-000000000001";

async function main() {
  const { loadEnvLocal } = await import("./load-env-local.mjs");
  loadEnvLocal();

  if (!process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim()) {
    console.log("SKIPPED — AI_CREDENTIALS_ENCRYPTION_KEY is not set in this environment.");
    console.log("         Secrets cannot be decrypted here, so a FAIL would say nothing");
    console.log("         about production. Run this where the key is present.");
    return;
  }

  const cfg = await resolveTenantCaptcha(TENANT);
  console.log("provider:", cfg.provider, "| tenantOwned:", cfg.tenantOwned, "| siteKey:", cfg.siteKey?.slice(0, 12) + "...");
  if (cfg.provider === "none") {
    console.log("Captcha is NOT enforced for this tenant — the form accepts submissions without one.");
    return;
  }
  const secret = await cfg.getSecret();
  if (!secret) {
    console.log("RESULT: FAIL — no resolvable secret. The route fails closed, so EVERY submission is rejected.");
    process.exit(1);
  }
  const endpoint = cfg.provider === "hcaptcha"
    ? "https://api.hcaptcha.com/siteverify"
    : "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: "probe-not-a-real-token" }),
  });
  const j = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
  const codes = j["error-codes"] ?? [];
  console.log("siteverify error-codes:", codes.join(", ") || "(none)");
  if (codes.includes("invalid-input-secret") || codes.includes("bad-request")) {
    console.log("RESULT: FAIL — the configured SECRET is rejected by the provider.");
    console.log("        Every real enquiry is being refused with 'Captcha failed'.");
    process.exit(1);
  }
  console.log("RESULT: PASS — the secret is accepted; only the dummy token was refused.");
  console.log("        A visitor who solves the widget will verify successfully.");
}

main().catch((e) => { console.error(e); process.exit(1); });
