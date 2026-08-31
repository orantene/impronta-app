"use client";

/**
 * agent-chat.tsx — the Tulala Agent conversation surface.
 *
 * Reads the SSE stream from `/api/tulala/turn` and renders it. All product
 * decisions (what to ask, when to want an email, when there is enough to
 * recommend) are made server-side; this component owns presentation and the
 * small amount of state the server deliberately does not persist.
 *
 * WHY THE CLIENT HOLDS `asked` AND `userTurns`
 * ───────────────────────────────────────────
 * There is no conversation table. The Brief is the memory, and it stores FACTS,
 * not transcript. So the per-session bookkeeping the question selector needs
 * lives here and is echoed back each turn. It is non-authoritative by design:
 * the KV limiters and the Brief-derived state are what actually bound a session,
 * so the worst a tampered payload achieves is replaying one's own question
 * order. That tradeoff buys a stateless endpoint and no transcript at rest.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { detectLink, displayHost } from "@/lib/tulala/detect-url";

import { TulalaKnowledgePanel, type PanelData } from "./knowledge-panel";
import { AgentComposer } from "./agent-composer";
import { TulalaImportCard, type ImportCardCopy, type ImportedFactRow } from "./import-card";

type Bubble = {
  id: number;
  role: "user" | "agent";
  text: string;
  /** True while tokens are still arriving, so the caret can blink. */
  streaming?: boolean;
};

type LearnedFact = { factKey: string; value: unknown; confidence: number };

type AskedRecord = { questionId: string; asks: number };

export type AgentChatCopy = {
  opening: string;
  placeholder: string;
  send: string;
  thinking: string;
  learnedTitle: string;
  emailOfferTitle: string;
  emailOfferBody: string;
  emailPlaceholder: string;
  emailSave: string;
  reviewCta: string;
  errorGeneric: string;
  restart: string;
  importReading: string;
  importFailed: string;
  importCard: ImportCardCopy;
};

