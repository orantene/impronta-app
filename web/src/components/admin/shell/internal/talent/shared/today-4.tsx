"use client";

import { Icon } from "../../primitives";
import { COLORS, FONTS, TRANSITION, useAdminShell, type TalentBooking } from "../../state";
import { DateBlock, KindChip } from "./today-1";



function BookingRow({ booking }: { booking: TalentBooking }) {
  const { openDrawer } = useAdminShell();
  // Parse "Tue, May 6" or "May 14" → month "MAY", day "6" / "14".
  const dateMatch = booking.startDate.match(/([A-Za-z]+)\s+(\d{1,2})/);
  const month = dateMatch?.[1]?.toUpperCase() ?? "—";
  const day = dateMatch?.[2] ?? "—";
  return (
    <button
      onClick={() => openDrawer("talent-booking-detail", { id: booking.id })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        fontFamily: FONTS.body,
        transition: `background ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.02)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <DateBlock day={day} month={month} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13.5,
            fontWeight: 500,
            color: COLORS.ink,
          }}
        >
          <span>{booking.client}</span>
          <span style={{ color: COLORS.inkDim }}>·</span>
          <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}>{booking.brief}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            fontSize: 11.5,
          }}
        >
          <KindChip label="Booked" tone="success" />
          <span style={{ color: COLORS.inkMuted }}>
            {booking.location} · call {booking.call}
          </span>
        </div>
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: COLORS.ink,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {booking.amount}
      </span>
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
  );
}
