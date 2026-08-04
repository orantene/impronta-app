"use client";

/**
 * VoiceRecorderButton — composer affordance to record + send a voice note.
 *
 * Browser-native only (MediaRecorder + getUserMedia) — NO recorder libs. The
 * lifecycle is a small state machine surfaced as a popover above the button:
 *   idle      → mic button. Click → request permission + start recording.
 *   recording → live elapsed timer + a Stop button.
 *   preview   → playback of the take + Re-record / Cancel / Send.
 *   sending   → busy state while uploadAndSendVoiceNote runs.
 *
 * On send it builds FormData {inquiry_id, thread_type, duration_ms, file} and
 * calls the Agent-1 server action. Everything is best-effort: if getUserMedia
 * or MediaRecorder is missing, or the user denies the mic, the button shows a
 * tooltip and NEVER throws.
 *
 * Accent-aware so each shell (admin/talent ink, client blue) matches.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadAndSendVoiceNote } from "@/lib/server-actions/voice-notes";
import { uploadVoiceNoteSigned } from "@/lib/client/signed-upload";

type Phase = "idle" | "recording" | "preview" | "sending";

type Props = {
  inquiryId: string;
  threadType: "private" | "group";
  /** Active accent for the live/record affordances. */
  accent?: string;
  /** Muted tone for the idle mic glyph (matches the disabled button it replaces). */
  idleColor?: string;
  /** Called after a successful send so the host can refresh the thread. */
  onSent?: () => void;
  /** Surface an error (toast). */
  onError?: (msg: string) => void;
};

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* isTypeSupported can throw on some impls — keep trying */
    }
  }
  return "";
}

