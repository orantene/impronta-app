/**
 * lib/stripe/key-mode.ts
 *
 * Pure helpers that detect Stripe test/live key mixes (TUL-143). Never
 * returns or logs key values: only env var names and modes.
 */

export type StripeKeyMode = "test" | "live";

export function stripeKeyMode(key: string | null | undefined): StripeKeyMode | null {
  if (!key) return null;
  const m = /^(?:sk|pk|rk)_(test|live)_/.exec(key.trim());
  return m ? (m[1] as StripeKeyMode) : null;
}

const KEY_VARS = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_MX_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY",
] as const;

export interface StripeKeyModeCheck {
  ok: boolean;
  /** The shared mode when consistent; null when none set or mixed. */
  mode: StripeKeyMode | null;
  mismatches: { name: string; mode: StripeKeyMode }[];
}

export function checkStripeKeyModes(
  env: Record<string, string | undefined> = process.env,
): StripeKeyModeCheck {
  const seen: { name: string; mode: StripeKeyMode }[] = [];
  for (const name of KEY_VARS) {
    const mode = stripeKeyMode(env[name]);
    if (mode) seen.push({ name, mode });
  }
  const modes = new Set(seen.map((s) => s.mode));
  if (modes.size <= 1) return { ok: true, mode: seen[0]?.mode ?? null, mismatches: [] };
  return { ok: false, mode: null, mismatches: seen };
}

/**
 * True when a webhook event's livemode disagrees with the mode of the secret
 * key for its lane. Unknown key mode (unset/odd prefix) never mismatches.
 */
export function eventModeMismatch(
  eventLivemode: boolean | null | undefined,
  secretKey: string | null | undefined,
): boolean {
  const mode = stripeKeyMode(secretKey);
  if (!mode || typeof eventLivemode !== "boolean") return false;
  return (mode === "live") !== eventLivemode;
}
