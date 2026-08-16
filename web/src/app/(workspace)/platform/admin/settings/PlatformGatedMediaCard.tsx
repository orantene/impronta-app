"use client";

import { useState, useTransition } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { updatePlatformGatedMedia } from "@/lib/server-actions/admin-platform-gated-media";
import type { PrivateMediaAccessState } from "@/lib/media/private-access";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

/**
 * Super-admin switch for gated media access.
 *
 * HONEST ABOUT A TWO-PART STATE. Turning this on is necessary but not
 * sufficient: the feature also needs `MEDIA_URL_SIGNING_SECRET` in the
 * environment, which no admin UI can set (whoever could write it could mint
 * media URLs for any tenant). Production today has the secret missing, so
 * "switch on, secret absent" is the state the owner will actually see, and
 * painting it as a green check would be a lie about whether photos are
 * protected. The status line therefore reads off `state.reason`, which the
 * resolver computed from all three inputs, rather than off the checkbox.
 *
 * The environment can also override the switch in both directions
 * (`MEDIA_PRIVATE_ACCESS_ENABLED=0` kills the feature without a database
 * write, `=1` forces it on). When it does, the checkbox stays editable so the
 * intended value can be recorded for when the override is removed, and a
 * banner says plainly that the switch is not the thing deciding right now.
 *
 * WHY THE DEPTH IS IN A POPOVER. The full explanation (public addresses
 * outliving a revoke, the 5-minute lag, "this does not change who may see
 * what", the secret, the env override) is five paragraphs, and five paragraphs
 * sitting open in a settings grid is a wall nobody reads. It now lives behind
 * the small info button in the status row. What must NOT move behind a click is
 * the honest-state signal: the status pill and its reason line stay on the card
 * face, because a card that has to be opened to admit it is doing nothing is
 * the same lie as a green check.
 *
 * The popover is the shared `@/components/ui/popover` (Radix) that
 * `AdminHelpPopover` is built on, so click, tap, Enter/Space, Escape,
 * click-outside, focus return and `aria-expanded`/`aria-controls` all come from
 * the primitive rather than from a hand-rolled hover box. Only the skin is
 * local: `AdminHelpPopover`'s own skin is a gold icon on shadcn `text-
 * foreground`/`bg-popover`, and this surface is the HQ dark card, where those
 * tokens render ink-on-ink. Radix portals the content to `document.body`, which
 * is also what keeps it out of the card's clipping box.
 */

/**
 * Dark HQ card palette. Deliberately no gold, amber, or orange anywhere. The
 * "not active" red and the plain "off" slate are the SAME weight and size as
 * the active green, so an inactive state never shouts louder than a live one.
 */
const TONE = {
  active: "#5DD3A0",
  activeBg: "rgba(93,211,160,0.12)",
  blocked: "#EF6E6E",
  blockedBg: "rgba(239,110,110,0.12)",
  off: "#9BA8B7",
  offBg: "rgba(155,168,183,0.14)",
  overrideInk: "#93B0F7",
  overrideBg: "rgba(44,95,219,0.14)",
  overrideBorder: "rgba(44,95,219,0.38)",
  hint: "#8A8A96",
  // Info affordance. Deliberately quieter than the pill it sits next to: it is
  // a way to read more, not a state, and a secondary control must never shout
  // louder than the primary one.
  infoInk: "#9AA6B8",
  infoInkLit: "#C7D3E6",
  infoBorder: "rgba(255,255,255,0.16)",
  infoBorderLit: "rgba(44,95,219,0.70)",
  // Popover skin. Portalled to document.body, so it cannot inherit the HQ card
  // and has to carry its own ground.
  sheetBg: "#1C1C21",
  sheetBorder: "rgba(255,255,255,0.13)",
  sheetInk: "#F5F2EB",
  sheetInkMuted: "rgba(245,242,235,0.70)",
} as const;

/**
 * The "what is this" affordance: a 20px round button carrying an "i", opening
 * the long explanation.
 *
 * Open on CLICK, not hover. A hover-only tip is unreachable on a touch screen
 * and awkward with a keyboard, and Radix's Popover gives click, tap, Enter,
 * Space and Escape for free. The visible glyph is drawn with `aria-hidden` SVG
 * and the button carries a real text label, so a screen reader announces the
 * purpose rather than the letter "i".
 */
