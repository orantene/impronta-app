"use client";

import { useEffect, useRef, useState } from "react";

import {
  recordPitchViewAction,
  removeTalentFromPitchAction,
  declinePitchAction,
  convertPitchToInquiryAction,
} from "@/lib/pitch/pitch-public-actions";
import type { PitchLandingData, PitchTalentCard } from "./page";
import type { PitchRow } from "@/lib/pitch/pitch-types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtHeight(cm: number | null): string | null {
  if (!cm) return null;
  const totalIn = Math.round(cm / 2.54);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn % 12;
  return `${ft}'${inch}" · ${cm} cm`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

type ConvertFormState =
  | { phase: "idle" }
  | { phase: "form" }
  | { phase: "submitting" }
  | { phase: "success"; inquiryId: string }
  | { phase: "error"; message: string };

type DeclineState = "idle" | "confirming" | "submitting" | "done";

// ── Root component ───────────────────────────────────────────────────────────

export function PitchLanding({ data }: { data: PitchLandingData }) {
  const { token, pitch, talents, agencyName, brandMarkSvg } = data;
  const viewFired = useRef(false);

  // Build initial removed-set from server-resolved state.
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const t of talents) {
      if (t._removedAt) set.add(t.talentProfileId);
    }
    return set;
  });

  const [convertState, setConvertState] = useState<ConvertFormState>({ phase: "idle" });
  const [declineState, setDeclineState] = useState<DeclineState>("idle");

  useEffect(() => {
    if (viewFired.current) return;
    viewFired.current = true;
    recordPitchViewAction(token).catch(() => {});
  }, [token]);

  const activeTalents = talents.filter((t) => !removedIds.has(t.talentProfileId));
  const isTerminal =
    pitch.status === "converted" ||
    pitch.status === "declined" ||
    pitch.status === "expired" ||
    declineState === "done";

  async function handleRemoveTalent(talentProfileId: string) {
    setRemovedIds((prev) => new Set([...prev, talentProfileId]));
    await removeTalentFromPitchAction(token, talentProfileId);
  }

  async function handleDecline() {
    setDeclineState("submitting");
    await declinePitchAction(token, null);
    setDeclineState("done");
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-5 py-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {brandMarkSvg ? (
            <div
              className="h-8 w-8 shrink-0 overflow-hidden rounded"
              dangerouslySetInnerHTML={{ __html: brandMarkSvg }}
              aria-hidden
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-900 text-xs font-bold text-white">
              {agencyName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-zinc-900">{agencyName}</p>
            <p className="text-xs text-zinc-500">Talent pitch</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 pb-20 pt-6 space-y-6">
        {/* Terminal state overlays */}
        {pitch.status === "converted" && (
          <TerminalBanner
            icon="check"
            title="You've already opened an inquiry from this pitch."
            body="The team will be in touch. No further action needed."
          />
        )}
        {(pitch.status === "declined" || declineState === "done") &&
          pitch.status !== "converted" && (
            <TerminalBanner
              icon="x"
              title="You've declined this pitch."
              body={`Reach out to ${agencyName} directly if you change your mind.`}
            />
          )}
        {pitch.status === "expired" && (
          <TerminalBanner
            icon="clock"
            title="This pitch has expired."
            body="Contact the agency for updated availability."
          />
        )}

        {/* Personal note */}
        {pitch.personal_note && (
          <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-200">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              A note from {agencyName}
            </p>
            <p className="text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap">
              {pitch.personal_note}
            </p>
          </div>
        )}

        {/* Brief */}
        <PitchBriefBlock pitch={pitch} />

        {/* Talent list */}
        {talents.length > 0 && (
          <section>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-400">
              {activeTalents.length === 1
                ? "1 talent"
                : `${activeTalents.length} talents`}
            </p>
            <div className="space-y-3">
              {talents.map((talent) => (
                <TalentCard
                  key={talent.pitchTalentId}
                  talent={talent}
                  removed={removedIds.has(talent.talentProfileId)}
                  canRemove={!isTerminal && activeTalents.length > 1}
                  onRemove={() => handleRemoveTalent(talent.talentProfileId)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Actions */}
        {!isTerminal && (
          <div className="space-y-3 pt-2">
            {convertState.phase === "idle" && (
              <button
                type="button"
                onClick={() => setConvertState({ phase: "form" })}
                className="w-full rounded-2xl bg-zinc-900 px-6 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 active:bg-zinc-700"
              >
                I'm interested →
              </button>
            )}

            {(convertState.phase === "form" ||
              convertState.phase === "submitting" ||
              convertState.phase === "error") && (
              <ConvertForm
                token={token}
                state={convertState}
                onStateChange={setConvertState}
                onCancel={() => setConvertState({ phase: "idle" })}
              />
            )}

            {convertState.phase === "success" && (
              <div className="rounded-2xl bg-emerald-50 px-5 py-5 text-center ring-1 ring-emerald-200">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                  <CheckIcon className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-emerald-800">Inquiry sent!</p>
                <p className="mt-1 text-xs text-emerald-700">
                  {agencyName} will be in touch shortly.
                </p>
              </div>
            )}

            {convertState.phase !== "success" && (
              <div className="text-center">
                {declineState === "idle" && (
                  <button
                    type="button"
                    onClick={() => setDeclineState("confirming")}
                    className="text-xs text-zinc-400 underline underline-offset-2 transition hover:text-zinc-600"
                  >
                    Not a fit — decline this pitch
                  </button>
                )}
                {declineState === "confirming" && (
                  <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-left shadow-sm">
                    <p className="text-sm font-medium text-zinc-800">
                      Decline this pitch?
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {agencyName} will be notified. You can&apos;t undo this.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={handleDecline}
                        className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700"
                      >
                        Yes, decline
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeclineState("idle")}
                        className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 transition hover:border-zinc-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {declineState === "submitting" && (
                  <span className="text-xs text-zinc-400">Declining…</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Expiry notice */}
        {pitch.expires_at && !isTerminal && (
          <p className="text-center text-[11px] text-zinc-400">
            This pitch expires on {fmtDate(pitch.expires_at)}.
          </p>
        )}
      </main>

      <footer className="border-t border-zinc-100 bg-white px-5 py-6 text-center text-[11px] text-zinc-400">
        Sent by {agencyName} via Tulala.
      </footer>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PitchBriefBlock({ pitch }: { pitch: PitchRow }) {
  const b = pitch.brief ?? {};
  const hasDate = typeof b.event_date === "string" && b.event_date.length > 0;
  const hasLocation = typeof b.event_location === "string" && b.event_location.length > 0;
  const hasRate = typeof b.rate_hint === "string" && b.rate_hint.length > 0;

  if (!hasDate && !hasLocation && !hasRate) return null;

  return (
    <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-200">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
        Event details
      </p>
      <dl className="space-y-2">
        {hasDate && (
          <div className="flex items-start gap-3">
            <dt className="w-16 shrink-0 text-xs text-zinc-400">Date</dt>
            <dd className="text-sm text-zinc-700">{b.event_date as string}</dd>
          </div>
        )}
        {hasLocation && (
          <div className="flex items-start gap-3">
            <dt className="w-16 shrink-0 text-xs text-zinc-400">Location</dt>
            <dd className="text-sm text-zinc-700">{b.event_location as string}</dd>
          </div>
        )}
        {hasRate && (
          <div className="flex items-start gap-3">
            <dt className="w-16 shrink-0 text-xs text-zinc-400">Rate</dt>
            <dd className="text-sm text-zinc-700">{b.rate_hint as string}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function TalentCard({
  talent,
  removed,
  canRemove,
  onRemove,
}: {
  talent: PitchTalentCard;
  removed: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const height = fmtHeight(talent.heightCm);

  return (
    <div
      className={[
        "relative rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden transition-opacity",
        removed ? "opacity-40" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex gap-4 p-4">
        {/* Photo */}
        <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
          {talent.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={talent.photoUrl}
              alt={talent.displayName}
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-bold text-zinc-400">
              {talent.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-zinc-900">
              {talent.displayName}
            </p>
            {!removed && canRemove && (
              <button
                type="button"
                onClick={onRemove}
                title="Remove from pitch"
                className="shrink-0 rounded-full p-1 text-zinc-300 transition hover:bg-zinc-100 hover:text-zinc-500"
                aria-label={`Remove ${talent.displayName}`}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {height && <p className="mt-0.5 text-xs text-zinc-400">{height}</p>}
          {talent.shortBio && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">
              {talent.shortBio}
            </p>
          )}
          {talent.adminNote && (
            <p className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs italic leading-relaxed text-zinc-500">
              "{talent.adminNote}"
            </p>
          )}
        </div>
      </div>

      {removed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-zinc-500 shadow-sm ring-1 ring-zinc-200">
            Removed
          </span>
        </div>
      )}
    </div>
  );
}

function ConvertForm({
  token,
  state,
  onStateChange,
  onCancel,
}: {
  token: string;
  state: ConvertFormState;
  onStateChange: (s: ConvertFormState) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const submitting = state.phase === "submitting";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    onStateChange({ phase: "submitting" });
    const result = await convertPitchToInquiryAction({
      token,
      contactInfo: {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        message: message.trim() || null,
      },
    });
    if (result.ok) {
      onStateChange({ phase: "success", inquiryId: result.data.inquiryId });
    } else {
      onStateChange({
        phase: "error",
        message:
          result.reason === "validation_failed"
            ? (result.message ?? "Please fill in your name and email.")
            : "Something went wrong. Try again.",
      });
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
      <p className="mb-4 text-sm font-semibold text-zinc-900">
        Send an inquiry
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            placeholder="Your name"
            required
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-zinc-400 focus:bg-white disabled:opacity-50"
          />
        </Field>
        <Field label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            placeholder="your@email.com"
            required
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-zinc-400 focus:bg-white disabled:opacity-50"
          />
        </Field>
        <Field label="Phone (optional)">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting}
            placeholder="+1 555 000 0000"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-zinc-400 focus:bg-white disabled:opacity-50"
          />
        </Field>
        <Field label="Message (optional)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={submitting}
            placeholder="Anything you'd like to add…"
            rows={3}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-zinc-400 focus:bg-white disabled:opacity-50 resize-none"
          />
        </Field>

        {state.phase === "error" && (
          <p className="text-xs text-red-600">{state.message}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting || !name.trim() || !email.trim()}
            className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send inquiry"}
          </button>
          {!submitting && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:border-zinc-400"
            >
              Back
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-600">
        {label}
        {required && <span className="ml-0.5 text-zinc-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function TerminalBanner({
  icon,
  title,
  body,
}: {
  icon: "check" | "x" | "clock";
  title: string;
  body: string;
}) {
  const palette = {
    check: "bg-emerald-50 ring-emerald-200 text-emerald-800",
    x: "bg-zinc-100 ring-zinc-200 text-zinc-700",
    clock: "bg-amber-50 ring-amber-200 text-amber-800",
  }[icon];
  const iconEl = {
    check: <CheckIcon className="h-5 w-5" />,
    x: <XIcon className="h-5 w-5" />,
    clock: <ClockIcon className="h-5 w-5" />,
  }[icon];
  return (
    <div className={`rounded-2xl px-5 py-4 ring-1 ${palette}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{iconEl}</div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs">{body}</p>
        </div>
      </div>
    </div>
  );
}

// ── Inline icons (no external dep) ──────────────────────────────────────────

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
