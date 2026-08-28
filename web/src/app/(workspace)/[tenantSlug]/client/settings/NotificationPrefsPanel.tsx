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
import { useT } from "@/i18n/use-t";
import { setCategoryNotificationPrefs } from "@/lib/server-actions/user-prefs";
import { PushSubscribeControl } from "@/components/support/PushSubscribeControl";

/** Live channels a category preference can carry. Mirrors `LIVE_CHANNELS` minus owner-only WhatsApp. */
export type UiChannel = "email" | "in_app" | "push";

/** Serializable category descriptor handed down from the server page. */
export type UiCategory = {
  id: string;
  /** English fallback (see categories.ts). */
  label: string;
  /** English fallback (see categories.ts). */
  description: string;
  /** Localized display path for `label`. */
  labelKey?: string;
  /** Localized display path for `description`. */
  descriptionKey?: string;
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

// English stays as the non-UI fallback; the key is the localized display path.
const CHANNEL_LABEL: Record<UiChannel, string> = {
  email: "Email",
  in_app: "In-app",
  push: "Push",
};

const CHANNEL_LABEL_KEY: Record<UiChannel, string> = {
  email: "client.settings.channelEmail",
  in_app: "client.settings.channelInApp",
  push: "client.settings.channelPush",
};

type ChannelState = Record<UiChannel, boolean>;

/** Resolve a localized string, falling back to the English constant. */
function resolve(t: (key: string) => string, key: string | undefined, fallback: string): string {
  if (!key) return fallback;
  const out = t(key);
  return out === key ? fallback : out;
}

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
  const pushDefault = cat.channels.includes("push");
  return {
    email: raw ? readBool(raw, "email") ?? emailDefault : emailDefault,
    in_app: raw ? readBool(raw, "in_app", "inApp") ?? inAppDefault : inAppDefault,
    push: raw ? readBool(raw, "push") ?? pushDefault : pushDefault,
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
  const t = useT();
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "4px 0 14px" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>
            {t("dashboard.platform.support.pushCardTitle")}
          </div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
            {t("dashboard.platform.support.pushCardBody")}
          </div>
        </div>
        <PushSubscribeControl tone="light" />
      </div>
      {visible.map((cat, i) => {
        const state = prefs[cat.id];
        const catLabel = resolve(t, cat.labelKey, cat.label);
        const catDescription = resolve(t, cat.descriptionKey, cat.description);
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
              <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{catLabel}</div>
              <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.5 }}>
                {catDescription}
              </div>
            </div>

            {cat.required ? (
              <LockedPill />
            ) : (
              <div style={{ display: "flex", gap: 4 }}>
                {cat.channels.map((ch) => {
                  const resolved = t(CHANNEL_LABEL_KEY[ch]);
                  const channelLabel =
                    resolved === CHANNEL_LABEL_KEY[ch] ? CHANNEL_LABEL[ch] : resolved;
                  return (
                    <ChannelControl
                      key={ch}
                      label={channelLabel}
                      on={state[ch]}
                      onClick={() => toggle(cat, ch)}
                      ariaLabel={`${catLabel} · ${channelLabel}`}
                    />
                  );
                })}
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
        {savedAt ? t("client.settings.prefsSaved") : t("client.settings.prefsAutoSave")}
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
  const t = useT();
  return (
    <span
      title={t("client.settings.alwaysOnTitle")}
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
      {t("client.settings.alwaysOn")}
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
