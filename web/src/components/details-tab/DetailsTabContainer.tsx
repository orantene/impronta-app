"use client";

/**
 * DetailsTabContainer — client-side data wrapper around the canonical
 * <DetailsTab> component.
 *
 * Loads DetailsTabData from `loadDetailsTabData` on mount + when
 * inquiryId/pov change. Renders a structured skeleton while pending
 * (max LOAD_TIMEOUT_MS before auto-erroring so it never hangs
 * indefinitely), a clear error state on failure, and the full
 * DetailsTab on success.
 *
 * Used by the admin / talent / client message shells to render the
 * "Details" tab. v3 plan §10.
 *
 * Root-cause note (P1 — M3): `loadDetailsTabData` performs 5-7 serial
 * or fan-out Supabase queries (inquiry → booking → participants →
 * coord profiles → audit rows → actor profiles → cross-tenant RPC).
 * Any slow/hung query silently blocks the whole promise — no per-query
 * timeout was in place. This component now wraps the fetch in a
 * race against a 10-second deadline so "Loading details…" can never
 * persist indefinitely.
 */

import { useEffect, useState } from "react";
import { DetailsTab, type DetailsTabData, type DetailsTabPov } from "./DetailsTab";
import { loadDetailsTabData } from "@/lib/server-actions/details-tab-data";

// Hard upper bound before we give up and show an error state.
const LOAD_TIMEOUT_MS = 10_000;

const FONT = '"Inter", system-ui, sans-serif';

/* ─── Shimmer skeleton ───────────────────────────────────────────────── */

function SkeletonBlock({ h, w = "100%", mb = 0 }: { h: number; w?: string | number; mb?: number }) {
  return (
    <div style={{
      height: h,
      width: w,
      borderRadius: 6,
      background: "rgba(11,11,13,0.07)",
      marginBottom: mb,
      animation: "dt-shimmer 1.4s ease-in-out infinite",
      flexShrink: 0,
    }} />
  );
}

function DetailsTabSkeleton() {
  return (
    <div style={{ padding: "16px 12px", background: "#F7F8F8", minHeight: "100%", fontFamily: FONT }}>
      <style>{`
        @keyframes dt-shimmer {
          0%   { opacity: 1; }
          50%  { opacity: 0.45; }
          100% { opacity: 1; }
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Status card */}
        <div style={{ background: "#fff", border: "1px solid rgba(24,24,27,0.08)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonBlock h={10} w={60} />
          <SkeletonBlock h={22} w={100} />
          <SkeletonBlock h={13} w="70%" />
        </div>
        {/* Job brief card */}
        <div style={{ background: "#fff", border: "1px solid rgba(24,24,27,0.08)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonBlock h={10} w={70} />
          <SkeletonBlock h={18} w="80%" />
          <SkeletonBlock h={13} w="90%" />
          <SkeletonBlock h={13} w="75%" />
          <div style={{ height: 1, background: "rgba(24,24,27,0.08)" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
            <SkeletonBlock h={13} />
            <SkeletonBlock h={13} />
          </div>
        </div>
        {/* Schedule card */}
        <div style={{ background: "#fff", border: "1px solid rgba(24,24,27,0.08)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonBlock h={10} w={65} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
            <SkeletonBlock h={13} />
            <SkeletonBlock h={13} />
          </div>
          <SkeletonBlock h={13} w="60%" />
        </div>
      </div>
    </div>
  );
}

/* ─── Error state ────────────────────────────────────────────────────── */

function DetailsTabError({
  timedOut,
  onRetry,
}: {
  timedOut: boolean;
  onRetry: () => void;
}) {
  return (
    <div style={{
      padding: "28px 24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 12,
      textAlign: "center",
      fontFamily: FONT,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: "rgba(163,58,58,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="7.5" stroke="#A33A3A" strokeWidth="1.4"/>
          <path d="M9 5.5v4.5" stroke="#A33A3A" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="9" cy="12.5" r="0.75" fill="#A33A3A"/>
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0B0B0D" }}>
        {timedOut ? "Details timed out" : "Could not load details"}
      </div>
      <div style={{ fontSize: 12.5, color: "rgba(11,11,13,0.55)", lineHeight: 1.5, maxWidth: 280 }}>
        {timedOut
          ? "The request took too long. This can happen when the database is under load."
          : "There was a problem fetching the details for this inquiry. It may resolve on retry."}
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 4,
          padding: "7px 16px",
          borderRadius: 8,
          border: "1px solid rgba(24,24,27,0.12)",
          background: "#fff",
          fontSize: 13,
          fontWeight: 600,
          color: "#0B0B0D",
          cursor: "pointer",
          fontFamily: FONT,
        }}
      >
        Try again
      </button>
    </div>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────── */

function DetailsTabEmpty() {
  return (
    <div style={{
      padding: "28px 24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      textAlign: "center",
      fontFamily: FONT,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: "rgba(11,11,13,0.05)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <rect x="2.5" y="3.5" width="13" height="11" rx="2" stroke="rgba(11,11,13,0.4)" strokeWidth="1.3"/>
          <path d="M6 8h6M6 11h4" stroke="rgba(11,11,13,0.35)" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0B0B0D" }}>
        No details yet
      </div>
      <div style={{ fontSize: 12.5, color: "rgba(11,11,13,0.55)", lineHeight: 1.5, maxWidth: 260 }}>
        Details will appear here once the inquiry has more information filled in.
      </div>
    </div>
  );
}

/* ─── Main container ─────────────────────────────────────────────────── */

export function DetailsTabContainer({
  inquiryId,
  pov,
}: {
  inquiryId: string;
  pov: DetailsTabPov;
}) {
  const [data, setData] = useState<DetailsTabData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error" | "timeout" | "empty">("loading");
  // Increment to trigger a retry without changing inquiryId/pov.
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setData(null);

    // Race the server action against a hard timeout so we never hang
    // indefinitely on "Loading details…". Root cause: loadDetailsTabData
    // performs 5-7 Supabase queries (including two RPC calls for cross-
    // tenant context) that can individually stall on cold DB connections
    // or slow audit-log scans.
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        setStatus("timeout");
      }
    }, LOAD_TIMEOUT_MS);

    loadDetailsTabData(inquiryId, pov)
      .then((d) => {
        if (cancelled) return;
        clearTimeout(timeoutId);
        if (!d) {
          // null means the inquiry is missing or inaccessible (RLS).
          // Treat as empty rather than error — it's not a system fault.
          setStatus("empty");
        } else {
          setData(d);
          setStatus("ok");
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearTimeout(timeoutId);
        setStatus("error");
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // retryCount included so the retry button can force a re-fetch.
  }, [inquiryId, pov, retryCount]);

  if (status === "loading") {
    return <DetailsTabSkeleton />;
  }
  if (status === "error" || status === "timeout") {
    return (
      <DetailsTabError
        timedOut={status === "timeout"}
        onRetry={() => setRetryCount((c) => c + 1)}
      />
    );
  }
  if (status === "empty" || !data) {
    return <DetailsTabEmpty />;
  }
  return <DetailsTab pov={pov} data={data} />;
}