export function TulalaAgentChat({
  locale,
  copy,
  isAuthenticated,
}: {
  locale: "en" | "es";
  copy: AgentChatCopy;
  isAuthenticated: boolean;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { id: 0, role: "agent", text: copy.opening },
  ]);
  const [panel, setPanel] = useState<PanelData | null>(null);
  const [learned, setLearned] = useState<LearnedFact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailAsk, setEmailAsk] = useState<"no" | "offer" | "needed">("no");
  const [readyToReview, setReadyToReview] = useState(false);

  // Server-derived, echoed back each turn. See the note at the top of the file.
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(
    "discovery.opening",
  );
  const [asked, setAsked] = useState<AskedRecord[]>([
    { questionId: "discovery.opening", asks: 1 },
  ]);
  const [userTurns, setUserTurns] = useState(0);
  const [wantsToWrapUp, setWantsToWrapUp] = useState(false);

  /**
   * The one pending import, if any.
   *
   * Single rather than a list: two unanswered "is this right?" cards at once is
   * a form, and the whole point of the conversation is that it is not one.
   */
  const [pendingImport, setPendingImport] = useState<{
    host: string;
    facts: ImportedFactRow[];
  } | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  /** Links already attempted this session, so a re-mention is not re-fetched. */
  const importedRef = useRef<Set<string>>(new Set());

  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Follow the stream. `scrollHeight` rather than `scrollIntoView` so the page
  // itself never jumps, which is what makes an on-screen keyboard fight the view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Tell the server the session went cold, on the way out.
   *
   * `sendBeacon` survives page unload where `fetch` does not, and this is Signal
   * 1 of the learning loop: the question that was on screen when someone left is
   * the strongest evidence that question is bad, and it is unrecoverable after
   * the fact.
   */
  useEffect(() => {
    const onLeave = () => {
      if (userTurns === 0 || readyToReview) return;
      const payload = JSON.stringify({
        pendingQuestionId,
        userTurns,
        factsKnown: panel?.factsKnown ?? 0,
      });
      navigator.sendBeacon?.("/api/tulala/abandon", payload);
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onLeave();
    });
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, [pendingQuestionId, userTurns, panel?.factsKnown, readyToReview]);

  /**
   * Read a link the visitor mentioned.
   *
   * Fired AFTER the turn rather than instead of it, and never blocking it. The
   * conversation is the product; the import is an accelerator, and a slow or
   * dead page must not hold up the reply to what they actually said.
   */
  const runImport = useCallback(
    async (url: string) => {
      const host = displayHost(url);
      setImporting(host);
      try {
        const res = await fetch("/api/tulala/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, locale }),
        });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; host?: string; facts?: ImportedFactRow[]; error?: string }
          | null;

        if (!res.ok || !data?.ok || !data.facts?.length) {
          // Said as the assistant, not shown as an error. "I could not open that
          // page" is a normal thing for a reader to say, and a red banner would
          // make a dead link look like a broken product.
          setBubbles((prev) => [
            ...prev,
            {
              id: nextId.current++,
              role: "agent",
              text: data?.error ?? copy.importFailed,
            },
          ]);
          return;
        }

        setPendingImport({ host: data.host ?? host, facts: data.facts });
      } catch {
        setBubbles((prev) => [
          ...prev,
          { id: nextId.current++, role: "agent", text: copy.importFailed },
        ]);
      } finally {
        setImporting(null);
      }
    },
    [locale, copy.importFailed],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      setError(null);
      setLearned([]);
      setBusy(true);

      const userBubbleId = nextId.current++;
      const agentBubbleId = nextId.current++;
      setBubbles((prev) => [
        ...prev,
        { id: userBubbleId, role: "user", text: trimmed },
        { id: agentBubbleId, role: "agent", text: "", streaming: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/tulala/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: trimmed,
            locale,
            pendingQuestionId,
            asked,
            userTurns,
            wantsToWrapUp,
          }),
        });

        if (!response.ok || !response.body) {
          const detail = await response
            .json()
            .then((j: { error?: string }) => j.error)
            .catch(() => null);
          throw new Error(detail || copy.errorGeneric);
        }

        await consumeSse(response.body, (frame) => {
          if (frame.event === "understood") {
            const data = frame.data as { learned: LearnedFact[]; panel: PanelData };
            setLearned(data.learned);
            setPanel(data.panel);
          } else if (frame.event === "text") {
            const delta = (frame.data as { delta: string }).delta;
            setBubbles((prev) =>
              prev.map((b) => (b.id === agentBubbleId ? { ...b, text: b.text + delta } : b)),
            );
          } else if (frame.event === "done") {
            const data = frame.data as {
              reply: string;
              nextQuestionId: string | null;
              move: string;
              emailAsk: "no" | "offer" | "needed";
              panel: PanelData;
            };
            // Settle on the sanitised text. The deltas were raw, so this is where
            // a stripped price or a second question actually disappears.
            setBubbles((prev) =>
              prev.map((b) =>
                b.id === agentBubbleId ? { ...b, text: data.reply, streaming: false } : b,
              ),
            );
            setPanel(data.panel);
            setEmailAsk(data.emailAsk);
            setPendingQuestionId(data.nextQuestionId);
            if (data.nextQuestionId) {
              setAsked((prev) => bumpAsked(prev, data.nextQuestionId!));
            }
            setUserTurns((n) => n + 1);
            setReadyToReview(
              data.move === "recommend" || data.move === "ceiling_reached",
            );
          } else if (frame.event === "error") {
            const data = frame.data as { message: string };
            throw new Error(data.message || copy.errorGeneric);
          }
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || copy.errorGeneric);
        // Drop the empty agent bubble; an error message is shown instead, and a
        // blank bubble with a blinking caret reads as a hang.
        setBubbles((prev) =>
          prev.filter((b) => !(b.id === agentBubbleId && b.text.length === 0)),
        );
      } finally {
        setBusy(false);
        abortRef.current = null;
      }

      // After the reply, not before: see the note on `runImport`.
      const link = detectLink(trimmed);
      if (link && !importedRef.current.has(link.url)) {
        importedRef.current.add(link.url);
        void runImport(link.url);
      }
    },
    [
      busy,
      locale,
      pendingQuestionId,
      asked,
      userTurns,
      wantsToWrapUp,
      copy.errorGeneric,
      runImport,
    ],
  );

  const learnedLabels = useMemo(
    () => learned.map((l) => ({ key: l.factKey, value: formatFactValue(l.value) })),
    [learned],
  );

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[1fr_320px] lg:px-8">
      <div className="flex min-h-[70vh] flex-col">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto pr-1"
          aria-live="polite"
          aria-atomic="false"
        >
          <div className="flex flex-col gap-5 pb-6">
            {bubbles.map((bubble) => (
              <ChatBubble key={bubble.id} bubble={bubble} />
            ))}

            {learnedLabels.length > 0 ? (
              <div
                className="self-start rounded-xl px-3.5 py-3"
                style={{
                  background: "var(--plt-bg-raised)",
                  border: "1px solid var(--plt-hairline)",
                  maxWidth: "min(100%, 34rem)",
                }}
              >
                <p
                  className="plt-mono mb-1.5 text-[0.625rem] uppercase tracking-[0.12em]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {copy.learnedTitle}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {learnedLabels.map((item) => (
                    <li
                      key={item.key}
                      className="text-[0.8125rem] leading-[1.5]"
                      style={{ color: "var(--plt-ink-soft)" }}
                    >
                      {item.value}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {importing ? (
              <p
                className="self-start text-[0.8125rem] italic"
                style={{ color: "var(--plt-muted)" }}
              >
                {copy.importReading.replace("{host}", importing)}
              </p>
            ) : null}

            {pendingImport ? (
              <TulalaImportCard
                host={pendingImport.host}
                facts={pendingImport.facts}
                copy={copy.importCard}
                onResolved={() => {
                  setPendingImport(null);
                  // The panel counts confirmed facts, so it is stale the moment
                  // an import is accepted. The next turn refreshes it; until
                  // then, a slightly low count is better than a wrong one.
                }}
              />
            ) : null}

            {busy && bubbles[bubbles.length - 1]?.text === "" ? (
              <p
                className="self-start text-[0.8125rem] italic"
                style={{ color: "var(--plt-muted)" }}
              >
                {copy.thinking}
              </p>
            ) : null}

            {error ? (
              <div
                className="self-start rounded-xl px-3.5 py-2.5 text-[0.8125rem]"
                style={{
                  background: "color-mix(in srgb, #b4331f 8%, transparent)",
                  border: "1px solid color-mix(in srgb, #b4331f 24%, transparent)",
                  color: "var(--plt-ink)",
                }}
                role="alert"
              >
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <AgentComposer
          disabled={busy}
          placeholder={copy.placeholder}
          sendLabel={copy.send}
          locale={locale}
          onSend={send}
          onWrapUpHint={() => setWantsToWrapUp(true)}
        />
      </div>

      <TulalaKnowledgePanel
        panel={panel}
        emailAsk={isAuthenticated ? "no" : emailAsk}
        readyToReview={readyToReview}
        copy={copy}
        locale={locale}
      />
    </div>
  );
}

// ─── Bubbles ──────────────────────────────────────────────────────────────────

function ChatBubble({ bubble }: { bubble: Bubble }) {
  const isUser = bubble.role === "user";
  return (
    <div
      className={isUser ? "self-end" : "self-start"}
      style={{ maxWidth: "min(100%, 34rem)" }}
    >
      <div
        className="rounded-2xl px-4 py-3 text-[0.9375rem] leading-[1.6]"
        style={
          isUser
            ? {
                background: "var(--plt-forest)",
                color: "#fff",
                borderBottomRightRadius: 6,
              }
            : {
                background: "var(--plt-bg-raised)",
                border: "1px solid var(--plt-hairline)",
                color: "var(--plt-ink)",
                borderBottomLeftRadius: 6,
              }
        }
      >
        {bubble.text}
        {bubble.streaming ? (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-pulse"
            style={{ background: "currentColor", opacity: 0.55 }}
          />
        ) : null}
      </div>
    </div>
  );
}

// ─── SSE ──────────────────────────────────────────────────────────────────────

/**
 * Read `event:`/`data:` pairs off a byte stream.
 *
 * Hand-rolled rather than `EventSource` because EventSource cannot POST, and the
 * turn needs a request body. The buffering matters: a frame can be split across
 * chunk boundaries, so parsing per-chunk drops text at random under load, which
 * is close to impossible to reproduce locally.
 */
async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: { event: string; data: unknown }) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const frame = parseSseChunk(chunk);
      if (frame) onFrame(frame);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

function parseSseChunk(chunk: string): { event: string; data: unknown } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bumpAsked(records: AskedRecord[], questionId: string): AskedRecord[] {
  const existing = records.find((r) => r.questionId === questionId);
  if (existing) {
    return records.map((r) =>
      r.questionId === questionId ? { ...r, asks: r.asks + 1 } : r,
    );
  }
  return [...records, { questionId, asks: 1 }];
}

function formatFactValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value).replace(/_/g, " ");
}
