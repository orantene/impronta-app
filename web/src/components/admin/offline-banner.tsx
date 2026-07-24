"use client";

// ─── OfflineBanner ───────────────────────────────────────────────────
//
// Tells the user we genuinely cannot reach the server — and nothing weaker
// than that.
//
// Lives OUTSIDE components/admin/shell on purpose: it is not shell chrome but
// a cross-cutting connectivity primitive that the shell happens to mount, and
// keeping it out of that tree also keeps it clear of the shell's frozen
// inline-style ratchet (which owns grandfathered token debt, not new work).
// `primitives/overlays.tsx` re-exports it so the existing barrel is unchanged.
//
// History: this used to render purely off `navigator.onLine` + the window
// `offline` event, pinned to `top: 0` with `z-index: 9999`. Two bugs came out
// of that combination on real machines:
//
//   1. `navigator.onLine === false` does NOT mean "no internet". A VPN, a
//      virtual network adapter (Tailscale / Parallels / Docker), a captive
//      portal, or DevTools' Offline throttle all flip it on a machine that
//      loads every other site fine. So we showed a scary red banner while the
//      workspace was, in fact, happily talking to the server. Because the
//      banner is mounted only by the workspace shell, this read to users as
//      "the workspace loses connection" when nothing was wrong with it — the
//      workspace was simply the one surface that reported the browser flag.
//   2. The only way out was Chrome firing a matching `online` event. When the
//      flag was already false at mount and no transition ever came, the banner
//      latched FOREVER — and "Retry now" was a dead button (it flipped its own
//      label for 1.5s and did nothing else), so the user could not clear it.
//      Pinned to the top, it sat over the workspace header and hid the account
//      menu, search, and quick-create for the rest of the session.
//
// The rule now: the browser flag is a *hint that triggers a probe*, never the
// thing we render. We only show the banner once a real request to our own
// origin has failed, we re-probe on a timer so it self-heals without a click,
// "Retry now" actually re-probes, and it lives at the BOTTOM so it can never
// occlude the header. See `/api/health`.

import { useCallback, useEffect, useRef, useState } from "react";
import { useDashboardText } from "./shell/internal/dashboard-i18n";
import { COLORS, FONTS, RADIUS } from "./shell/internal/state";

/** Cheapest same-origin route in the app. `/api/*` is never SW-cached. */
const HEALTH_PROBE_PATH = "/api/health";
/** Abort a hanging probe rather than leaving the banner in limbo. */
const PROBE_TIMEOUT_MS = 6000;
/** Self-heal cadence while the banner is up, so no click is required. */
const PROBE_INTERVAL_MS = 15000;

/**
 * True when our origin answered. Any failure — network error, abort, non-2xx —
 * counts as unreachable. `cache: "no-store"` plus a cache-busting param so a
 * proxy or bfcache can't hand back a stale 200 and mask a real outage.
 */
async function probeServerReachable(): Promise<boolean> {
  if (typeof fetch === "undefined") return true;
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${HEALTH_PROBE_PATH}?_=${String(Date.now())}`, {
      method: "HEAD",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function OfflineBanner() {
  const copy = useDashboardText();
  // Always start `false` so the server-rendered HTML and the client's first
  // paint agree. We sync real connectivity in the effect below — this mounts
  // BEFORE hydration commits, and reading navigator at construction time
  // produced SSR/CSR mismatches whenever the browser was momentarily offline.
  const [offline, setOffline] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // User closed it. Cleared on the next recovery so a later, genuine outage
  // still gets to speak up.
  const [dismissed, setDismissed] = useState(false);

  // Guards against setState after unmount and against overlapping probes
  // (the interval, the `offline` event, and a Retry click can all fire close
  // together; without this the last one to resolve wins, which may be stale).
  const aliveRef = useRef(true);
  const probingRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const runProbe = useCallback(async () => {
    if (probingRef.current) return;
    probingRef.current = true;
    try {
      const reachable = await probeServerReachable();
      if (!aliveRef.current) return;
      setOffline(!reachable);
      // Recovered: let a future outage re-open even if this one was dismissed.
      if (reachable) setDismissed(false);
    } finally {
      probingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Mount: only probe when the browser claims to be offline. On a healthy
    // load we spend zero requests — the flag is a cheap pre-filter, it just
    // isn't trustworthy enough to render on its own.
    if (typeof navigator !== "undefined" && !navigator.onLine) void runProbe();

    // `offline` is a hint, not a verdict — verify before showing anything.
    const onOffline = () => { void runProbe(); };
    // `online` is trustworthy in the good direction: the OS regained a route.
    // Hide immediately for responsiveness, then confirm the server is really
    // back (the route may be up while our origin is still unreachable).
    const onOnline = () => { setOffline(false); setDismissed(false); void runProbe(); };
    // Returning to a backgrounded tab is the other moment stale state shows.
    const onVisible = () => { if (document.visibilityState === "visible") void runProbe(); };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [runProbe]);

  // Self-heal: while the banner is up, keep re-probing. This is what makes a
  // stuck `navigator.onLine === false` machine recover on its own.
  useEffect(() => {
    if (!offline) return;
    const id = window.setInterval(() => { void runProbe(); }, PROBE_INTERVAL_MS);
    return () => { window.clearInterval(id); };
  }, [offline, runProbe]);

  const onRetry = useCallback(() => {
    setRetrying(true);
    void runProbe().finally(() => { if (aliveRef.current) setRetrying(false); });
  }, [runProbe]);

  if (!offline || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-tulala-offline-banner
      style={{
        position: "fixed",
        // BOTTOM, not top: the workspace header (control bar + identity bar +
        // topbar) owns the top of the viewport. A fixed top banner covered the
        // account menu, search, and quick-create. Left-anchored so it also
        // clears the bottom-RIGHT toast stack.
        bottom: 20,
        left: 20,
        background: COLORS.fill,
        color: "#fff",
        fontFamily: FONTS.body,
        fontSize: 13,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px 9px 14px",
        borderRadius: RADIUS.md,
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        maxWidth: "calc(100vw - 40px)",
        // Above drawers/modals (a failed save inside one is exactly when this
        // matters) but below toasts, which confirm the action that just ran.
        zIndex: 350,
        animation: "tulala-page-fade .2s ease",
      }}
    >
      <style>{`
        /* Clear the mobile bottom nav (64px + safe area) so the banner never
           sits on top of the primary navigation on a phone. */
        @media (max-width: 720px) {
          [data-tulala-offline-banner] {
            left: 12px !important;
            right: 12px !important;
            bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important;
            max-width: none !important;
          }
        }
      `}</style>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: "#f87171", flexShrink: 0 }} />
      <span>{copy.t("Connection lost · retrying…")}</span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        style={{
          marginLeft: 4,
          background: "rgba(255,255,255,0.14)",
          border: "none",
          borderRadius: 6,
          color: "#fff",
          fontFamily: FONTS.body,
          fontSize: 12,
          fontWeight: 600,
          padding: "3px 10px",
          cursor: retrying ? "default" : "pointer",
          opacity: retrying ? 0.7 : 1,
          flexShrink: 0,
        }}
      >
        {retrying ? copy.t("Retrying…") : copy.t("Retry now")}
      </button>
      <button
        type="button"
        onClick={() => { setDismissed(true); }}
        aria-label={copy.t("Dismiss")}
        style={{
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.72)",
          fontFamily: FONTS.body,
          fontSize: 15,
          lineHeight: 1,
          padding: "3px 4px",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
