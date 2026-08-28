"use client";

/**
 * RerunButton — re-runs the Stripe health checks.
 *
 * `loadStripeHealth` is request-cached, so a fresh render is a fresh set of
 * live pings; `router.refresh()` re-renders the server tab in place, keeping
 * the header, the tab strip and the scroll position. The pending state matters
 * here: the checks take seconds (8s Stripe timeouts), and a button that looked
 * inert for that long would just get clicked again.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { HQ, F } from "../_tokens";

export function RerunButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      style={{
        background: "transparent",
        border: `1px solid ${HQ.borderHover}`,
        borderRadius: 8,
        color: pending ? HQ.inkDim : HQ.inkMuted,
        padding: "6px 12px",
        fontFamily: F,
        fontSize: 12,
        cursor: pending ? "progress" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
