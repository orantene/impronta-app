"use client";

/**
 * Voice input for the onboarding entry screen.
 *
 * Same two paths as the Tulala composer (`components/tulala/agent-composer.tsx`),
 * lifted into a hook because the entry screen is mic-first (one big button in
 * the middle of the card) rather than a chat bar: Web Speech where it exists
 * (free, instant, nothing leaves the device), else MediaRecorder → the
 * existing `/api/tulala/transcribe` route. Nothing is ever sent while talking;
 * the words land in the text box and the person taps Send.
 */

import { useCallback, useEffect, useRef, useState } from "react";

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
      /* some implementations throw instead of returning false */
    }
  }
  return "";
}

/** Same ceiling as the composer: the 4 MB body limit, not a cost control. */
const MAX_RECORDING_MS = 90_000;

export type MicMode = "speech" | "record" | null;
export type MicState = "idle" | "listening" | "transcribing";
export type MicNote = "blocked" | "failed" | "tooShort" | null;

export function useVoiceInput(input: {
  locale: "en" | "es";
  value: string;
  setValue: (updater: (current: string) => string) => void;
}) {
  const { locale, value, setValue } = input;
  const [micMode, setMicMode] = useState<MicMode>(null);
  const [state, setState] = useState<MicState>("idle");
  const [note, setNote] = useState<MicNote>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abandonedRef = useRef(false);

  useEffect(() => {
    if (speechRecognitionCtor()) setMicMode("speech");
    else if (canRecord() && recorderMimeType()) setMicMode("record");
  }, []);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [],
  );

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const startSpeech = useCallback(() => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = locale === "es" ? "es-MX" : "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    baseTextRef.current = value ? `${value.trimEnd()} ` : "";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) transcript += event.results[i][0].transcript;
      const base = baseTextRef.current;
      setValue(() => base + transcript);
    };
    recognition.onerror = () => setState("idle");
    recognition.onend = () => setState("idle");
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setNote(null);
      setState("listening");
    } catch {
      setState("idle");
    }
  }, [locale, value, setValue]);

  const stopSpeech = useCallback(() => {
    recognitionRef.current?.stop();
    setState("idle");
  }, []);

  const sendForTranscription = useCallback(
    async (blob: Blob) => {
      setState("transcribing");
      try {
        const form = new FormData();
        form.set("audio", blob, `intake.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
        form.set("locale", locale);
        const res = await fetch("/api/tulala/transcribe", { method: "POST", body: form });
        if (res.status === 503) {
          setMicMode(null);
          setNote(null);
          return;
        }
        const data = (await res.json().catch(() => null)) as { ok?: boolean; text?: string } | null;
        if (!res.ok || !data?.ok || !data.text) {
          setNote("failed");
          return;
        }
        const text = data.text;
        setValue((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text));
        setNote(null);
      } catch {
        setNote("failed");
      } finally {
        setState("idle");
      }
    },
    [locale, setValue],
  );

  const startRecording = useCallback(async () => {
    const mime = recorderMimeType();
    if (!canRecord() || !mime) return;
    setNote(null);
    abandonedRef.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNote("blocked");
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
      setState("idle");
      if (abandonedRef.current) return;
      const blob = new Blob(chunks, { type: mime });
      if (blob.size < 1024) {
        setNote("tooShort");
        return;
      }
      void sendForTranscription(blob);
    };
    try {
      recorder.start();
      setState("listening");
      stopTimerRef.current = setTimeout(() => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }, MAX_RECORDING_MS);
    } catch {
      releaseStream();
      setState("idle");
      setNote("failed");
    }
  }, [releaseStream, sendForTranscription]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else {
      releaseStream();
      setState("idle");
    }
  }, [releaseStream]);

  const toggle = useCallback(() => {
    if (micMode === "speech") {
      if (state === "listening") stopSpeech();
      else startSpeech();
      return;
    }
    if (micMode === "record") {
      if (state === "listening") stopRecording();
      else void startRecording();
    }
  }, [micMode, state, stopSpeech, startSpeech, stopRecording, startRecording]);

  /** Stop without keeping anything (Say it again). */
  const cancel = useCallback(() => {
    abandonedRef.current = true;
    recognitionRef.current?.abort();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    releaseStream();
    setState("idle");
  }, [releaseStream]);

  return { micMode, state, note, toggle, cancel, clearNote: () => setNote(null) };
}