function fmtElapsed(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceRecorderButton({
  inquiryId,
  threadType,
  accent = "#0B0B0D",
  idleColor = "rgba(11,11,13,0.45)",
  onSent,
  onError,
}: Props) {
  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    pickMimeType() !== "";

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  // Recorded take duration (ms). State so the preview render can show it
  // without reading a ref during render.
  const [durationMs, setDurationMs] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const mimeRef = useRef<string>("");
  const blobRef = useRef<Blob | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Holds the live object URL so the unmount cleanup can revoke it without
  // depending on render-scope state (keeps the unmount effect deps honest).
  const previewUrlRef = useRef<string | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Tear everything down on unmount. Reads from refs only, so an empty dep
  // array is correct (no stale closure over render-scope state).
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (tickRef.current) clearInterval(tickRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const resetToIdle = useCallback(() => {
    cleanupStream();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    blobRef.current = null;
    chunksRef.current = [];
    durationRef.current = 0;
    setDurationMs(0);
    setElapsedMs(0);
    setPhase("idle");
  }, [cleanupStream]);

  const startRecording = useCallback(async () => {
    if (!supported) {
      onError?.("Voice recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      mimeRef.current = mime;
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const dur = Date.now() - startedAtRef.current;
        durationRef.current = dur;
        setDurationMs(dur);
        const type = mimeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        blobRef.current = blob;
        const objectUrl = URL.createObjectURL(blob);
        // Revoke any prior take's URL before swapping in the new one.
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
        cleanupStream();
        setPhase("preview");
      };
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      rec.start();
      setPhase("recording");
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
    } catch {
      cleanupStream();
      onError?.("Microphone access was blocked.");
      setPhase("idle");
    }
  }, [supported, cleanupStream, onError]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const send = useCallback(async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase("sending");
    try {
      const durationMs = Math.max(0, Math.round(durationRef.current));
      const mimeType = mimeRef.current || "audio/webm";
      // Signed PUT direct to storage first — the legacy FormData action
      // rides the 4 MB Server Action body cap, which long recordings
      // exceed. The legacy path stays as a fallback for short clips when
      // the signed PUT itself fails.
      const fast = await uploadVoiceNoteSigned({
        inquiryId,
        threadType,
        blob,
        mimeType,
        durationMs,
      });
      if (fast.ok) {
        onSent?.();
        resetToIdle();
        return;
      }
      if (!fast.fallbackToLegacy) {
        onError?.(fast.error || "Could not send voice note.");
        setPhase("preview");
        return;
      }
      const fd = new FormData();
      fd.set("inquiry_id", inquiryId);
      fd.set("thread_type", threadType);
      fd.set("duration_ms", String(durationMs));
      const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
      fd.set("file", blob, `voice-note.${ext}`);
      const res = await uploadAndSendVoiceNote(fd);
      if (!res.ok) {
        onError?.(res.error || "Could not send voice note.");
        setPhase("preview");
        return;
      }
      onSent?.();
      resetToIdle();
    } catch {
      onError?.("Could not send voice note.");
      setPhase("preview");
    }
  }, [inquiryId, threadType, onSent, onError, resetToIdle]);

  // Idle mic button (also the unsupported fallback — disabled with a tooltip).
  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={() => void startRecording()}
        disabled={!supported}
        aria-label="Record voice note"
        title={supported ? "Record a voice note" : "Voice recording isn't supported in this browser"}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "none",
          background: "transparent",
          color: idleColor,
          cursor: supported ? "pointer" : "not-allowed",
          opacity: supported ? 1 : 0.45,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="6" y="2" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 8a5 5 0 0010 0M8 13v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    );
  }

  // Active states render a compact inline control cluster in place of the mic.
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 8px 5px 10px",
        borderRadius: 999,
        background: "rgba(11,11,13,0.05)",
        border: `1px solid ${accent}33`,
        flexShrink: 0,
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      {phase === "recording" && (
        <>
          <span
            aria-hidden
            style={{ width: 9, height: 9, borderRadius: "50%", background: "#E5484D", animation: "voicePulse 1s ease-in-out infinite", flexShrink: 0 }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#0B0B0D", minWidth: 34 }}>
            {fmtElapsed(elapsedMs)}
          </span>
          <button
            type="button"
            onClick={stopRecording}
            aria-label="Stop recording"
            title="Stop"
            style={{
              width: 28, height: 28, borderRadius: "50%", border: "none",
              background: accent, color: "#fff", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
              <rect x="2" y="2" width="8" height="8" rx="1.5" />
            </svg>
          </button>
        </>
      )}

      {(phase === "preview" || phase === "sending") && (
        <>
          {previewUrl && (
            <audio
              src={previewUrl}
              controls
              style={{ height: 30, maxWidth: 170 }}
            />
          )}
          <span style={{ fontSize: 11, color: "rgba(11,11,13,0.55)", fontVariantNumeric: "tabular-nums" }}>
            {fmtElapsed(durationMs)}
          </span>
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={phase === "sending"}
            aria-label="Re-record"
            title="Re-record"
            style={{
              width: 26, height: 26, borderRadius: "50%",
              border: "1px solid rgba(11,11,13,0.15)", background: "transparent",
              color: "rgba(11,11,13,0.6)", cursor: phase === "sending" ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 8a5 5 0 1 1 1.6 3.7M3 8V5M3 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={resetToIdle}
            disabled={phase === "sending"}
            aria-label="Cancel voice note"
            title="Cancel"
            style={{
              width: 26, height: 26, borderRadius: "50%",
              border: "1px solid rgba(11,11,13,0.15)", background: "transparent",
              color: "rgba(11,11,13,0.6)", cursor: phase === "sending" ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={phase === "sending"}
            aria-label="Send voice note"
            title="Send"
            style={{
              height: 28, padding: "0 12px", borderRadius: 999, border: "none",
              background: accent, color: "#fff", fontSize: 11.5, fontWeight: 600,
              cursor: phase === "sending" ? "wait" : "pointer",
              opacity: phase === "sending" ? 0.7 : 1,
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            {phase === "sending" ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden style={{ animation: "voiceSpin 0.8s linear infinite" }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M12.5 7H1.5M12.5 7L8 2.5M12.5 7L8 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {phase === "sending" ? "Sending" : "Send"}
          </button>
        </>
      )}

      <style>{"@keyframes voicePulse{0%,100%{opacity:1}50%{opacity:0.3}}@keyframes voiceSpin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
