"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/events — Phase 1d body chunk.
// Owns: TalentHubDetailDrawer, TalentAddEventDrawer.
// Private helpers: ModePicker, ModePickerCard, LogWorkForm, BlockTimeForm.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { AVAILABLE_CHANNELS, COLORS, FONTS, TALENT_CHANNELS, TRANSITION, useAdminShell } from "../state";
import {
  DrawerShell,
  FieldRow,
  Icon,
  SecondaryButton,
  TextArea,
  TextInput,
} from "../primitives";
import { KvRow, SubsectionLabel } from "./shared";

// ─── Add event (manual booking / block) ─────────────────────────────
//
// Talents have lives outside the platform — full-time jobs, school,
// vacation, friend's photo shoots, repeat clients they've worked with
// for years. Tulala becomes their booking manager only if they can
// log ALL of it here — not just Tulala-routed gigs.
//
// Two flows, one entry point:
//   work    → off-platform booking. Earnings row + calendar event +
//             coral "Off-platform" source chip when surfaced later.
//             Quick form (3 fields, 5 seconds) by default; advanced
//             toggle reveals location / time / contact / brief / notes.
//   block   → calendar block for non-work. Reason taxonomy: travel /
//             personal / other job / family / other. Doesn't count as
//             earnings, doesn't fight booking pitches the way "paused"
//             availability does — it's a single window.
//
// In production this also feeds tax exports (talent self-reports
// off-platform income) and powers the "convert to Tulala-tracked"
// suggestion when a manual client name matches a verified Tulala
// client identity.

type AddEventMode = "pick" | "work" | "block";

// ─── A3: Hub-detail mini-drawer ─────────────────────────────────────
//
// Opens when a talent clicks "+ Add" on an unjoined channel in Reach.
// Shows the channel's terms, fees, expected response time BEFORE the
// talent commits. Avoids the "I joined this and now I'm spammed" problem.

export function TalentHubDetailDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-hub-detail";
  const channelId = (state.drawer.payload?.channelId as string) ?? "";
  const channel =
    TALENT_CHANNELS.find((c) => c.id === channelId) ??
    AVAILABLE_CHANNELS.find((c) => c.id === channelId) ??
    null;

  if (!channel) return null;

  const feePct = channel.feeRate ? Math.round(channel.feeRate * 100) : 0;
  const responseTime =
    channel.kind === "studio"
      ? "1–3 weeks (slow but high-quality leads)"
      : channel.verified
        ? "Within 24h for most inquiries"
        : "Variable — newer platform, less data";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={channel.name}
      description={`${channel.kind === "studio" ? "Studio · free book" : channel.verified ? "Verified external hub" : "External hub · not yet Tulala-verified"} · joining is reversible`}
      width={520}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONTS.body }}>
        {channel.description && (
          <div style={{ padding: "12px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.55 }} className="bg-admin-surface-alt text-admin-ink">
            {channel.description}
          </div>
        )}

        <section>
          <SubsectionLabel>The deal</SubsectionLabel>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <KvRow label="Fee rate" value={feePct === 0 ? "0% · no platform take" : `${feePct}% on bookings via ${channel.name}`} />
            <KvRow label="Response time" value={responseTime} />
            <KvRow
              label="Verified"
              value={
                channel.verified ? "Yes — Tulala-vetted" : "No — newer / unverified"
              }
            />
            <KvRow label="Reversible?" value="Yes — toggle off anytime in Reach" />
          </div>
        </section>

        <section>
          <SubsectionLabel>What happens when you join</SubsectionLabel>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }} className="text-admin-ink">
            <li>{channel.name} can list your profile + forward inquiries</li>
            <li>Inquiries land in your Tulala inbox alongside agency-routed ones</li>
            <li>Your contact-policy filters still apply — Basic-tier clients are blocked if you&apos;ve blocked them</li>
            {feePct > 0 && (
              <li>
                When a booking comes through {channel.name}, they take {feePct}% of the fee at payout
              </li>
            )}
            <li>You can pause or leave any time from Reach</li>
          </ul>
        </section>

        {!channel.verified && (
          <div style={{ padding: "10px 12px", border: `1px solid rgba(194,106,69,0.18)`, borderRadius: 8, fontSize: 11.5, lineHeight: 1.5 }} className="bg-admin-coral-soft text-admin-coral-deep">
            <strong className="font-semibold">Heads up:</strong>{" "}
            {channel.name} isn&apos;t yet Tulala-verified. Inquiries may include
            unvetted clients. You can leave with one click if quality drops.
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

export function TalentAddEventDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-add-event";
  const initialMode = (state.drawer.payload?.mode as AddEventMode | undefined) ?? "pick";
  const [mode, setMode] = useState<AddEventMode>(initialMode);

  // Reset to picker when drawer reopens with no mode (open from a generic CTA)
  // — but if reopened with a specific mode (e.g., from a "Block dates" link),
  // honor that.
  // Note: state.drawer.payload changes don't auto-reset useState; this only
  // matters on first mount.

  return (
    <DrawerShell
      open={open}
      onClose={() => {
        setMode("pick");
        closeDrawer();
      }}
      title={
        mode === "pick"
          ? "Add to your calendar"
          : mode === "work"
            ? "Log work"
            : "Block time"
      }
      description={
        mode === "pick"
          ? "Track your booking life — even when the gig didn't come through Tulala."
          : mode === "work"
            ? "Off-platform booking? Log it here so it counts toward your earnings + history."
            : "Block your calendar so agencies don't pitch you when you're unavailable."
      }
      width={540}
      footer={
        mode === "pick" ? (
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
        ) : undefined // forms own their own footers
      }
    >
      {mode === "pick" && (
        <ModePicker
          onPick={(m) => setMode(m)}
        />
      )}
      {mode === "work" && (
        <div className="flex flex-col gap-4">
          <div style={{ padding: "20px 16px", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, fontFamily: FONTS.body, textAlign: "center" }} className="bg-admin-surface-alt">
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }} className="text-admin-ink">
              Booking log — coming soon
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55 }} className="text-admin-ink-muted">
              Off-platform booking tracking will be available in an upcoming update.
            </div>
          </div>
          <SecondaryButton onClick={() => setMode("pick")}>Back</SecondaryButton>
        </div>
      )}
      {mode === "block" && (
        <div className="flex flex-col gap-4">
          <div style={{ padding: "20px 16px", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, fontFamily: FONTS.body, textAlign: "center" }} className="bg-admin-surface-alt">
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }} className="text-admin-ink">
              Block time — coming soon
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55 }} className="text-admin-ink-muted">
              Calendar blocking will be available in an upcoming update.
            </div>
          </div>
          <SecondaryButton onClick={() => setMode("pick")}>Back</SecondaryButton>
        </div>
      )}
    </DrawerShell>
  );
}

