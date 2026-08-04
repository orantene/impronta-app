"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  recordPitchViewAction,
  removeTalentFromPitchAction,
  approvePitchAction,
  declinePitchAction,
  convertPitchToInquiryAction,
} from "@/lib/pitch/pitch-public-actions";
import type { PitchLandingData, PitchTalentCard } from "./page";
import { cardDesignToCssVars } from "@/lib/site-admin/server/card-design-shape";
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

type ApproveState = "idle" | "submitting" | "error";

/**
 * Step-8 effective status drives the 4-button action ribbon. We track
 * this on the client so the UI flips immediately on approve/decline
 * without waiting for a refetch.
 *   sent      → [Decline] [Approve]
 *   approved  → [Decline] [Submit as inquiry]
 *   declined / converted / expired / cancelled → terminal banner
 */
type EffectiveStatus =
  | "sent"
  | "approved"
  | "declined"
  | "converted"
  | "expired"
  | "cancelled";

// ── Root component ───────────────────────────────────────────────────────────

export function PitchLanding({ data }: { data: PitchLandingData }) {
  const { token, pitch, talents, agencyName, brandMarkSvg, viewerSignedIn, registerNextPath } = data;
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
  const [approveState, setApproveState] = useState<ApproveState>("idle");

  // Local effective status — flips on approve / decline so the action
  // ribbon re-paints without a server round-trip.
  const initialEffective: EffectiveStatus = (() => {
    if (pitch.status === "approved") return "approved";
    if (pitch.status === "declined") return "declined";
    if (pitch.status === "converted") return "converted";
    if (pitch.status === "expired") return "expired";
    if (pitch.status === "cancelled") return "cancelled";
    return "sent";
  })();
  const [effectiveStatus, setEffectiveStatus] = useState<EffectiveStatus>(initialEffective);

  useEffect(() => {
    if (viewFired.current) return;
    viewFired.current = true;
    recordPitchViewAction(token).catch(() => {});
  }, [token]);

  const activeTalents = talents.filter((t) => !removedIds.has(t.talentProfileId));
  const isTerminal =
    effectiveStatus === "converted" ||
    effectiveStatus === "declined" ||
    effectiveStatus === "expired" ||
    effectiveStatus === "cancelled" ||
    declineState === "done";

  async function handleRemoveTalent(talentProfileId: string) {
    setRemovedIds((prev) => new Set([...prev, talentProfileId]));
    await removeTalentFromPitchAction(token, talentProfileId);
  }

  async function handleDecline() {
    setDeclineState("submitting");
    const result = await declinePitchAction(token, null);
    if (result.ok) {
      setEffectiveStatus("declined");
    }
    setDeclineState("done");
  }

  async function handleApprove() {
    setApproveState("submitting");
    const result = await approvePitchAction(token);
    if (result.ok) {
      setEffectiveStatus("approved");
      setApproveState("idle");
    } else {
      setApproveState("error");
    }
  }

  const recipient = pitch.recipient_contact ?? {};
  const recipientFirst =
    recipient.name?.trim().split(/\s+/)[0] ?? null;
  const sentDate = pitch.sent_at ?? pitch.created_at;

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#0B0B0D] antialiased">
      {/* Slim brand bar — agency identity, never dominant */}
      <header className="border-b border-[#0B0B0D]/[0.06] bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          {brandMarkSvg ? (
            <div
              className="h-7 w-7 shrink-0 overflow-hidden rounded"
              dangerouslySetInnerHTML={{ __html: brandMarkSvg }}
              aria-hidden
            />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#0F4F3E] text-[11px] font-semibold text-white">
              {agencyName.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="text-[13px] font-semibold tracking-tight">
            {agencyName}
          </p>
          <span className="ml-auto text-[10.5px] font-medium uppercase tracking-[0.18em] text-[#0B0B0D]/45">
            Talent selection
          </span>
        </div>
      </header>

      {/* Editorial hero — personal greeting + lineup count */}
      <section className="border-b border-[#0B0B0D]/[0.06] bg-[#F2F2EE]">
        <div className="mx-auto max-w-3xl px-6 pt-12 pb-10 sm:pt-16 sm:pb-12">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-[#0F4F3E]/70">
            {recipientFirst
              ? `For ${recipient.name}`
              : recipient.company
                ? `For ${recipient.company}`
                : "A curated selection"}
          </p>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[44px]">
            {recipientFirst
              ? `${recipientFirst}, here's the lineup we picked for you.`
              : `Here's the lineup we picked for you.`}
          </h1>
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#0B0B0D]/60">
            <span>{activeTalents.length} talent{activeTalents.length === 1 ? "" : "s"}</span>
            <span aria-hidden className="text-[#0B0B0D]/25">·</span>
            <span>Curated by {agencyName}</span>
            <span aria-hidden className="text-[#0B0B0D]/25">·</span>
            <span>{fmtDate(sentDate)}</span>
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-3xl px-6 pt-10 pb-20 space-y-10 sm:pt-12">
        {/* Terminal state overlays */}
        {effectiveStatus === "converted" && (
          <TerminalBanner
            icon="check"
            title="You've already opened an inquiry from this pitch."
            body="The team will be in touch. No further action needed."
          />
        )}
        {effectiveStatus === "declined" && (
          <TerminalBanner
            icon="x"
            title="You've declined this pitch."
            body={`Reach out to ${agencyName} directly if you change your mind.`}
          />
        )}
        {effectiveStatus === "expired" && (
          <TerminalBanner
            icon="clock"
            title="This pitch has expired."
            body="Contact the agency for updated availability."
          />
        )}

        {/* Personal note — styled as a letter from the agency */}
        {pitch.personal_note && (
          <section className="relative rounded-3xl bg-white px-7 py-7 ring-1 ring-[#0B0B0D]/[0.06] sm:px-10 sm:py-9">
            <span
              aria-hidden
              className="absolute left-6 top-4 select-none text-[64px] font-serif leading-none text-[#0F4F3E]/15 sm:left-8 sm:text-[80px]"
            >
              &ldquo;
            </span>
            <p className="relative whitespace-pre-wrap text-[16px] leading-[1.6] text-[#0B0B0D]/85 sm:text-[17px]">
              {pitch.personal_note}
            </p>
            <p className="mt-5 text-[12.5px] font-medium tracking-tight text-[#0B0B0D]/55">
              — {agencyName}
            </p>
          </section>
        )}

        {/* Event brief — only renders when fields exist */}
        <PitchBriefBlock pitch={pitch} />

        {/* Talent gallery — the hero of the page */}
        {talents.length > 0 && (
          <section>
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0B0B0D]/55">
                The lineup
              </h2>
              <span className="text-[11px] font-medium tabular-nums text-[#0B0B0D]/40">
                {activeTalents.length} of {talents.length}
              </span>
            </div>
            <div
              className="grid grid-cols-1 gap-5 sm:grid-cols-2"
              // Full theme token vars FIRST (family CSS reads --token-color-*),
              // card-design vars second (explicit card colors win).
              style={{
                ...data.designTokenVars,
                ...cardDesignToCssVars(data.cardDesign),
              }}
              {...data.designTokenAttrs}
              data-token-template-directory-card-family={data.cardDesign.family}
              data-card-design-scope=""
            >
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

        {/* CTA section — generous spacing, confident button */}
        {!isTerminal && (
          <section className="space-y-4 pt-2">
            {convertState.phase === "idle" && (
              <div className="rounded-3xl bg-white px-6 py-7 text-center ring-1 ring-[#0B0B0D]/[0.06] sm:px-8 sm:py-9">
                <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-[#0B0B0D]/45">
                  Like the lineup?
                </p>
                <h3 className="mt-2 text-[22px] font-semibold tracking-tight sm:text-[26px]">
                  Let&apos;s start a conversation.
                </h3>
                <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[#0B0B0D]/55">
                  Reply with a few details about your project and {agencyName}{" "}
                  will get back to you with availability and rates.
                </p>
                <button
                  type="button"
                  onClick={() => setConvertState({ phase: "form" })}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0F4F3E] px-7 py-3 text-[14px] font-semibold text-white shadow-sm transition hover:bg-[#093328] active:translate-y-px"
                >
                  Open inquiry
                  <span aria-hidden>→</span>
                </button>
              </div>
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
              <div className="rounded-3xl bg-[#2E7D5B]/8 px-6 py-8 text-center ring-1 ring-[#2E7D5B]/20">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#2E7D5B]/15">
                  <CheckIcon className="h-5 w-5 text-[#1F5D43]" />
                </div>
                <p className="text-[16px] font-semibold tracking-tight text-[#1F5D43]">
                  Inquiry sent
                </p>
                <p className="mt-1 text-[13px] text-[#1F5D43]/85">
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
                    className="text-[12px] text-[#0B0B0D]/40 underline-offset-4 transition hover:text-[#0B0B0D]/70 hover:underline"
                  >
                    Not a fit — decline this pitch
                  </button>
                )}
                {declineState === "confirming" && (
                  <div className="rounded-2xl bg-white px-5 py-5 text-left ring-1 ring-[#0B0B0D]/[0.06]">
                    <p className="text-[14px] font-semibold tracking-tight">
                      Decline this pitch?
                    </p>
                    <p className="mt-1 text-[12.5px] text-[#0B0B0D]/55">
                      {agencyName} will be notified. You can&apos;t undo this.
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={handleDecline}
                        className="rounded-full bg-[#0B0B0D] px-5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[#33303A]"
                      >
                        Yes, decline
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeclineState("idle")}
                        className="rounded-full px-4 py-2 text-[12.5px] font-medium text-[#0B0B0D]/65 transition hover:bg-[#0B0B0D]/[0.04]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {declineState === "submitting" && (
                  <span className="text-[12px] text-[#0B0B0D]/40">Declining…</span>
                )}
              </div>
            )}
          </section>
        )}

        {/* Expiry notice */}
        {pitch.expires_at && !isTerminal && (
          <p className="text-center text-[11px] text-[#0B0B0D]/40">
            This pitch expires on {fmtDate(pitch.expires_at)}.
          </p>
        )}
      </main>

      {/* Footer — refined wordmark */}
      <footer className="border-t border-[#0B0B0D]/[0.06] bg-white">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-1 px-6 py-7 text-center text-[11px] text-[#0B0B0D]/40 sm:flex-row sm:justify-between sm:gap-4 sm:text-left">
          <span>
            Sent by <span className="font-medium text-[#0B0B0D]/70">{agencyName}</span> · {fmtDate(sentDate)}
          </span>
          <span className="tracking-[0.14em] uppercase">
            Powered by <span className="font-semibold text-[#0B0B0D]/70">Tulala</span>
          </span>
        </div>
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

  const fields: Array<{ label: string; value: string }> = [];
  if (hasDate) fields.push({ label: "Date", value: b.event_date as string });
  if (hasLocation) fields.push({ label: "Where", value: b.event_location as string });
  if (hasRate) fields.push({ label: "Rate", value: b.rate_hint as string });

  return (
    <section>
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0B0B0D]/55">
        Event details
      </h2>
      <dl className="grid grid-cols-1 divide-y divide-[#0B0B0D]/[0.06] overflow-hidden rounded-2xl bg-white ring-1 ring-[#0B0B0D]/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {fields.map((f) => (
          <div key={f.label} className="px-5 py-4">
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-[#0B0B0D]/40">
              {f.label}
            </dt>
            <dd className="mt-1.5 text-[14px] font-medium leading-snug text-[#0B0B0D]">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
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
    <article
      className={[
        // `talent-card` + the data-card-* hooks make this tile a legitimate
        // carrier for the tenant's card-family CSS (the grid wrapper above
        // pairs the family attr with data-card-design-scope). The literal
        // colors below remain as var() fallbacks for tenants on the classic
        // default with no pinned colors.
        "talent-card group relative overflow-hidden rounded-2xl ring-1 ring-[#0B0B0D]/[0.06] transition",
        removed ? "opacity-50" : "hover:ring-[#0B0B0D]/[0.12] hover:shadow-[0_6px_24px_rgba(11,11,13,0.06)]",
      ]
        .filter(Boolean)
        .join(" ")}
      // INLINE surface, deliberately: family CSS background rules reference
      // theme vars (--token-color-*) that only exist on tenant storefront
      // hosts — on the hub domain they collapse to transparent and would
      // strand a dark design's warm name color on the light page. Inline
      // style outranks any stylesheet rule, so the tenant surface (or white)
      // is guaranteed under the tokens the wrapper provides.
      style={{ background: "var(--token-card-surface, #ffffff)" }}
    >
      {/* Photo — full-bleed top, 4:5 portrait aspect */}
      <div className="relative aspect-[4/5] overflow-hidden bg-[#F2F2EE]" data-card-media>
        {talent.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={talent.photoUrl}
            alt={talent.displayName}
            className="h-full w-full object-cover object-center transition duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[44px] font-semibold tracking-tight text-[#0B0B0D]/15">
            {talent.displayName.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Remove button — discreet, top-right, only when allowed */}
        {!removed && canRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove from pitch"
            aria-label={`Remove ${talent.displayName}`}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#0B0B0D]/55 opacity-0 ring-1 ring-[#0B0B0D]/[0.08] backdrop-blur-sm transition hover:bg-white hover:text-[#0B0B0D] group-hover:opacity-100 focus:opacity-100"
          >
            <XIcon className="h-3 w-3" />
          </button>
        )}

        {/* Removed overlay */}
        {removed && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
            <span className="rounded-full bg-white px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#0B0B0D]/55 ring-1 ring-[#0B0B0D]/[0.08]">
              Removed
            </span>
          </div>
        )}
      </div>

      {/* Info — display name + meta row + bio + admin note */}
      <div className="flex flex-col gap-2 px-5 py-5" data-card-body>
        <h3 className="text-[17px] font-semibold leading-tight tracking-tight text-[var(--token-card-name-color,#0B0B0D)]">
          {talent.displayName}
        </h3>

        {(height || talent.shortBio) && (
          <div className="space-y-1.5">
            {height && (
              <p className="text-[12px] font-medium tabular-nums tracking-wide text-[var(--token-card-muted,rgba(11,11,13,0.55))]">
                {height}
              </p>
            )}
            {talent.shortBio && (
              <p className="line-clamp-3 text-[13px] leading-[1.55] text-[var(--token-card-muted,rgba(11,11,13,0.65))]">
                {talent.shortBio}
              </p>
            )}
          </div>
        )}

        {talent.adminNote && (
          <div className="mt-2 border-l-2 border-[#0F4F3E]/40 pl-3 py-1">
            <p className="text-[12.5px] italic leading-[1.55] text-[var(--token-card-muted,rgba(11,11,13,0.6))]">
              {talent.adminNote}
            </p>
          </div>
        )}
      </div>
    </article>
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
    <div className="rounded-3xl bg-white px-6 py-7 ring-1 ring-[#0B0B0D]/[0.06] sm:px-8 sm:py-8">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0F4F3E]/70">
          Open inquiry
        </p>
        <h3 className="mt-1.5 text-[20px] font-semibold tracking-tight">
          Tell us a bit about your project
        </h3>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              placeholder="Your name"
              required
              className="w-full rounded-xl bg-[#F2F2EE] px-3.5 py-2.5 text-[14px] text-[#0B0B0D] placeholder-[#0B0B0D]/35 outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-[#0F4F3E]/40 disabled:opacity-50"
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
              className="w-full rounded-xl bg-[#F2F2EE] px-3.5 py-2.5 text-[14px] text-[#0B0B0D] placeholder-[#0B0B0D]/35 outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-[#0F4F3E]/40 disabled:opacity-50"
            />
          </Field>
        </div>
        <Field label="Phone (optional)">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting}
            placeholder="+1 555 000 0000"
            className="w-full rounded-xl bg-[#F2F2EE] px-3.5 py-2.5 text-[14px] text-[#0B0B0D] placeholder-[#0B0B0D]/35 outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-[#0F4F3E]/40 disabled:opacity-50"
          />
        </Field>
        <Field label="Message (optional)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={submitting}
            placeholder="Project, dates, anything we should know…"
            rows={3}
            className="w-full resize-none rounded-xl bg-[#F2F2EE] px-3.5 py-3 text-[14px] leading-relaxed text-[#0B0B0D] placeholder-[#0B0B0D]/35 outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-[#0F4F3E]/40 disabled:opacity-50"
          />
        </Field>

        {state.phase === "error" && (
          <p className="text-[12.5px] text-[#B0303A]">{state.message}</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting || !name.trim() || !email.trim()}
            className="flex-1 rounded-full bg-[#0F4F3E] py-3 text-[14px] font-semibold text-white shadow-sm transition hover:bg-[#093328] active:translate-y-px disabled:opacity-40 disabled:hover:bg-[#0F4F3E]"
          >
            {submitting ? "Sending…" : "Send inquiry"}
          </button>
          {!submitting && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-5 py-3 text-[13px] font-medium text-[#0B0B0D]/60 transition hover:bg-[#0B0B0D]/[0.04]"
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
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0B0B0D]/55">
        {label}
        {required && <span className="ml-1 text-[#0F4F3E]/65">*</span>}
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
    check: "bg-[#2E7D5B]/8 ring-[#2E7D5B]/20 text-[#1F5D43]",
    x: "bg-[#0B0B0D]/[0.04] ring-[#0B0B0D]/[0.10] text-[#0B0B0D]/75",
    clock: "bg-[#C26A45]/10 ring-[#C26A45]/25 text-[#7A4128]",
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
          <p className="text-[14px] font-semibold tracking-tight">{title}</p>
          <p className="mt-0.5 text-[12.5px] opacity-85">{body}</p>
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
