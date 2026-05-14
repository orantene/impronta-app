"use client";

/**
 * NotificationPrefsPanel — B9 (notification preferences UI).
 *
 * Per-event-kind email + push toggles. Saves via the existing
 * `setNotificationPrefs` server action into user_prefs.notification_prefs
 * (schema: 20260914010000_user_prefs_notification_prefs.sql).
 *
 * Defaults are opt-in for transactional events (offers / bookings) and
 * opt-out for nudges (day-of reminders are opt-in too because they're
 * value-add not noise).
 */

import { useState, useTransition } from "react";
import { setNotificationPrefs, type NotificationChannelPrefs } from "@/lib/server-actions/user-prefs";

const FONT = '"Inter", system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  accent: "#1D4ED8",
  success: "#0F5132",
} as const;

const EVENT_KINDS: Array<{
  id: string;
  label: string;
  hint: string;
  defaults: NotificationChannelPrefs;
}> = [
  {
    id: "new_message",
    label: "New messages",
    hint: "When your coordinator or a talent replies on a thread you're on.",
    defaults: { email: true, push: true },
  },
  {
    id: "offer_sent",
    label: "Offer ready to review",
    hint: "A new offer is sent for your approval.",
    defaults: { email: true, push: true },
  },
  {
    id: "payment_request",
    label: "Payment requests",
    hint: "An invoice or balance is requested.",
    defaults: { email: true, push: true },
  },
  {
    id: "booking_confirmed",
    label: "Booking confirmed",
    hint: "When a project is booked and confirmed.",
    defaults: { email: true, push: false },
  },
  {
    id: "day_of_reminder",
    label: "Day-of reminders",
    hint: "Call sheet recap the morning of the event.",
    defaults: { email: true, push: true },
  },
];

export function NotificationPrefsPanel({
  initialPrefs,
}: {
  initialPrefs: Record<string, NotificationChannelPrefs>;
}) {
  const [prefs, setPrefs] = useState<Record<string, NotificationChannelPrefs>>(() => {
    // Seed any missing kind with its default so the UI starts fully populated.
    const seeded: Record<string, NotificationChannelPrefs> = { ...initialPrefs };
    for (const k of EVENT_KINDS) {
      if (!seeded[k.id]) seeded[k.id] = k.defaults;
    }
    return seeded;
  });
  const [, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function toggle(kindId: string, channel: "email" | "push") {
    const next: Record<string, NotificationChannelPrefs> = {
      ...prefs,
      [kindId]: {
        ...prefs[kindId],
        [channel]: !prefs[kindId][channel],
      },
    };
    setPrefs(next);
    // Fire-and-forget save. Server action upserts user_prefs.
    startTransition(async () => {
      await setNotificationPrefs(next);
      setSavedAt(Date.now());
    });
  }

  return (
    <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      {/* Column headers */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          paddingBottom: 8,
          borderBottom: `1px solid ${C.borderSoft}`,
          fontSize: 10.5,
          fontWeight: 700,
          color: C.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        <div style={{ flex: 1 }}>Event</div>
        <div style={{ width: 70, textAlign: "center" }}>Email</div>
        <div style={{ width: 70, textAlign: "center" }}>Push</div>
      </div>

      {EVENT_KINDS.map((kind) => {
        const p = prefs[kind.id] ?? kind.defaults;
        return (
          <div
            key={kind.id}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 0",
              borderBottom: `1px solid ${C.borderSoft}`,
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{kind.label}</div>
              <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.5 }}>
                {kind.hint}
              </div>
            </div>
            <div style={{ width: 70, display: "flex", justifyContent: "center" }}>
              <Toggle on={p.email} onClick={() => toggle(kind.id, "email")} ariaLabel={`${kind.label} email`} />
            </div>
            <div style={{ width: 70, display: "flex", justifyContent: "center" }}>
              <Toggle on={!!p.push} onClick={() => toggle(kind.id, "push")} ariaLabel={`${kind.label} push`} />
            </div>
          </div>
        );
      })}

      <div
        aria-live="polite"
        style={{
          marginTop: 12,
          fontSize: 11.5,
          color: savedAt ? C.success : C.inkDim,
          textAlign: "right",
          minHeight: 16,
        }}
      >
        {savedAt ? "Preferences saved." : "Changes auto-save."}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, ariaLabel }: { on: boolean; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        background: on ? C.accent : "rgba(11,11,13,0.18)",
        border: "none",
        position: "relative",
        cursor: "pointer",
        transition: "background 120ms",
        padding: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
          transition: "left 140ms",
        }}
      />
    </button>
  );
}
