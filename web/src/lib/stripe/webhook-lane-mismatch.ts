/**
 * Diagnostic for a Stripe webhook endpoint pointed at the wrong lane's URL
 * (US endpoint on the MX route, or the reverse). Runs ONLY after signature
 * verification failed for the route's own secrets: if the OTHER lane's secrets
 * verify the payload, we log a clear message and the caller still answers 400.
 * The event is never processed or claimed here. Secrets are never logged.
 */
import type Stripe from "stripe";

export type WebhookLane = "us" | "mx";

export type VerifyFn = (body: string, signature: string, secret: string) => Promise<Stripe.Event>;

export function otherLaneSecrets(
  lane: WebhookLane,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const keys =
    lane === "mx"
      ? ["STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET_CONNECT"]
      : ["STRIPE_MX_WEBHOOK_SECRET", "STRIPE_MX_WEBHOOK_SECRET_CONNECT"];
  return keys.map((k) => env[k]).filter((s): s is string => !!s && s.trim().length > 0);
}

/** Returns true (and logs) when the other lane's secrets verify the payload. */
export async function reportLaneMismatch(args: {
  expectedLane: WebhookLane;
  body: string;
  signature: string;
  verify: VerifyFn;
  log: (context: string, message: string) => void;
  env?: Record<string, string | undefined>;
}): Promise<boolean> {
  const actualLane: WebhookLane = args.expectedLane === "mx" ? "us" : "mx";
  for (const secret of otherLaneSecrets(args.expectedLane, args.env)) {
    try {
      const ev = await args.verify(args.body, args.signature, secret);
      args.log(
        "stripe-webhook.lane-mismatch",
        `event belongs to the other lane (webhook endpoint points at the wrong URL): ` +
          `event ${ev.id} type=${ev.type} expected_lane=${args.expectedLane} actual_lane=${actualLane}`,
      );
      return true;
    } catch {
      // not this secret; try the next
    }
  }
  return false;
}