/** Mode picker — two big choices, clear contracts. */
function ModePicker({ onPick }: { onPick: (m: "work" | "block") => void }) {
  return (
    <div className="flex flex-col gap-3">
      <ModePickerCard
        kind="work"
        title="Log work"
        body="A booking you did (or will do) outside Tulala. Adds to your earnings + calendar."
        meta="Quick add or full details"
        toneFg={COLORS.green}
        toneBg={COLORS.successSoft}
        icon="credit"
        onPick={() => onPick("work")}
      />
      <ModePickerCard
        kind="block"
        title="Block time"
        body="Vacation, day job, school, family — anything that means you're not available. Won't count as earnings."
        meta="Reason + date range"
        toneFg={COLORS.amber}
        toneBg={COLORS.amberSoft}
        icon="lock"
        onPick={() => onPick("block")}
      />
    </div>
  );
}

function ModePickerCard({
  title,
  body,
  meta,
  toneFg,
  toneBg,
  icon,
  onPick,
}: {
  kind: "work" | "block";
  title: string;
  body: string;
  meta: string;
  toneFg: string;
  toneBg: string;
  icon: "credit" | "lock";
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        width: "100%",
        padding: "16px 18px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: `border-color ${TRANSITION.micro}, transform ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: toneBg,
          color: toneFg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} stroke={1.7} />
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.05 }} className="text-admin-ink">
          {title}
        </div>
        <div style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {body}
        </div>
        <div style={{ fontSize: 11, marginTop: 6, fontWeight: 500, letterSpacing: 0.3, textTransform: "uppercase" }} className="text-admin-ink-dim">
          {meta}
        </div>
      </div>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}

