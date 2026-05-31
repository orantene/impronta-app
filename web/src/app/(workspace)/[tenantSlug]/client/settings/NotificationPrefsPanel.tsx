"use client";

/**
 * NotificationPrefsPanel — per-category notification preferences (spec §6).
 *
 * This is the surface the notification engine actually honors. The dispatcher
 * resolves channels per *category* (`lib/notifications/prefs.ts` →
 * `getCategoryPrefs` / `channelsForRecipient`), reading
 * `user_prefs.notification_prefs[category]`. This panel writes exactly that
 * shape via `setCategoryNotificationPrefs`, so every toggle here maps 1:1 to a
 * real dispatch decision.
 *
 * Honesty rules baked in:
 *  - The dispatcher is strictly *subtractive*: it starts from each catalog
 *    entry's default channels and only drops the ones a user set to `false`.
 *    A user can't turn ON a channel the catalog never sends. So we render a
 *    toggle only for a category's live default channels (passed as `channels`
 *    from the server). No dead toggles.
 *  - Required categories (account & security, billing) bypass prefs entirely —
 *    they render locked "Always on", never a toggle.
 *
 * The category list is supplied by the server page (categories.ts is
 * server-only and can't be imported into a client component).
 */

import { useState, useTransition } from "react";
import { setCategoryNotificationPrefs } from "@/lib/server-actions/user-prefs";

/** Live channels a category preference can carry. Mirrors `LIVE_CHANNELS`. */
export type UiChannel = "email" | "in_app";

/** Serializable category descriptor handed down from the server page. */
export type UiCategory = {
  id: string;
  label: string;
  description: string;
  required: boolean;
  /** Live default channels for this category (already ∩ LIVE_CHANNELS). */
  channels: UiChannel[];
};

const FONT = '"Inter", system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  accent: "#1D4ED8",
  success: "#0F5132",
  lockBg: "rgba(11,11,13,0.04)",
} as const;

const CHANNEL_LABEL: Record<UiChannel, string> = {
  email: "Email",
  in_app: "In-app",
};

type ChannelState = Record<UiChannel, boolean>;

function readBool(raw: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

/**
 * Resolve the initial toggle state for one category, mirroring the
 * dispatcher's `getCategoryPrefs` semantics: a stored explicit boolean wins;
 * otherwise the channel falls back to "on" iff it's a default channel.
 * Accepts the legacy `inApp` key alongside canonical `in_app`.
 */
function seedCategory(cat: UiCategory, stored: unknown): ChannelState {
  const raw = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : null;
  const emailDefault = cat.channels.includes("email");
  const inAppDefault = cat.channels.includes("in_app");
  return {
    email: raw ? readBool(raw, "email") ?? emailDefault : emailDefault,
    in_app: raw ? readBool(raw, "in_app", "inApp") ?? inAppDefault : inAppDefault,
  };
}

export function NotificationPrefsPanel({
  categories,
  initialPrefs,
}: {
  categories: UiCategory[];
  initialPrefs: Record<string, unknown>;
}) {
  // Required categories always render (locked). Non-required render only when
  // they have at least one live default channel — otherwise there's nothing to
  // toggle (e.g. marketing, default channels []).
  const visible = categories.filter((c) => c.required || c.channels.length > 0);

  const [prefs, setPrefs] = useState<Record<string, ChannelState>>(() => {
    const seeded: Record<string, ChannelState> = {};
    for (const cat of visible) seeded[cat.id] = seedCategory(cat, initialPrefs[cat.id]);
    return seeded;
  });
  const [, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function toggle(cat: UiCategory, channel: UiChannel) {
    if (cat.required) return; // locked — defensive, the UI renders no toggle
    const current = prefs[cat.id];
    const updated: ChannelState = { ...current, [channel]: !current[channel] };
    setPrefs((p) => ({ ...p, [cat.id]: updated }));
    // Fire-and-forget; the server action merges only this category's key.
    startTransition(async () => {
      await setCategoryNotificationPrefs({ [cat.id]: updated });
      setSavedAt(Date.now());
    });
  }

  return (
    <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      {visible.map((cat, i) => {
        const state = prefs[cat.id];
        return (
          <div
            key={cat.id}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "13px 0",
              borderTop: i === 0 ? "none" : `1px solid ${C.borderSoft}`,
              gap: 16,
            }}
          >
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{cat.label}</div>
              <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.5 }}>
                {cat.description}
              </div>
            </div>

            {cat.required ? (
              <LockedPill />
            ) : (
              <div style={{ display: "flex", gap: 4 }}>
                {cat.channels.map((ch) => (
                  <ChannelControl
                    key={ch}
                    label={CHANNEL_LABEL[ch]}
                    on={state[ch]}
                    onClick={() => toggle(cat, ch)}
                    ariaLabel={`${cat.label} — ${CHANNEL_LABEL[ch]}`}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div
        aria-live="polite"
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${C.borderSoft}`,
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

function ChannelControl({
  label,
  on,
  onClick,
  ariaLabel,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <div
      style={{
        width: 62,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <Toggle on={on} onClick={onClick} ariaLabel={ariaLabel} />
    </div>
  );
}

function LockedPill() {
  return (
    <span
      title="Required for your account — always sent."
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        color: C.inkMuted,
        background: C.lockBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 999,
        padding: "4px 10px",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6 10V8a6 6 0 1 1 12 0v2m-9 0h6a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Always on
    </span>
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
