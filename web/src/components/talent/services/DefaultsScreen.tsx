"use client";

import type { ReactNode } from "react";
import { type SellingDefaults } from "@/lib/talent/services-settings-actions";
import { whoPrimaryCtaLabel } from "@/lib/talent/selling-booking-settings";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

// PDF p15 "Defaults · the rules every item starts with". Four cards in a
// 2x2 grid (one column on phone), the arithmetic worked out under each rule.

const EXAMPLE_PRICE = 600; // the worked example the design uses, in MXN
const EXAMPLE_TRAVEL_FEE = 150;
const NOTICE_HOURS = [12, 24, 48, 72] as const;
const WHERE_OPTIONS = [
  { id: "studio", label: "At my studio" },
  { id: "client", label: "At the client's place" },
  { id: "remote", label: "Remote" },
] as const;

const fieldLabel = "block text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-ink-dim";
const inputBox =
  "mt-1.5 flex h-10 w-full items-center rounded-lg border border-admin-border-soft bg-white px-3 text-[14px] text-admin-ink focus-within:border-emerald-900";
const bareInput = "w-full min-w-0 bg-transparent outline-none";
const noteBox = "rounded-lg bg-black/[0.03] px-3.5 py-3 text-[12.5px] leading-relaxed text-admin-ink-muted";

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function Card({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-admin-border-soft bg-white">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-admin-border-soft px-5 py-4">
        <h2 className="text-[15px] font-semibold text-admin-ink">{title}</h2>
        <span className="text-[12.5px] text-admin-ink-dim">{hint}</span>
      </header>
      <div className="space-y-4 px-5 py-5">{children}</div>
    </section>
  );
}

function UnitInput({
  value,
  unit,
  onValue,
  label,
}: {
  value: number | null;
  unit: string;
  onValue: (n: number | null) => void;
  label: string;
}) {
  return (
    <div className={inputBox}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        aria-label={label}
        className={bareInput}
        value={value ?? ""}
        onChange={(e) => onValue(num(e.target.value))}
      />
      <span className="shrink-0 pl-1 text-admin-ink-muted">{unit}</span>
    </div>
  );
}