/** Log work form — Quick by default, Advanced on toggle. */
function LogWorkForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (data: {
    client: string;
    date: string;
    amount: string;
    advanced: boolean;
  }) => void;
}) {
  const [client, setClient] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("€");
  const [advanced, setAdvanced] = useState(false);
  const [brief, setBrief] = useState("");
  const [location, setLocation] = useState("");
  const [callTime, setCallTime] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [delivered, setDelivered] = useState("");
  // A1: Team-mates — comma-separated names of others on the booking.
  // Free text in v1; production should autocomplete from talent network.
  const [teamMates, setTeamMates] = useState("");
  const [iBroughtTeam, setIBroughtTeam] = useState(false);
  // A2: Payment method picker.
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "card" | "cash" | "in-kind" | "mixed" | "">("");
  const [paymentNote, setPaymentNote] = useState("");

  const canSave = client.trim().length > 0 && date.trim().length > 0;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Quick fields — always visible. The MVP for one-tap logging. */}
        <section>
          <SubsectionLabel>The basics</SubsectionLabel>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
            <FieldRow label="Client" hint="Who paid you. Free text — they don't have to be on Tulala.">
              <TextInput
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="e.g. Friend's brand · Studio Roca · Old colleague"
              />
            </FieldRow>
            <FieldRow label="Date" hint="When you worked.">
              <TextInput
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="May 12, 2026  or  May 12–13"
              />
            </FieldRow>
            <FieldRow label="Amount" hint="What you earned. Optional if you haven't been paid yet.">
              <div className="flex gap-2">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{
                    background: "#fff",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: "0 10px",
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    color: COLORS.ink,
                    cursor: "pointer",
                    minWidth: 64,
                  }}
                >
                  <option>€</option>
                  <option>£</option>
                  <option>$</option>
                  <option>¥</option>
                  <option>—</option>
                </select>
                <div className="flex-1">
                  <TextInput
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="1,800"
                  />
                </div>
              </div>
            </FieldRow>
          </div>
        </section>

        {/* Advanced toggle — on by talent's choice */}
        <button
          type="button"
          onClick={() => setAdvanced((o) => !o)}
          aria-expanded={advanced}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            padding: 0,
            color: COLORS.ink,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          <Icon
            name="chevron-down"
            size={11}
            stroke={2}
            color={COLORS.ink}
          />
          <span
            style={{
              transform: advanced ? "none" : "none",
            }}
          >
            {advanced ? "Hide details" : "Add details (location, time, contact, deliverables)"}
          </span>
        </button>

        {advanced && (
          <section>
            <SubsectionLabel>Details</SubsectionLabel>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
              <FieldRow label="Brief" hint="What was the job?">
                <TextInput
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="e.g. Lookbook · spring capsule · 1 day"
                />
              </FieldRow>
              <FieldRow label="Location">
                <TextInput
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City · studio or address"
                />
              </FieldRow>
              <FieldRow label="Call time">
                <TextInput
                  value={callTime}
                  onChange={(e) => setCallTime(e.target.value)}
                  placeholder="08:30 — 18:00"
                />
              </FieldRow>
              <FieldRow label="Contact" optional hint="Producer / photographer / who to message after.">
                <TextInput
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Name · email or phone"
                />
              </FieldRow>
              <FieldRow label="Delivered" optional hint="Comma-separated list of deliverables.">
                <TextInput
                  value={delivered}
                  onChange={(e) => setDelivered(e.target.value)}
                  placeholder="8 looks, hero image, BTS carousel"
                />
              </FieldRow>
              <FieldRow
                label="Other talent on the booking"
                optional
                hint="Names — comma-separated. Useful when you brought a friend or worked as a team."
              >
                <TextInput
                  value={teamMates}
                  onChange={(e) => setTeamMates(e.target.value)}
                  placeholder="Carla Vega, Tomás Navarro"
                />
              </FieldRow>
              {teamMates.trim().length > 0 && (
                <FieldRow
                  label=""
                  optional
                  hint=""
                >
                  <button
                    type="button"
                    onClick={() => setIBroughtTeam((b) => !b)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "10px 12px",
                      background: iBroughtTeam ? COLORS.coralSoft : "#fff",
                      border: `1px solid ${iBroughtTeam ? "rgba(194,106,69,0.30)" : COLORS.border}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: iBroughtTeam ? COLORS.coral : "transparent",
                        border: `1.5px solid ${iBroughtTeam ? COLORS.coral : COLORS.border}`,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {iBroughtTeam && <Icon name="check" size={10} stroke={2.5} color="#fff" />}
                    </span>
                    <div className="flex-1">
                      <div className="text-admin-ink text-admin-12h font-medium">
                        I brought them
                      </div>
                      <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
                        Marks you as the de-facto coordinator. Surfaces a &quot;You brought {teamMates.split(",")[0]?.trim()}&quot; tag in your booking history.
                      </div>
                    </div>
                  </button>
                </FieldRow>
              )}
              <FieldRow
                label="Payment method"
                optional
                hint="How you got paid. Tax-relevant — especially in-kind / gifts."
              >
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { id: "transfer", label: "Transfer" },
                    { id: "cash", label: "Cash · efectivo" },
                    { id: "card", label: "Card" },
                    { id: "in-kind", label: "In-kind · gift" },
                    { id: "mixed", label: "Mixed" },
                  ] as const).map((m) => {
                    const active = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(active ? "" : m.id)}
                        style={{
                          padding: "6px 11px",
                          borderRadius: 999,
                          background: active ? COLORS.fill : "#fff",
                          border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                          cursor: "pointer",
                          fontFamily: FONTS.body,
                          fontSize: 12,
                          fontWeight: 500,
                          color: active ? "#fff" : COLORS.ink,
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </FieldRow>
              {(paymentMethod === "in-kind" || paymentMethod === "mixed") && (
                <FieldRow
                  label="Payment note"
                  optional
                  hint="Describe the in-kind value or the mixed-method split."
                >
                  <TextInput
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder={
                      paymentMethod === "in-kind"
                        ? "e.g. Bvlgari watch · est €1,200"
                        : "e.g. 60% transfer + 40% product"
                    }
                  />
                </FieldRow>
              )}
              <FieldRow label="Notes" optional>
                <TextArea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything you want to remember about this job."
                  rows={3}
                />
              </FieldRow>
            </div>
          </section>
        )}

        {/* Off-platform note — sets expectations on what this means. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", border: `1px solid rgba(194,106,69,0.18)`, borderRadius: 8, fontFamily: FONTS.body, fontSize: 11.5, lineHeight: 1.55 }} className="bg-admin-coral-soft text-admin-coral-deep">
          <Icon name="info" size={11} stroke={1.7} />
          <span>
            <strong>Off-platform booking</strong> — visible only to you. Adds to your earnings,
            calendar and history. Not shared with agencies unless you choose to.
          </span>
        </div>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 24,
          marginLeft: -24,
          marginRight: -24,
          padding: "12px 24px",
          background: "#fff",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <SecondaryButton onClick={onCancel}>Back</SecondaryButton>
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave({
              client: client.trim(),
              date: date.trim(),
              amount: amount ? `${currency}${amount.trim()}` : "",
              advanced,
            })
          }
          style={{
            background: canSave ? COLORS.fill : "rgba(11,11,13,0.20)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          Log booking
        </button>
      </div>
    </>
  );
}

/** Block time form — date range + reason taxonomy. */
function BlockTimeForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (data: { from: string; to: string; reason: string; note: string }) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");

  const reasonOptions: { id: string; label: string; hint: string }[] = [
    { id: "travel", label: "Travel", hint: "Flight, holiday, between cities" },
    { id: "personal", label: "Personal", hint: "Time off, recovery, life" },
    { id: "other-job", label: "Other job", hint: "Day job, school, recurring shift" },
    { id: "family", label: "Family", hint: "Wedding, illness, kid's event" },
    { id: "audition", label: "Audition / casting", hint: "Off-platform casting prep" },
    { id: "other", label: "Other", hint: "" },
  ];

  const canSave = from.trim().length > 0 && reason.trim().length > 0;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <section>
          <SubsectionLabel>When</SubsectionLabel>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
            <FieldRow label="From">
              <TextInput
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="May 22, 2026"
              />
            </FieldRow>
            <FieldRow label="To" optional hint="Leave blank for a single day.">
              <TextInput
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="May 26, 2026"
              />
            </FieldRow>
          </div>
        </section>

        <section>
          <SubsectionLabel>Reason</SubsectionLabel>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 10,
            }}
          >
            {reasonOptions.map((r) => {
              const active = reason === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 11px",
                    borderRadius: 999,
                    background: active ? COLORS.fill : "#fff",
                    border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: active ? "#fff" : COLORS.ink,
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {reason && (
            <div style={{ marginTop: 8, fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">
              {reasonOptions.find((r) => r.id === reason)?.hint}
            </div>
          )}
        </section>

        <section>
          <SubsectionLabel>Note for your agencies</SubsectionLabel>
          <div style={{ fontSize: 11.5, marginTop: 4, marginBottom: 10 }} className="text-admin-ink-muted">
            Optional. They see this when they try to pitch you on a blocked date.
          </div>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Annual family trip · back full availability May 27"
          />
        </section>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 24,
          marginLeft: -24,
          marginRight: -24,
          padding: "12px 24px",
          background: "#fff",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <SecondaryButton onClick={onCancel}>Back</SecondaryButton>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => onSave({ from, to, reason, note })}
          style={{
            background: canSave ? COLORS.fill : "rgba(11,11,13,0.20)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          Block time
        </button>
      </div>
    </>
  );
}
