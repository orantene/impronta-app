"use client";

/**
 * SentAirlock — the brief in-panel transition that makes a SUCCESSFUL send FELT
 * (Jon Inquiry 360, Phase 1: the DRAFT -> SENT boundary). It plays only on a real
 * send-success signal (never on a failed send), as a non-blocking overlay over the
 * thread column:
 *
 *   • A centered beat reads "Sent to {agency}." (the moment of crossing over),
 *   • then resolves to "{agency} has your inquiry." (the receipt) after ~1.2s.
 *
 * AGENCY-LEVEL wording only. The named coordinator + the full receipt card are
 * Phase 2; this beat deliberately does NOT name a coordinator.
 *
 * Reduced-motion-safe: under prefers-reduced-motion we skip the animation and the
 * timed "Sent to..." beat, mounting straight to the resolved receipt line with no
 * fade. Otherwise a short fade carries the two lines.
 *
 * House rules: tenant accent only (the check uses the accent; no hardcoded gold),
 * no em dashes, inline styles only. Copy is localized via the injected `t`.
 */

import { useEffect, useState } from "react";

import { Check } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { C, FONT, readableOn } from "./mini-chat-styles";

export type SentAirlockProps = {
  /** Agency display name (interpolated into both beats). */
  agencyName: string;
  /** Tenant accent color (CSS string) for the check badge. */
  accent: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
};

const SENDING_BEAT_MS = 1200;

/** Detect the reduced-motion preference once at mount (SSR-safe). */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function SentAirlock({ agencyName, accent, t }: SentAirlockProps) {
  // Start already-resolved under reduced motion (skip the timed "Sent to..." beat
  // and the fade); otherwise begin on the "sending" beat and advance after ~1.2s.
  const [reduced] = useState(prefersReducedMotion);
  const [resolved, setResolved] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => setResolved(true), SENDING_BEAT_MS);
    return () => clearTimeout(timer);
  }, [reduced]);

  const accentInk = readableOn(accent);
  const line = resolved
    ? interpolate(t("public.guestChat.sentAirlockResolved"), { agency: agencyName })
    : interpolate(t("public.guestChat.sentAirlockSending"), { agency: agencyName });

  return (
    <div
      // Non-blocking: it sits over the thread but never traps focus or input.
      aria-hidden={false}
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "20px 24px",
        textAlign: "center",
        background: C.surface,
        fontFamily: FONT,
        pointerEvents: "none",
      }}
    >
      {!reduced && (
        <style
          dangerouslySetInnerHTML={{
            __html:
              "@keyframes uic-airlock-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}" +
              ".uic-airlock-fade{animation:uic-airlock-in 260ms ease-out}",
          }}
        />
      )}
      <span
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: accent,
          color: accentInk,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Check size={20} strokeWidth={2.6} />
      </span>
      <span
        // The key change re-triggers the fade between the two beats (skipped under
        // reduced motion, where the class is absent).
        key={resolved ? "resolved" : "sending"}
        className={reduced ? undefined : "uic-airlock-fade"}
        style={{
          fontSize: 14.5,
          fontWeight: 700,
          color: C.ink,
          lineHeight: 1.4,
          maxWidth: 260,
        }}
      >
        {line}
      </span>
    </div>
  );
}
