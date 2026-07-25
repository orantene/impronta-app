"use client";

// Phase D §3 — client Pro upgrade button. Starts a Stripe Checkout
// (subscription mode) via the checkout route and redirects to the returned URL.
// When checkout isn't configured (no price id), surfaces a clear inline message
// instead of failing silently. The server-side 402 gate is the real enforcement;
// this is the upgrade entry point.

import { useState } from "react";
import { useT } from "@/i18n/use-t";

export function ProUpgradeButton({
  tenantSlug,
  label,
  background,
  color,
  border,
}: {
  tenantSlug: string;
  label: string;
  background: string;
  color: string;
  border: string;
}) {
  const t = useT();
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    setState("pending");
    setMessage(null);
    try {
      const res = await fetch("/api/discover/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string };
      if (res.ok && typeof json.url === "string") {
        window.location.href = json.url;
        return;
      }
      setState("error");
      setMessage(
        json.error === "not_configured"
          ? t("client.subscription.checkoutNotConfigured")
          : t("client.subscription.checkoutFailed"),
      );
    } catch {
      setState("error");
      setMessage(t("client.subscription.checkoutNetworkError"));
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => { void start(); }}
        disabled={state === "pending"}
        style={{
          display: "block", width: "100%", padding: "10px 0", textAlign: "center",
          background, color, border,
          borderRadius: 8, fontSize: 12.5, fontWeight: 600,
          cursor: state === "pending" ? "wait" : "pointer",
        }}
      >
        {state === "pending" ? t("client.subscription.startingCheckout") : label}
      </button>
      {message && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#8A6F1A", lineHeight: 1.4 }}>
          {message}
        </div>
      )}
    </div>
  );
}
