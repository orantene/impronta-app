"use client";

/**
 * usePresenceChime — U2 inbound-message soft chime.
 *
 * Builds a short WebAudio chime lazily on the first allowed user gesture.
 * No audio asset file — the chime is synthesised entirely via WebAudio
 * OscillatorNode + GainNode (sine→triangle envelope, ~0.18 s).
 *
 * AUTOPLAY POLICY:
 *   Browser autoplay policy requires a user gesture before any AudioContext
 *   can be resumed. `soundEnabled` must be set true by the panel ONLY after
 *   the user has sent ≥1 message (a send is a gesture). When false, all
 *   notifyInbound calls are no-ops.
 *
 * PREFERS-REDUCED-MOTION:
 *   This hook is for SOUND only — motion-related side effects (animations)
 *   are handled by NewMessagePulse. Sound is NOT suppressed for
 *   prefers-reduced-motion (it is a notification, not decoration). Only
 *   the panel's animation toggle consults that media query.
 *
 * HOOK CONTRACT:
 *   export function usePresenceChime(args: { soundEnabled: boolean }):
 *     { notifyInbound: (count: number) => void }
 *
 *   notifyInbound(count) — chimes once per batch. No-op when:
 *     • count <= 0
 *     • soundEnabled === false
 *   Does chime when document.hidden (it's a notification).
 */

import { useCallback, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type UsePresenceChimeArgs = {
  soundEnabled: boolean;
};

type UsePresenceChimeReturn = {
  notifyInbound: (count: number) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// WebAudio chime synthesis
// Tone design: a soft two-note chord (A5 880 Hz + E6 1320 Hz), sine→triangle
// cross-fade, gentle gain envelope. Total duration ~0.18 s.
// ─────────────────────────────────────────────────────────────────────────────

function playChime(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const duration = 0.18;

  // Two partials for a mild "ding" quality.
  const partials: { freq: number; gainPeak: number }[] = [
    { freq: 880, gainPeak: 0.09 },
    { freq: 1320, gainPeak: 0.06 },
  ];

  for (const { freq, gainPeak } of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    // Gentle pitch glide down (~10% over the duration) for warmth.
    osc.frequency.exponentialRampToValueAtTime(freq * 0.9, now + duration);

    gain.gain.setValueAtTime(0, now);
    // Quick attack (10 ms) → sustain → gentle release.
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.setValueAtTime(gainPeak, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.005);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function usePresenceChime(args: UsePresenceChimeArgs): UsePresenceChimeReturn {
  const { soundEnabled } = args;

  // AudioContext is created lazily on the first notifyInbound call that is
  // allowed (soundEnabled true). This satisfies the browser gesture requirement
  // because `soundEnabled` only becomes true after a real user send action.
  const ctxRef = useRef<AudioContext | null>(null);

  // Cleanup: close the AudioContext on unmount to release OS audio resources.
  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        // Ignore the promise — this is a best-effort cleanup on unmount.
        void ctx.close().catch(() => undefined);
      }
    };
  }, []);

  const notifyInbound = useCallback(
    (count: number): void => {
      // Fast path: no sound, no count, or not in a browser environment.
      if (!soundEnabled || count <= 0) return;
      if (typeof window === "undefined" || typeof AudioContext === "undefined") return;

      try {
        // Lazily create the AudioContext. The browser requires this to happen
        // in response to (or after) a user gesture — soundEnabled is only true
        // after the user has sent at least one message, satisfying that.
        if (!ctxRef.current) {
          ctxRef.current = new AudioContext();
        }

        const ctx = ctxRef.current;

        // Resume suspended context (Chrome suspends after inactivity).
        if (ctx.state === "suspended") {
          void ctx.resume().then(() => {
            playChime(ctx);
          });
        } else if (ctx.state === "running") {
          playChime(ctx);
        }
        // If ctx.state === "closed" we silently drop the chime — the context
        // was closed (e.g. by unmount timing), not worth re-creating here.
      } catch {
        // WebAudio errors are non-fatal — the chime is a progressive
        // enhancement. Swallow silently.
      }
    },
    [soundEnabled],
  );

  return { notifyInbound };
}
