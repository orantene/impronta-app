"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { SecondaryButton } from "@/components/admin/shell/internal/primitives";
import { COLORS, RADIUS } from "@/components/admin/shell/internal/state";
import type { MoneyOutstandingRow } from "@/lib/money/money-read-model";
import {
  buildMoneySpineView,
  formatMoneyMajor,
  formatMoneyShort,
  initialsFromName,
  outstandingFilterTotal,
  outstandingRowChrome,
  type OutstandingFilter,
} from "@/lib/money/money-spine-view";
import { MoneyAvatar, MoneyFilterChip, MoneySectionLabel } from "./money-spine-shared";

export function MoneyOutstandingPanel({
  rows,
  filter,
  summary,
  waiting,
  agency,
  currency,
  onFilter,
  onRequest,
  onRecord,
}: {
  rows: MoneyOutstandingRow[];
  filter: OutstandingFilter;
  summary: ReturnType<typeof buildMoneySpineView>["summary"];
  waiting: ReturnType<typeof buildMoneySpineView>["waitingRequest"];
  agency: ReturnType<typeof buildMoneySpineView>["agencyLine"];
  currency: string;
  onFilter: (f: OutstandingFilter) => void;
  onRequest: (row: MoneyOutstandingRow) => void;
  onRecord: (row: MoneyOutstandingRow) => void;
}) {
  const copy = useDashboardText();
  const chips: { id: OutstandingFilter; label: string }[] = [
    { id: "all", label: copy.t("All") },
    { id: "today", label: copy.t("Due by today") },
    { id: "later", label: copy.t("Due later") },
  ];

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {chips.map((c) => (
          <MoneyFilterChip
            key={c.id}
            active={filter === c.id}
            label={c.label}
            count={formatMoneyShort(outstandingFilterTotal(summary, c.id))}
            onClick={() => onFilter(c.id)}
          />
        ))}
      </div>

      <div data-money-desk-out>
        {rows.map((o) => {
          const chrome = outstandingRowChrome(o);
          const overdueAct = o.scope === "overdue";
          return (
            <div
              key={o.bookingId}
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1.6fr 1fr 150px",
                gap: 14,
                alignItems: "center",
                padding: "13px 12px",
                borderBottom: `1px solid ${COLORS.borderSoft}`,
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <MoneyAvatar initials={initialsFromName(o.clientName)} size={34} />
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{o.clientName}</div>
                  <div style={{ fontSize: 13, color: COLORS.inkDim }}>
                    {copy.t(chrome.bookingLine)}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>
                <div>{copy.t(chrome.serviceLabel)}</div>
                <div
                  style={{
                    color: chrome.overdue ? COLORS.critical : COLORS.inkMuted,
                    fontWeight: chrome.overdue ? 600 : 400,
                  }}
                >
                  {copy.t(chrome.dueLine)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {formatMoneyMajor(o.left, currency)}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: COLORS.inkMuted,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {copy.t("of")} {formatMoneyShort(o.agreed)} · {formatMoneyShort(o.paid)}{" "}
                  {copy.t("Paid so far").toLowerCase()}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <SecondaryButton
                  size="sm"
                  onClick={() => (overdueAct ? onRequest(o) : onRecord(o))}
                >
                  {overdueAct ? copy.t("Request payment") : copy.t("Record payment")}
                </SecondaryButton>
              </div>
            </div>
          );
        })}
      </div>

      <div data-money-mob-out style={{ display: "none", flexDirection: "column", gap: 10 }}>
        {rows.map((o) => {
          const chrome = outstandingRowChrome(o);
          return (
            <div
              key={o.bookingId}
              style={{
                padding: 14,
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: RADIUS.lg,
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", gap: 12 }}>
                <MoneyAvatar initials={initialsFromName(o.clientName)} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{o.clientName}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {formatMoneyMajor(o.left, currency)}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: COLORS.inkMuted }}>
                    {copy.t(chrome.serviceLabel)} · {copy.t("booking")}{" "}
                    {chrome.bookingLine.replace(/^Booking /, "")}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      marginTop: 2,
                      color: chrome.overdue ? COLORS.critical : COLORS.inkMuted,
                      fontWeight: chrome.overdue ? 600 : 400,
                    }}
                  >
                    {copy.t(chrome.dueLine)}
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.inkDim, marginTop: 2 }}>
                    {copy.t("Agreed")} {formatMoneyShort(o.agreed)} ·{" "}
                    {copy.t("Paid so far").toLowerCase()} {formatMoneyShort(o.paid)}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10, width: "100%" }}>
                <SecondaryButton
                  size="sm"
                  onClick={() =>
                    o.scope === "overdue" ? onRequest(o) : onRecord(o)
                  }
                >
                  {o.scope === "overdue"
                    ? copy.t("Request payment")
                    : copy.t("Record payment")}
                </SecondaryButton>
              </div>
            </div>
          );
        })}
      </div>

      {filter === "all" ? (
        <>
          <MoneySectionLabel
            title={copy.t("Payment requests waiting")}
            right={copy.t("Not owed yet")}
          />
          <div
            style={{
              padding: "12px 16px",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: RADIUS.lg,
              display: "flex",
              gap: 12,
              alignItems: "center",
              background: "#fff",
            }}
          >
            <MoneyAvatar initials={waiting.initials} size={34} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {waiting.clientName} · {copy.t(waiting.title)}
              </div>
              <div style={{ fontSize: 13.5, color: COLORS.inkMuted }}>
                {copy.t(waiting.detail)}
              </div>
            </div>
            <SecondaryButton size="sm">{copy.t("View request")}</SecondaryButton>
          </div>

          <MoneySectionLabel title={copy.t("From agencies")} />
          <div
            style={{
              padding: "12px 16px",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: RADIUS.lg,
              display: "flex",
              gap: 12,
              alignItems: "center",
              background: "#fff",
            }}
          >
            <MoneyAvatar initials={agency.initials} size={34} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {agency.name} · {formatMoneyMajor(agency.amount, currency)}
              </div>
              <div style={{ fontSize: 13.5, color: COLORS.inkMuted }}>
                {copy.t(agency.detail)}
              </div>
            </div>
            <SecondaryButton size="sm">{copy.t("View job")}</SecondaryButton>
          </div>
        </>
      ) : null}
    </div>
  );
}
