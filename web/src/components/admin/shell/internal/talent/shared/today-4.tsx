"use client";

import { useDashboardText } from "../../dashboard-i18n";
import { Icon } from "../../primitives";
import { COLORS, FONTS, TRANSITION, useAdminShell, type TalentBooking } from "../../state";
import { DateBlock, KindChip } from "./today-1";



function BookingRow({ booking }: { booking: TalentBooking }) {
  const copy = useDashboardText();
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
      <div className="flex-1 min-w-0">
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 500 }} className="text-admin-ink">
          <span>{booking.client}</span>
          <span className="text-admin-ink-dim">·</span>
          <span style={{ fontWeight: 400 }} className="text-admin-ink-muted">{booking.brief}</span>
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
          <KindChip label={copy.t("Booked")} tone="success" />
          <span className="text-admin-ink-muted">
            {booking.location} · {copy.t("call")} {booking.call}
          </span>
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }} className="text-admin-ink">
        {booking.amount}
      </span>
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
  );
}