function NoticeSelect({
  value,
  onValue,
  label,
  format,
}: {
  value: number | null;
  onValue: (n: number) => void;
  label: string;
  format: (h: number) => string;
}) {
  const current = value ?? 24;
  const options: number[] = NOTICE_HOURS.includes(current as (typeof NOTICE_HOURS)[number])
    ? [...NOTICE_HOURS]
    : [...NOTICE_HOURS, current].sort((a, b) => a - b);
  return (
    <div className={inputBox}>
      <select
        aria-label={label}
        className={`${bareInput} cursor-pointer appearance-none`}
        value={current}
        onChange={(e) => onValue(Number(e.target.value))}
      >
        {options.map((h) => (
          <option key={h} value={h}>
            {format(h)}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none text-admin-ink-dim">▾</span>
    </div>
  );
}

function clock(totalMin: number): string {
  const m = ((totalMin % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export function DefaultsScreen({
  defaults,
  currency = "MXN",
  onChange,
  onBack,
  onSave,
}: {
  defaults: SellingDefaults;
  currency?: string;
  onChange: (next: SellingDefaults) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const copy = useDashboardText();
  const patch = (partial: Partial<SellingDefaults>) => onChange({ ...defaults, ...partial });

  const pct = defaults.depositPct ?? 0;
  const depositNow = Math.round((EXAMPLE_PRICE * pct) / 100);
  const depositLater = EXAMPLE_PRICE - depositNow;
  const cancelH = defaults.cancelHours ?? 24;
  const reschedH = defaults.rescheduleHours ?? 24;
  const buffer = defaults.bufferAfterMin ?? 0;
  const prep = defaults.bufferBeforeMin ?? 0;
  const noticeMin = defaults.minNoticeMin ?? 0;
  const noticeHours = Math.round((noticeMin / 60) * 10) / 10;
  const travels = defaults.where.includes("client");
  const freeUntil = (h: number) => copy.t("Free until {hours} hours before").replace("{hours}", String(h));

  const toggleWhere = (id: string) => {
    const has = defaults.where.includes(id);
    const next = has ? defaults.where.filter((w) => w !== id) : [...defaults.where, id];
    if (next.length === 0) return; // at least one place stays on
    patch({ where: next });
  };

  return (
    <div className="font-admin-body text-admin-ink">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 text-[13px] text-admin-ink-muted hover:text-admin-ink"
      >
        ← {copy.t("Services")}
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold leading-tight text-admin-ink">{copy.t("Defaults")}</h1>
          <p className="mt-1 text-[13.5px] text-admin-ink-muted">
            {copy.t("Every new item starts with these. Any item can override them.")}
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          className="h-10 rounded-lg bg-emerald-900 px-4 text-[14px] font-semibold text-white hover:bg-emerald-950"
        >
          {copy.t("Save changes")}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Deposit */}
        <Card title={copy.t("Deposit")} hint={copy.t("Taken when a client books")}>
          <div>
            <span className={fieldLabel}>{copy.t("Percentage")}</span>
            <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className={`${inputBox} mt-0 sm:w-32 sm:shrink-0`}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  aria-label={copy.t("Percentage")}
                  className={`${bareInput} font-semibold`}
                  value={defaults.depositPct ?? ""}
                  onChange={(e) => {
                    const n = num(e.target.value);
                    patch({ depositPct: n === null ? null : Math.min(100, n) });
                  }}
                />
                <span className="shrink-0 pl-1 font-semibold">%</span>
              </div>
              <p className="text-[13.5px] leading-snug text-admin-ink">
                {pct > 0 ? (
                  <>
                    {copy.t("On a {price} MXN service that is").replace("{price}", String(EXAMPLE_PRICE)).replaceAll("MXN", currency)}{" "}
                    <strong>{depositNow} {currency}</strong> {copy.t("now and")} <strong>{depositLater} {currency}</strong>{" "}
                    {copy.t("at the studio.")}
                  </>
                ) : (
                  copy.t("No deposit. The client pays everything on the day.")
                )}
              </p>
            </div>
          </div>
          {pct > 0 ? (
            <p className={noteBox}>
              {copy
                .t(
                  "If a home visit adds a {fee} MXN travel fee, the deposit is taken on the service only, not the travel: {now} MXN now, {later} MXN on the day. Travel is settled where the work happens.",
                )
                .replace("{fee}", String(EXAMPLE_TRAVEL_FEE))
                .replace("{now}", String(depositNow))
                .replace("{later}", String(depositLater + EXAMPLE_TRAVEL_FEE))
                .replaceAll("MXN", currency)}
            </p>
          ) : null}
        </Card>

        {/* Cancelling and rescheduling */}
        <Card title={copy.t("Cancelling and rescheduling")} hint={copy.t("Two different things")}>
          <div>
            <span className={fieldLabel}>{copy.t("Cancelling")}</span>
            <NoticeSelect
              label={copy.t("Cancelling")}
              value={defaults.cancelHours}
              onValue={(h) => patch({ cancelHours: h })}
              format={freeUntil}
            />
            <p className="mt-1.5 text-[12.5px] text-admin-ink-dim">
              {copy
                .t("Inside {hours} hours the deposit is kept. The client is refunded in full before that.")
                .replace("{hours}", String(cancelH))}
            </p>
          </div>
          <div>
            <span className={fieldLabel}>{copy.t("Rescheduling")}</span>
            <NoticeSelect
              label={copy.t("Rescheduling")}
              value={defaults.rescheduleHours}
              onValue={(h) => patch({ rescheduleHours: h })}
              format={freeUntil}
            />
            <p className="mt-1.5 text-[12.5px] text-admin-ink-dim">
              {copy
                .t("The deposit moves to the new date. Inside {hours} hours it is kept and a new one is asked for.")
                .replace("{hours}", String(reschedH))}
            </p>
          </div>
        </Card>

        {/* Where you work */}
        <Card title={copy.t("Where you work")} hint={copy.t("Used to offer and to block time")}>
          <div className="flex flex-wrap gap-2">
            {WHERE_OPTIONS.map((o) => {
              const on = defaults.where.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleWhere(o.id)}
                  className={
                    on
                      ? "rounded-md bg-emerald-900/[0.08] px-3 py-1.5 text-[13px] font-semibold text-emerald-900"
                      : "rounded-md bg-black/[0.04] px-3 py-1.5 text-[13px] font-medium text-admin-ink-muted hover:text-admin-ink"
                  }
                >
                  {copy.t(o.label)}
                </button>
              );
            })}
          </div>
          {travels ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <span className={fieldLabel}>{copy.t("How far you travel")}</span>
                  <UnitInput
                    label={copy.t("How far you travel")}
                    value={defaults.travelRadiusKm}
                    unit="km"
                    onValue={(n) => patch({ travelRadiusKm: n })}
                  />
                </div>
                <div>
                  <span className={fieldLabel}>{copy.t("Travel fee")}</span>
                  <UnitInput
                    label={copy.t("Travel fee")}
                    value={defaults.travelFeeCents === null ? null : defaults.travelFeeCents / 100}
                    unit={currency}
                    onValue={(n) => patch({ travelFeeCents: n === null ? null : Math.round(n * 100) })}
                  />
                </div>
              </div>
              <p className="text-[12.5px] text-admin-ink-dim">
                {copy.t("The travel fee is added to home visits and paid on the day.")}
              </p>
            </>
          ) : (
            <p className="text-[12.5px] text-admin-ink-dim">
              {copy.t("Turn on home visits to set how far you travel and what it costs.")}
            </p>
          )}
        </Card>

        {/* Preparation + gaps between appointments */}
        <Card title={copy.t("Preparation and gaps")} hint={copy.t("Blocked, never charged")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className={fieldLabel}>{copy.t("Preparation before each booking")}</span>
              <UnitInput
                label={copy.t("Preparation before each booking")}
                value={defaults.bufferBeforeMin}
                unit="min"
                onValue={(n) => patch({ bufferBeforeMin: n })}
              />
            </div>
            <div>
              <span className={fieldLabel}>{copy.t("Buffer after each one")}</span>
              <UnitInput
                label={copy.t("Buffer after each one")}
                value={defaults.bufferAfterMin}
                unit="min"
                onValue={(n) => patch({ bufferAfterMin: n })}
              />
            </div>
            <div className="sm:col-span-2">
              <span className={fieldLabel}>{copy.t("Shortest notice you accept")}</span>
              <UnitInput
                label={copy.t("Shortest notice you accept")}
                value={defaults.minNoticeMin === null ? null : noticeHours}
                unit="h"
                onValue={(n) => patch({ minNoticeMin: n === null ? null : Math.round(n * 60) })}
              />
            </div>
          </div>
          <p className={noteBox}>
            {copy
              .t(
                "A 60 minute service booked at 10:00 needs prep from {prepStart}. It ends at 11:00 for the client and {end} for you.",
              )
              .replace("{prepStart}", clock(600 - prep))
              .replace("{end}", clock(660 + buffer))}{" "}
            {copy.t(
              "Preparation blocks time before the start so the previous client cannot run into your setup. The after buffer hides the next slot that would overlap, and the notice hides anything sooner.",
            )}
          </p>
        </Card>

        {/* How clients finish the booking sheet */}
        <Card title={copy.t("How clients book")} hint={copy.t("Sheet button and path")}>
          <div>
            <span className={fieldLabel}>{copy.t("Booking mode")}</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(
                [
                  { id: "on_demand" as const, label: copy.t("On-demand reservation") },
                  { id: "inquiry" as const, label: copy.t("Contact / inquiry") },
                ] as const
              ).map((m) => {
                const on = defaults.bookingPosture === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      patch({
                        bookingPosture: m.id,
                        whoPrimaryCta:
                          m.id === "inquiry" && defaults.whoPrimaryCta === "confirm_now"
                            ? "contact"
                            : defaults.whoPrimaryCta,
                      })
                    }
                    className={`rounded-lg border px-3 py-2 text-[13px] font-medium ${
                      on
                        ? "border-emerald-900 bg-emerald-900 text-white"
                        : "border-admin-border-soft bg-white text-admin-ink hover:border-admin-ink/40"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className={fieldLabel}>{copy.t("Who-step button")}</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(
                [
                  { id: "confirm_now" as const },
                  { id: "contact" as const },
                  { id: "check_availability" as const },
                ] as const
              ).map((c) => {
                const disabled =
                  defaults.bookingPosture === "inquiry" && c.id === "confirm_now";
                const on = defaults.whoPrimaryCta === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => patch({ whoPrimaryCta: c.id })}
                    className={`rounded-lg border px-3 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                      on
                        ? "border-emerald-900 bg-emerald-900 text-white"
                        : "border-admin-border-soft bg-white text-admin-ink hover:border-admin-ink/40"
                    }`}
                  >
                    {whoPrimaryCtaLabel(c.id, copy.locale)}
                  </button>
                );
              })}
            </div>
          </div>
          <p className={noteBox}>
            {defaults.bookingPosture === "inquiry" || defaults.whoPrimaryCta !== "confirm_now"
              ? copy.t(
                  "After the client fills name and contact, this button opens chat with those details already filled in. It does not create a confirmed booking.",
                )
              : copy.t(
                  "After the client fills name and contact, this button confirms the appointment when the service allows instant booking.",
                )}
          </p>
        </Card>
      </div>
    </div>
  );
}
