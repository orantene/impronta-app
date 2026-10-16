/**
 * lib/stripe/env-keys.ts
 *
 * THE ONE PLACE that reads Stripe env vars (TUL-703). Every other module asks
 * here; `env-keys.static.test.ts` fails the build on a direct
 * `process.env.STRIPE_*` / `process.env.NEXT_PUBLIC_STRIPE_*` read elsewhere.
 *
 * STRIPE_FORCE_TEST_MODE=1 runs production on the Stripe SANDBOX without
 * touching the live values: every mode-bound name below resolves to its
 * `<NAME>_TEST` sibling instead. Switching back to live is one change (unset
 * the flag and redeploy).
 *
 * FAIL CLOSED. With the flag on, a missing `_TEST` sibling resolves to
 * undefined (callers already treat that as "Stripe not configured" and refuse
 * to charge), and a live-shaped value (sk_live_/pk_live_/rk_live_) parked in a
 * `_TEST` slot is refused too. The live value is NEVER a fallback.
 *
 * Never logs or returns anything but the requested value.
 */
import { stripeKeyMode } from "./key-mode";

export const STRIPE_FORCE_TEST_MODE_VAR = "STRIPE_FORCE_TEST_MODE";

/** Mode-bound names: each has a distinct value in sandbox vs live. */
const MODE_BOUND = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_MX_SECRET_KEY",
  "STRIPE_PORTAL_CONFIGURATION_ID",
  "STRIPE_MX_PORTAL_CONFIGURATION_ID",
  "STRIPE_MX_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY",
  "STRIPE_V2_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET_CONNECT",
  "STRIPE_MX_WEBHOOK_SECRET",
  "STRIPE_MX_WEBHOOK_SECRET_CONNECT",
  "STRIPE_V2_WEBHOOK_SECRET",
  "STRIPE_CLIENT_SUBSCRIPTION_WEBHOOK_SECRET",
  "STRIPE_CLIENT_PRO_PRICE_ID",
  "STRIPE_TERMINAL_READER_ID",
] as const;

const MODE_BOUND_SET: ReadonlySet<string> = new Set(MODE_BOUND);

type Env = Record<string, string | undefined>;

function isModeBound(name: string): boolean {
  return MODE_BOUND_SET.has(name) || name.startsWith("STRIPE_PRICE_");
}

export function isStripeForceTestMode(env: Env = process.env): boolean {
  return env[STRIPE_FORCE_TEST_MODE_VAR] === "1";
}

/**
 * The value to use for a Stripe env name. Flag off: the name itself. Flag on
 * and the name is mode-bound: its `_TEST` sibling or undefined (fail closed).
 */
export function stripeEnv(name: string, env: Env = process.env): string | undefined {
  if (!isStripeForceTestMode(env) || !isModeBound(name)) return env[name];
  const v = env[`${name}_TEST`];
  if (!v || v.trim().length === 0) return undefined;
  if (stripeKeyMode(v) === "live") return undefined;
  return v;
}

/**
 * Live payouts are allowed only when STRIPE_ALLOW_LIVE_PAYOUTS=true AND the
 * forced sandbox is off. In forced test mode the resolved keys are test keys,
 * so this is belt and braces: no live money can move while the flag is on.
 */
export function stripeAllowLivePayouts(env: Env = process.env): boolean {
  if (isStripeForceTestMode(env)) return false;
  return env.STRIPE_ALLOW_LIVE_PAYOUTS === "true";
}

/** A copy of env with every mode-bound Stripe name replaced by its resolved value. */
export function resolvedStripeEnv(env: Env = process.env): Env {
  const out: Env = { ...env };
  if (!isStripeForceTestMode(env)) return out;
  const names = new Set<string>([...MODE_BOUND, ...Object.keys(env).filter((n) => n.startsWith("STRIPE_PRICE_") && !n.endsWith("_TEST"))]);
  for (const n of names) out[n] = stripeEnv(n, env);
  out.STRIPE_ALLOW_LIVE_PAYOUTS = undefined;
  return out;
}

/** The `_TEST` names an operator may set (STRIPE_PRICE_*_TEST as needed). */
export function stripeTestSiblingNames(): string[] {
  return MODE_BOUND.map((n) => `${n}_TEST`);
}
