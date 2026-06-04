"use client";

/**
 * VoiceNotePlayer — inline audio player for a voice-note message bubble.
 *
 * Given a message's parsed VoiceNoteMeta, it lazily requests a short-lived
 * SIGNED playback URL (the 'inquiry-files' bucket is private) via the
 * server action getVoicePlaybackUrl on first play, caches it in state, and
 * drives a compact play/pause + progress scrubber over a hidden <audio>.
 *
 * The signed URL is fetched on demand (not at mount) so a long thread of
 * voice notes doesn't generate dozens of signed URLs the viewer never plays.
 * Once fetched it's cached for the component's lifetime.
 *
 * Accent-aware: pass `accent` (shell tone) + `onDark` (true when the bubble
 * sits on a dark "mine" background) so the control reads correctly on both
 * sides of the thread.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getVoicePlaybackUrl } from "@/lib/server-actions/voice-notes";
import type { VoiceNoteMeta } from "@/lib/messages/voice-types";

function fmtClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  meta: VoiceNoteMeta;
  /** Active accent for the play button + progress fill. */
  accent?: string;
  /** True when rendered on a dark ("mine") bubble — flips text/track tones. */
  onDark?: boolean;
};

export function VoiceNotePlayer({ meta, accent = "#1D4ED8", onDark = false }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // Elapsed playback position (ms). Falls back to the recorded duration for the
  // total so the scrubber has a length before metadata loads.
  const [posMs, setPosMs] = useState(0);
  const [totalMs, setTotalMs] = useState(meta.durationMs || 0);

  // Resolve a signed URL once, on first interaction.
  const ensureUrl = useCallback(async (): Promise<string | null> => {
    if (url) return url;
    setLoading(true);
    setError(null);
    try {
      const res = await getVoicePlaybackUrl(meta.attachmentId);
      if (!res.ok) {
        setError(res.error || "Could not load audio");
        return null;
      }
      setUrl(res.url);
      return res.url;
    } catch {
      setError("Could not load audio");
      return null;
    } finally {
      setLoading(false);
    }
  }, [url, meta.attachmentId]);

  const togglePlay = useCallback(async () => {
    const el = audioRef.current;
    if (playing) {
      el?.pause();
      return;
    }
    const resolved = url ?? (await ensureUrl());
    if (!resolved) return;
    // Wait a tick for the <audio src> to bind after the first URL set.
    requestAnimationFrame(() => {
      const a = audioRef.current;
      if (!a) return;
      a.play().catch(() => setError("Playback blocked"));
    });
  }, [playing, url, ensureUrl]);

  // Keep audio element listeners in sync.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setPosMs(a.currentTime * 1000);
    const onMeta = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setTotalMs(a.duration * 1000);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setPosMs(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
    };
  }, [url]);

  const seek = useCallback((clientX: number, track: HTMLDivElement) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.duration) || a.duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * a.duration;
    setPosMs(a.currentTime * 1000);
  }, []);

  const pct = totalMs > 0 ? Math.min(100, (posMs / totalMs) * 100) : 0;
  const subtle = onDark ? "rgba(255,255,255,0.65)" : "rgba(11,11,13,0.50)";
  const trackBg = onDark ? "rgba(255,255,255,0.22)" : "rgba(11,11,13,0.12)";
  const fill = onDark ? "rgba(255,255,255,0.92)" : accent;
  const btnBg = onDark ? "rgba(255,255,255,0.18)" : `${accent}1A`;
  const btnColor = onDark ? "#fff" : accent;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 180,
        maxWidth: 280,
        padding: "2px 0",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      {/* Hidden audio element — the custom controls drive it. */}
      {url && <audio ref={audioRef} src={url} preload="metadata" />}

      <button
        type="button"
        onClick={() => void togglePlay()}
        disabled={loading || !!error}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        title={error ?? (playing ? "Pause" : "Play voice note")}
        style={{
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: "50%",
          border: "none",
          background: btnBg,
          color: btnColor,
          cursor: loading ? "wait" : error ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: error ? 0.6 : 1,
        }}
      >
        {loading ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ animation: "voiceSpin 0.8s linear infinite" }}>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ) : playing ? (
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <rect x="2" y="1.5" width="3" height="9" rx="1" />
            <rect x="7" y="1.5" width="3" height="9" rx="1" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <path d="M3 1.8v8.4a.6.6 0 0 0 .92.5l6.6-4.2a.6.6 0 0 0 0-1l-6.6-4.2A.6.6 0 0 0 3 1.8Z" />
          </svg>
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Scrubber */}
        <div
          role="slider"
          aria-label="Seek voice note"
          aria-valuemin={0}
          aria-valuemax={Math.round(totalMs)}
          aria-valuenow={Math.round(posMs)}
          tabIndex={0}
          onClick={(e) => seek(e.clientX, e.currentTarget)}
          style={{
            height: 6,
            borderRadius: 999,
            background: trackBg,
            cursor: url ? "pointer" : "default",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: fill, borderRadius: 999 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 10.5, color: subtle }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flexShrink: 0 }}>
            <rect x="6" y="2" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>{error ? error : `${fmtClock(posMs)} / ${fmtClock(totalMs)}`}</span>
        </div>
      </div>

      <style>{"@keyframes voiceSpin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
