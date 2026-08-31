"use client";

/**
 * strategist-chat.tsx — post-signup conversation against the Brief.
 *
 * Deliberately thinner than the intake chat: no question bank echo, no email
 * gate, no knowledge-panel progress. The person already has an account; this is
 * a place to say what changed and see what that implies.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AgentComposer } from "@/components/tulala/agent-composer";

type Bubble = { id: number; role: "user" | "agent"; text: string };

type Proposal =
  | {
      kind: "raise_upgrade";
      trigger: {
        triggerKey: string;
        targetPackage: string;
        targetTier: string;
        rationale: string | null;
      };
      evidenceKeys: string[];
    }
  | { kind: "note"; text: string; factKeys: string[] };

export function StrategistChat({
  locale,
  opening,
}: {
  locale: "en" | "es";
  opening: string;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { id: 0, role: "agent", text: opening },
  ]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles, proposals]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setError(null);
      const userId = nextId.current++;
      setBubbles((prev) => [...prev, { id: userId, role: "user", text: trimmed }]);

      try {
        const res = await fetch("/api/tulala/strategist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, locale }),
        });
        const data = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              reply?: string;
              proposals?: Proposal[];
              error?: string;
            }
          | null;
        if (!res.ok || !data?.ok || !data.reply) {
          throw new Error(data?.error || (locale === "es" ? "No se pudo enviar." : "That did not go through."));
        }
        setBubbles((prev) => [
          ...prev,
          { id: nextId.current++, role: "agent", text: data.reply! },
        ]);
        if (data.proposals?.length) {
          setProposals((prev) => [
            ...prev.filter((p) => p.kind === "raise_upgrade"),
            ...data.proposals!.filter((p) => p.kind === "raise_upgrade"),
          ]);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [busy, locale],
  );

  const copy =
    locale === "es"
      ? {
          placeholder: "Cuéntame qué cambió",
          send: "Enviar",
          upgradeTitle: "Sugerencia de plan",
          upgradeBody: "Nada cambia hasta que lo digas.",
        }
      : {
          placeholder: "Tell me what changed",
          send: "Send",
          upgradeTitle: "Plan suggestion",
          upgradeBody: "Nothing changes until you say so.",
        };

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1" aria-live="polite">
        <div className="flex flex-col gap-4 pb-6">
          {bubbles.map((b) => (
            <div
              key={b.id}
              className={b.role === "user" ? "self-end" : "self-start"}
              style={{ maxWidth: "min(100%, 34rem)" }}
            >
              <div
                className="rounded-2xl px-4 py-3 text-[0.9375rem] leading-[1.55]"
                style={{
                  background:
                    b.role === "user" ? "var(--plt-forest)" : "var(--plt-bg-raised)",
                  color: b.role === "user" ? "#fff" : "var(--plt-ink)",
                  border:
                    b.role === "user" ? "none" : "1px solid var(--plt-hairline)",
                }}
              >
                {b.text}
              </div>
            </div>
          ))}

          {proposals.map((p) =>
            p.kind === "raise_upgrade" ? (
              <div
                key={p.trigger.triggerKey}
                className="self-start rounded-xl px-3.5 py-3"
                style={{
                  background: "var(--plt-bg-raised)",
                  border: "1px solid var(--plt-hairline)",
                  maxWidth: "min(100%, 34rem)",
                }}
              >
                <p
                  className="plt-mono mb-1 text-[0.625rem] uppercase tracking-[0.12em]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {copy.upgradeTitle}
                </p>
                <p
                  className="text-[0.9375rem] font-semibold"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {p.trigger.targetTier}
                </p>
                <p
                  className="mt-1 text-[0.8125rem] leading-[1.5]"
                  style={{ color: "var(--plt-ink-soft)" }}
                >
                  {p.trigger.rationale}
                </p>
                <p className="mt-2 text-[0.6875rem]" style={{ color: "var(--plt-muted)" }}>
                  {copy.upgradeBody}
                </p>
              </div>
            ) : null,
          )}

          {error ? (
            <p className="text-[0.8125rem]" style={{ color: "var(--plt-warning)" }} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <AgentComposer
        disabled={busy}
        placeholder={copy.placeholder}
        sendLabel={copy.send}
        locale={locale}
        onSend={send}
        onWrapUpHint={() => {}}
      />
    </div>
  );
}
