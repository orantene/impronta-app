"use client";

/**
 * agent-composer.tsx — the input row: textarea, microphone, send.
 *
 * Its own file so the chat component is not also managing a MediaRecorder
 * lifecycle, which is the part most likely to leak a live microphone.
 *
 * DICTATION, NOT UPLOAD
 * ─────────────────────
 * Both mic paths hand back TEXT the user reads and corrects before sending. An
 * intake answer becomes a fact about someone's business, and "I work from home"
 * versus "I work from a home studio" changes which product they are recommended,
 * so a mishearing must be catchable before it is a billing decision. That is the
 * difference from the voice-note recorder in the inquiry threads, which sends
 * audio as the message.
 *
 * TWO PATHS, PREFERRING THE FREE ONE
 * ──────────────────────────────────
 *   1. Web Speech API — on-device, instant, costs nothing, no audio leaves the
 *      machine. Chrome and Safari. Always preferred when present.
 *   2. MediaRecorder → /api/tulala/transcribe. Firefox and older Android, where
 *      the alternative is no microphone at all. Audio is held in memory, posted
 *      once, and never stored.
 *
 * The button only renders when one of them will actually work. A mic that does
 * nothing is worse than no mic.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal shape of the vendor-prefixed Web Speech API.
 *
 * Declared locally because `lib.dom` does not ship these types and adding a
 * global ambient declaration for a browser API used in exactly one component
 * would leak `webkitSpeechRecognition` into every file's namespace.
 */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Can this browser record at all? The fallback path's precondition. */
function canRecord(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function recorderMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  if (typeof MediaRecorder === "undefined") return "";
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* isTypeSupported throws on some implementations rather than returning false */
    }
  }
  return "";
}

/**
 * Recording ceiling.
 *
 * Not a cost control — it is that a 4MB body is the platform limit and a
 * forgotten open mic is the way to reach it. An intake answer is seconds long,
 * so 90s is already generous.
 */
const MAX_RECORDING_MS = 90_000;

