"use client";

import { useState } from "react";
import { Toggle } from "../../primitives";
import { COLORS, FONTS, TRANSITION, type ChannelEntry } from "../../state";



/** A row for a channel the talent is on. Shows performance + toggle. */
export function ChannelRow({
  channel,
  on,
  onToggle,
  first,
  onManage,
}: {
  channel: ChannelEntry;
  on: boolean;
  onToggle: (next: boolean) => void;
  first: boolean;
  onManage?: () => void;
}) {
  // A8: local paused state. Paused = listed but not accepting NEW pitches.
  // Distinct from off (which fully removes you).
  const [paused, setPaused] = useState(false);
  const effectiveOn = on && !paused;
  const status =
    channel.toggleable === false
      ? channel.badge ?? "Contract"
      : paused && on
        ? "Paused"
        : on
          ? "Live"
          : "Off";
  const statusFg = paused && on ? COLORS.amber : on ? COLORS.green : COLORS.inkDim;
  // A10: trust-impact warning when toggling on an unverified channel.
  // Inline note below the row, dismissible by toggling off.
  const showTrustWarning = on && channel.kind === "external" && channel.verified === false;
  return (
    <div style={{ borderTop: first ? "none" : `1px solid ${COLORS.borderSoft}` }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        opacity: paused ? 0.6 : !on && channel.toggleable ? 0.7 : 1,
        transition: `opacity ${TRANSITION.micro}`,
      }}
      data-channel-row
    >
      <div className="flex-1 min-w-0">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.ink,
          }}
        >
          <span>{channel.name}</span>
          {channel.verified && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                                padding: "1px 5px",
                borderRadius: 4,
                background: COLORS.indigoSoft,
                color: COLORS.indigoDeep,
              }}
            >
              Verified
            </span>
          )}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10.5,
              fontWeight: 600,
                            color: statusFg,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: statusFg,
              }}
            />
            {status}
          </span>
        </div>
        {channel.url && (
          <div
            style={{
              fontSize: 11.5,
              color: COLORS.inkMuted,
              marginTop: 1,
              fontFamily: FONTS.body,
            }}
          >
            {channel.url}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 4,
            fontSize: 11.5,
            color: COLORS.inkMuted,
            fontVariantNumeric: "tabular-nums",
            flexWrap: "wrap",
          }}
        >
          <span>
            {channel.views7d} views · {channel.inquiries7d} inquiries · 7d
          </span>
          {channel.bookings90d > 0 && (
            <span style={{ color: COLORS.inkDim }}>·</span>
          )}
          {channel.bookings90d > 0 && (
            <span>{channel.bookings90d} bookings · 90d</span>
          )}
          {channel.earnings90d > 0 && (
            <>
              <span style={{ color: COLORS.inkDim }}>·</span>
              <span style={{ color: COLORS.green, fontWeight: 600 }}>
                {channel.earningsCurrency ?? "€"}
                {channel.earnings90d.toLocaleString()} · 90d
              </span>
            </>
          )}
          {channel.feeRate !== undefined && channel.feeRate > 0 && (
            <span
              style={{
                fontSize: 10.5,
                color: COLORS.inkDim,
                padding: "1px 6px",
                borderRadius: 4,
                background: "rgba(11,11,13,0.04)",
              }}
            >
              {Math.round(channel.feeRate * 100)}% fee
            </span>
          )}
        </div>
      </div>
      {channel.toggleable ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <Toggle on={on} onChange={() => onToggle(!on)} />
          {/* A8: Pause / Resume link — only when channel is on */}
          {on && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                fontFamily: FONTS.body,
                fontSize: 10.5,
                color: paused ? COLORS.amber : COLORS.inkMuted,
                cursor: "pointer",
                fontWeight: paused ? 600 : 500,
              }}
            >
              {paused ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      ) : onManage ? (
        <button
          type="button"
          onClick={onManage}
          style={{
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 7,
            padding: "5px 11px",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 500,
            color: COLORS.ink,
            cursor: "pointer",
          }}
        >
          Manage →
        </button>
      ) : (
        <span
          style={{
            fontSize: 11,
            color: COLORS.inkDim,
            fontFamily: FONTS.body,
          }}
        >
          Contract-managed
        </span>
      )}
    </div>
    {/* A10: trust-impact warning — coral inline note when channel is on
        AND not Tulala-verified. Sets expectation about lower-quality
        inquiries before they hit the inbox. */}
    {showTrustWarning && !paused && (
      <div
        style={{
          padding: "8px 14px 12px 14px",
          borderTop: `1px dashed rgba(194,106,69,0.20)`,
          background: COLORS.coralSoft,
          fontFamily: FONTS.body,
          fontSize: 11,
          color: COLORS.coralDeep,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ fontWeight: 600 }}>Heads up:</strong> {channel.name} isn't Tulala-verified. Inquiries may include unvetted clients. Adjust your contact policy if needed.
      </div>
    )}
    {paused && (
      <div
        style={{
          padding: "8px 14px 12px 14px",
          borderTop: `1px dashed rgba(82,96,109,0.20)`,
          background: "rgba(82,96,109,0.06)",
          fontFamily: FONTS.body,
          fontSize: 11,
          color: COLORS.amber,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ fontWeight: 600 }}>Paused:</strong> still listed but not accepting new pitches. Click Resume to start accepting again.
      </div>
    )}
    </div>
  );
}


/** A row for a channel the talent is NOT YET on. One-click add. */
export function AvailableChannelRow({
  channel,
  onAdd,
}: {
  channel: ChannelEntry;
  onAdd: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        background: "rgba(11,11,13,0.015)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12.5,
            fontWeight: 500,
            color: COLORS.inkMuted,
          }}
        >
          <span>{channel.name}</span>
          {channel.verified && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                                padding: "1px 5px",
                borderRadius: 4,
                background: COLORS.indigoSoft,
                color: COLORS.indigoDeep,
              }}
            >
              Verified
            </span>
          )}
          <span style={{ fontSize: 11, color: COLORS.inkDim }}>
            Available · not joined
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        style={{
          flexShrink: 0,
          background: "transparent",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 7,
          padding: "4px 10px",
          fontFamily: FONTS.body,
          fontSize: 11.5,
          fontWeight: 500,
          color: COLORS.ink,
          cursor: "pointer",
        }}
      >
        + Add
      </button>
    </div>
  );
}
