"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/use-t";
import {
  subscribePushAction,
  unsubscribePushAction,
} from "@/lib/support/push-actions";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = "idle" | "on" | "denied" | "unsupported" | "missing" | "busy";

export function PushSubscribeControl({ tone = "light" }: { tone?: "light" | "hq" }) {
  const t = useT();
  const [status, setStatus] = useState<Status>("idle");
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!vapid || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus(!vapid ? "missing" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    void navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) setStatus("on");
    });
  }, [vapid]);

  const hq = tone === "hq";
  const idleColor = hq ? "#F5F2EB" : "#0B0B0D";
  const border = hq ? "rgba(255,255,255,0.12)" : "rgba(24,24,27,0.10)";

  const enable = async () => {
    if (status === "busy" || status === "on" || !vapid) return;
    setStatus("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "idle");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
      const json = sub.toJSON();
      const r = await subscribePushAction({
        endpoint: json.endpoint ?? sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
      setStatus(r.ok ? "on" : "idle");
    } catch {
      setStatus("idle");
    }
  };

  const disable = async () => {
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
    } finally {
      setStatus("idle");
    }
  };

  const label =
    status === "on"
      ? t("dashboard.platform.support.pushCardEnabled")
      : status === "denied"
        ? t("dashboard.platform.support.pushCardDenied")
        : status === "unsupported"
          ? t("dashboard.platform.support.pushCardUnsupported")
          : status === "missing"
            ? t("dashboard.platform.support.pushCardSoon")
            : t("dashboard.platform.support.pushCardEnable");

  const blocked = status === "denied" || status === "unsupported" || status === "missing";
  const disabled = blocked || status === "busy";

  return (
    <button
      type="button"
      onClick={() => (status === "on" ? void disable() : void enable())}
      disabled={disabled}
      style={{
        border: `1px solid ${border}`,
        background: status === "on" ? "transparent" : hq ? "#F5F2EB" : "#4D4855",
        color: status === "on" ? idleColor : hq ? "#0F0F11" : "#fff",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        opacity: blocked ? 0.7 : 1,
      }}
    >
      {status === "busy" ? "…" : label}
    </button>
  );
}