export function AgentComposer({
  disabled,
  placeholder,
  sendLabel,
  locale,
  onSend,
  onWrapUpHint,
}: {
  disabled: boolean;
  placeholder: string;
  sendLabel: string;
  locale: "en" | "es";
  onSend: (text: string) => void;
  /** Called when the draft looks impatient, so the server can be told once. */
  onWrapUpHint: () => void;
}) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  /** null until the browser has been probed, so SSR renders no mic either way. */
  const [micMode, setMicMode] = useState<"speech" | "record" | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Text present when dictation began, so interim results replace cleanly. */
  const baseTextRef = useRef("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set when the user cancels, so the stop handler drops the audio. */
  const abandonedRef = useRef(false);

  useEffect(() => {
    // Web Speech first: free, instant, and no audio leaves the device. The
    // recorder is only worth offering where that does not exist.
    if (speechRecognitionCtor()) setMicMode("speech");
    else if (canRecord() && recorderMimeType()) setMicMode("record");
  }, []);

  // Never leave the microphone open. Unmounting mid-dictation without this
  // leaves the browser's recording indicator lit, which is alarming and fair.
  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      // Unmounting mid-recording without this leaves the browser's recording
      // indicator lit, which is alarming and fair.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [],
  );

  const grow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, []);

  useEffect(grow, [value, grow]);

  const stopSpeech = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const startSpeech = useCallback(() => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = locale === "es" ? "es-MX" : "en-US";
    recognition.continuous = true;
    // Interim results so the words appear as they are spoken. Without them the
    // textarea sits empty through a whole sentence and reads as not working.
    recognition.interimResults = true;

    baseTextRef.current = value ? `${value.trimEnd()} ` : "";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setValue(baseTextRef.current + transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [locale, value]);

  // ─── Recorder fallback ──────────────────────────────────────────────────────

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const sendForTranscription = useCallback(
    async (blob: Blob) => {
      setTranscribing(true);
      try {
        const form = new FormData();
        form.set("audio", blob, `intake.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
        form.set("locale", locale);
        const res = await fetch("/api/tulala/transcribe", { method: "POST", body: form });

        if (res.status === 503) {
          // Transcription is not configured on this deploy. Hide the mic for the
          // rest of the session rather than let it fail again on every take.
          setMicMode(null);
          setMicNote(null);
          return;
        }

        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; text?: string; error?: string }
          | null;

        if (!res.ok || !data?.ok || !data.text) {
          setMicNote(data?.error ?? MIC_STRINGS[locale].failed);
          return;
        }

        // Appended, not replaced: the person may have typed before recording,
        // and a transcript that ate their sentence is worse than no transcript.
        setValue((current) => (current.trim() ? `${current.trimEnd()} ${data.text}` : data.text!));
        setMicNote(null);
        textareaRef.current?.focus();
      } catch {
        setMicNote(MIC_STRINGS[locale].failed);
      } finally {
        setTranscribing(false);
      }
    },
    [locale],
  );

  const startRecording = useCallback(async () => {
    const mime = recorderMimeType();
    if (!canRecord() || !mime) return;

    setMicNote(null);
    abandonedRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Denied, dismissed, or no device. All three are the same to us, and none
      // of them is an error the visitor needs explained back to them.
      setMicNote(MIC_STRINGS[locale].blocked);
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      releaseStream();
      setListening(false);
      if (abandonedRef.current) return;
      const blob = new Blob(chunks, { type: mime });
      // Sub-kilobyte takes are a mis-click, not speech. Posting them spends a
      // provider call to be told there was nothing there.
      if (blob.size < 1024) {
        setMicNote(MIC_STRINGS[locale].tooShort);
        return;
      }
      void sendForTranscription(blob);
    };

    try {
      recorder.start();
      setListening(true);
      stopTimerRef.current = setTimeout(() => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }, MAX_RECORDING_MS);
    } catch {
      releaseStream();
      setListening(false);
      setMicNote(MIC_STRINGS[locale].failed);
    }
  }, [locale, releaseStream, sendForTranscription]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else {
      releaseStream();
      setListening(false);
    }
  }, [releaseStream]);

  const toggleMic = useCallback(() => {
    if (micMode === "speech") {
      if (listening) stopSpeech();
      else startSpeech();
      return;
    }
    if (micMode === "record") {
      if (listening) stopRecording();
      else void startRecording();
    }
  }, [micMode, listening, stopSpeech, startSpeech, stopRecording, startRecording]);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    if (listening) {
      // Cancel rather than transcribe: they have already typed what they meant,
      // and appending a transcript to a message that was just sent would put it
      // at the top of the NEXT one.
      abandonedRef.current = true;
      if (micMode === "speech") stopSpeech();
      else stopRecording();
    }
    if (looksImpatient(text)) onWrapUpHint();
    onSend(text);
    setValue("");
  }, [value, disabled, listening, micMode, stopSpeech, stopRecording, onSend, onWrapUpHint]);

  return (
    <div
      className="rounded-2xl p-2.5"
      style={{
        background: "var(--plt-bg-raised)",
        border: `1px solid ${listening ? "var(--plt-forest)" : "var(--plt-hairline)"}`,
        transition: "border-color 150ms ease",
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks. Standard for chat, and the
            // opposite of a form, so it has to be deliberate.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent px-2 py-2 text-[0.9375rem] leading-[1.55] outline-none placeholder:text-[var(--plt-muted-soft)]"
          style={{ color: "var(--plt-ink)", maxHeight: 180 }}
          aria-label={placeholder}
        />

        {micMode ? (
          <button
            type="button"
            onClick={toggleMic}
            disabled={disabled || transcribing}
            aria-label={
              listening ? MIC_STRINGS[locale].stop : MIC_STRINGS[locale].start
            }
            aria-pressed={listening}
            title={listening ? MIC_STRINGS[locale].stop : MIC_STRINGS[locale].start}
            className="grid size-9 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-50"
            style={{
              background: listening ? "var(--plt-forest)" : "transparent",
              border: `1px solid ${listening ? "var(--plt-forest)" : "var(--plt-hairline)"}`,
              color: listening ? "#fff" : "var(--plt-muted)",
            }}
          >
            {transcribing ? <SpinnerGlyph /> : <MicGlyph active={listening} />}
          </button>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          className="h-9 shrink-0 rounded-full px-4 text-[0.8125rem] font-semibold transition-opacity disabled:opacity-40"
          style={{ background: "var(--plt-forest)", color: "#fff" }}
        >
          {sendLabel}
        </button>
      </div>

      {/* One line, three states. aria-live so a screen reader hears the mic
          state change without the focus moving. */}
      {listening || transcribing || micNote ? (
        <p
          className="px-2 pb-0.5 pt-1.5 text-[0.6875rem]"
          style={{ color: micNote ? "var(--plt-warning)" : "var(--plt-muted)" }}
          aria-live="polite"
        >
          {listening
            ? MIC_STRINGS[locale].listening
            : transcribing
              ? MIC_STRINGS[locale].transcribing
              : micNote}
        </p>
      ) : null}
    </div>
  );
}

const MIC_STRINGS = {
  en: {
    start: "Speak your answer",
    stop: "Stop",
    listening: "Listening. Speak, then stop when you are done.",
    transcribing: "Writing that down.",
    failed: "I could not read that recording. Try typing it.",
    blocked: "I could not reach your microphone.",
    tooShort: "That was too short to hear.",
  },
  es: {
    start: "Habla tu respuesta",
    stop: "Detener",
    listening: "Escuchando. Habla y detén cuando termines.",
    transcribing: "Anotando eso.",
    failed: "No pude leer esa grabación. Intenta escribirla.",
    blocked: "No pude acceder a tu micrófono.",
    tooShort: "Fue demasiado corto para escucharlo.",
  },
} as const;

function SpinnerGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ animation: "tulalaSpin 0.8s linear infinite" }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <style>{"@keyframes tulalaSpin{to{transform:rotate(360deg)}}"}</style>
    </svg>
  );
}

function MicGlyph({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="2.5"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.7"
        fill={active ? "currentColor" : "none"}
      />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Client-side twin of the server's wrap-up detector.
 *
 * Deliberately a subset: this only sets a flag the server then re-derives from
 * the message itself, so the two cannot disagree in a way that matters. It
 * exists so the flag is set on the SAME turn the user expresses impatience,
 * rather than the one after.
 */
function looksImpatient(text: string): boolean {
  return /\b(just show me|skip|that'?s (it|all|enough)|no more questions|mu[ée]strame ya|suficiente)\b/i.test(
    text,
  );
}