function GatedMediaExplainer({ minutes }: { minutes: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const lit = open || hover;

  const paragraph = {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.55,
    color: TONE.sheetInkMuted,
  } as const;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={t("dashboard.platform.settings.gatedMediaExplainerOpen")}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          flexShrink: 0,
          borderRadius: 999,
          border: `1px solid ${lit ? TONE.infoBorderLit : TONE.infoBorder}`,
          background: lit ? TONE.overrideBg : "transparent",
          color: lit ? TONE.infoInkLit : TONE.infoInk,
          cursor: "pointer",
          padding: 0,
          lineHeight: 0,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M8 7.1v4.1"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="8" cy="4.7" r="0.95" fill="currentColor" />
        </svg>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="w-[360px] max-w-[calc(100vw-32px)] rounded-xl p-0 shadow-xl"
        style={{
          background: TONE.sheetBg,
          border: `1px solid ${TONE.sheetBorder}`,
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 9,
            padding: 14,
            // Radix hands us the space actually left between the trigger and
            // the viewport edge on whichever side it chose. Clamping to it is
            // what stops the panel running off the bottom of a short window:
            // measured open at 1280x720 with the card mid-page, the unclamped
            // panel ended 85px past the fold. Below that height it scrolls
            // instead of being cut off. The 520 ceiling keeps it from becoming
            // a full-height column on a tall monitor.
            maxHeight: "min(520px, var(--radix-popover-content-available-height, 520px))",
            overflowY: "auto",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: TONE.sheetInk,
              lineHeight: 1.35,
            }}
          >
            {t("dashboard.platform.settings.gatedMediaExplainerTitle")}
          </p>
          <p style={paragraph}>
            {t("dashboard.platform.settings.gatedMediaExplainerToday")}
          </p>
          <p style={paragraph}>
            {interpolate(t("dashboard.platform.settings.gatedMediaExplainerOn"), { minutes })}
          </p>
          <p style={paragraph}>
            {t("dashboard.platform.settings.gatedMediaExplainerScope")}
          </p>
          <p style={paragraph}>
            {t("dashboard.platform.settings.gatedMediaExplainerSecret")}
          </p>
          <p style={paragraph}>
            {t("dashboard.platform.settings.gatedMediaExplainerOverride")}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PlatformGatedMediaCard({
  current,
  revocationLagMinutes,
}: {
  current: PrivateMediaAccessState;
  revocationLagMinutes: number;
}) {
  const t = useT();
  const [enabled, setEnabled] = useState(current.settingEnabled);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const dirty = enabled !== current.settingEnabled;

  const save = () => {
    setStatus(null);
    startTransition(async () => {
      const r = await updatePlatformGatedMedia({ enabled });
      setStatus(
        r.ok
          ? { ok: true, msg: t("dashboard.platform.settings.gatedMediaSaved") }
          : {
              ok: false,
              msg: interpolate(t("dashboard.platform.settings.failed"), { error: r.error }),
            },
      );
    });
  };

  // One row per reason, spelled out with literal keys so the card cannot drift
  // from the resolver's verdict and so the i18n key scanners can see them.
  const badge =
    current.reason === "active"
      ? {
          ink: TONE.active,
          bg: TONE.activeBg,
          label: t("dashboard.platform.settings.gatedMediaStatusActive"),
        }
      : current.reason === "missing_secret"
        ? {
            ink: TONE.blocked,
            bg: TONE.blockedBg,
            label: t("dashboard.platform.settings.gatedMediaStatusNotActive"),
          }
        : {
            ink: TONE.off,
            bg: TONE.offBg,
            label: t("dashboard.platform.settings.gatedMediaStatusOff"),
          };

  const detail =
    current.reason === "active"
      ? t("dashboard.platform.settings.gatedMediaDetailActive")
      : current.reason === "missing_secret"
        ? t("dashboard.platform.settings.gatedMediaDetailMissingSecret")
        : current.reason === "forced_off_by_env"
          ? t("dashboard.platform.settings.gatedMediaDetailForcedOff")
          : t("dashboard.platform.settings.gatedMediaDetailOff");

  const override =
    current.envOverride === null
      ? null
      : current.envOverride
        ? t("dashboard.platform.settings.gatedMediaOverrideOn")
        : t("dashboard.platform.settings.gatedMediaOverrideOff");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span
          style={{
            padding: "3px 9px",
            borderRadius: 999,
            background: badge.bg,
            color: badge.ink,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {badge.label}
        </span>
        <GatedMediaExplainer minutes={revocationLagMinutes} />
        <span style={{ color: TONE.hint, fontSize: 12, lineHeight: 1.45, flex: 1, minWidth: 200 }}>
          {interpolate(detail, { minutes: revocationLagMinutes })}
        </span>
      </div>

      {override && (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            background: TONE.overrideBg,
            border: `1px solid ${TONE.overrideBorder}`,
            color: TONE.overrideInk,
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {override}
        </div>
      )}

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ marginTop: 2, width: 15, height: 15, accentColor: "#2c5fdb" }}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontWeight: 600 }}>
            {t("dashboard.platform.settings.gatedMediaLabel")}
          </span>
          {/* One line only. The rest of the story is behind the info button
              above, so this card stays scannable. */}
          <span style={{ color: TONE.hint, lineHeight: 1.45, fontSize: 12 }}>
            {interpolate(t("dashboard.platform.settings.gatedMediaHint"), {
              minutes: revocationLagMinutes,
            })}
          </span>
        </span>
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={save}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            background: !dirty || pending ? "#c9c9d1" : "#111118",
            color: "#fff",
            cursor: !dirty || pending ? "default" : "pointer",
          }}
        >
          {pending
            ? t("dashboard.platform.settings.saving")
            : t("dashboard.platform.settings.save")}
        </button>
        {status && (
          <span style={{ fontSize: 12.5, color: status.ok ? TONE.active : TONE.blocked }}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}
