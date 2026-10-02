"use client";

/**
 * The four F1 group sub-screens. Each edits the shared draft only; nothing is
 * written until the talent presses Save in the parent screen.
 */

import { useState, type ReactNode } from "react";
import type { SellingDefaults } from "@/lib/talent/services-settings-actions";
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";
import { BOOKING_MODE_LABELS } from "@/lib/talent/booking-mode-labels";
import { ChoiceCard, LiveOnSaveNote, SettingsCard, SourceBadge, Stepper, Switch } from "./primitives";
import {
  countCustom,
  defaultModeImpact,
  effectiveServiceMode,
  valueSource,
  withPosture,
  type ServiceFields,
  type SettingsDraft,
  type ServiceMode,
  type SettingsService,
} from "./settings-model";

type T = (s: string) => string;

type GroupProps = {
  t: T;
  draft: SettingsDraft;
  setDefaults: (next: SellingDefaults) => void;
};

type ServiceProps = {
  services: SettingsService[];
  setService: (id: string, patch: Partial<ServiceFields>) => void;
};

function stepLabels(t: T) {
  return { less: t("Less"), more: t("More") };
}

export function postureLabel(p: TalentBookingPosture, t: T): string {
  return t(BOOKING_MODE_LABELS[p].title);
}

const LIVE_NOTE = "Live on Save. Nothing changes for clients until you save.";

/** Searchable service list; each row can open an inline editor. */
function ServiceList({
  t,
  services,
  aside,
  describe,
  badge,
  editor,
}: {
  t: T;
  services: SettingsService[];
  aside?: string;
  describe: (s: SettingsService) => string;
  badge?: (s: SettingsService) => ReactNode;
  editor: (s: SettingsService) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const list = services.filter((s) => s.title.toLowerCase().includes(q));
  return (
    <SettingsCard title={t("Services")} aside={aside}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("Search services")}
        aria-label={t("Search services")}
        className="mb-2 h-11 w-full rounded-lg border border-admin-border-soft bg-white px-3 text-[14px] text-admin-ink outline-none focus:border-emerald-900"
      />
      {services.length === 0 ? (
        <p className="py-2 text-[13px] text-admin-ink-muted">{t("You have no services yet.")}</p>
      ) : list.length === 0 ? (
        <p className="py-2 text-[13px] text-admin-ink-muted">{t("No service matches.")}</p>
      ) : (
        <ul>
          {list.map((s) => (
            <li key={s.id} className="border-b border-admin-border-soft last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen(open === s.id ? null : s.id)}
                aria-expanded={open === s.id}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-admin-ink">{s.title}</span>
                  <span className="block text-[12.5px] text-admin-ink-muted">{describe(s)}</span>
                </span>
                {badge ? badge(s) : <span aria-hidden className="text-admin-ink-dim">›</span>}
              </button>
              {open === s.id ? <div className="mb-3 rounded-lg bg-black/[0.02] px-3 py-3">{editor(s)}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

export function BookingGroup({
  t,
  draft,
  setDefaults,
  services,
  setService,
  defaultInstantGap = null,
  before,
  savedPosture,
}: GroupProps &
  ServiceProps & { defaultInstantGap?: string | null; before?: ReactNode; savedPosture: TalentBookingPosture }) {
  const posture = draft.defaults.bookingPosture;
  const ownOf = (s: SettingsService) => draft.services[s.id]?.bookingMode ?? null;
  const own = services.filter((s) => ownOf(s) != null).length;
  const modes = (["instant", "request", "inquiry"] as const).map((mode: ServiceMode) => ({
    mode,
    title: t(BOOKING_MODE_LABELS[mode].title),
    detail: t(BOOKING_MODE_LABELS[mode].sub),
  }));
  const quoteLabel = t(BOOKING_MODE_LABELS.quote.title);
  const quoteReason = t("Quote services agree the price first. Change the price in Services to book instantly.");
  const impact = defaultModeImpact(draft.services);
  // Services that follow the default but cannot book instantly (no exact
  // price, quote, or missing deposit). Saving is still allowed: at runtime
  // they fall back to requests.
  const notInstant = services.filter((x) => ownOf(x) == null && !x.canBookInstantly);
  return (
    <>
      <LiveOnSaveNote>{t(LIVE_NOTE)}</LiveOnSaveNote>
      {before}
      <SettingsCard title={t("How clients book")} aside={t("Default")}>
        <p className="mb-3 text-[12.5px] text-admin-ink-muted">{t("Applies to your website and Tulala profile.")}</p>
        <div role="radiogroup" aria-label={t("Default booking mode")} className="grid gap-2">
          {modes.map((m) => (
            <ChoiceCard
              key={m.mode}
              checked={posture === m.mode}
              title={m.title}
              detail={m.detail}
              disabledReason={m.mode === "instant" && posture !== "instant" ? defaultInstantGap : null}
              onSelect={() => setDefaults(withPosture(draft.defaults, m.mode))}
            />
          ))}
        </div>
        {posture !== savedPosture ? (
          <p role="status" className="mt-3 rounded-lg bg-black/[0.03] px-3 py-2.5 text-[12.5px] text-admin-ink">
            {t("This changes {n} services. The {m} with their own setting stay unchanged.")
              .replace("{n}", String(impact.follows))
              .replace("{m}", String(impact.own))}
            {posture === "instant" && notInstant.length > 0
              ? ` ${t("{n} of them will take requests until they have a fixed price: {names}")
                  .replace("{n}", String(notInstant.length))
                  .replace("{names}", notInstant.map((x) => x.title).join(", "))}`
              : null}
          </p>
        ) : null}
      </SettingsCard>

      <ServiceList
        t={t}
        services={services}
        aside={t("{n} of {total} with their own setting")
          .replace("{n}", String(own))
          .replace("{total}", String(services.length))}
        describe={(s) => (s.quote ? quoteLabel : postureLabel(effectiveServiceMode(ownOf(s), posture), t))}
        badge={(s) => <SourceBadge source={valueSource(ownOf(s))} t={t} />}
        editor={(s) => {
          const current = ownOf(s);
          const noPrice = s.canBookInstantly ? null : t("Needs a fixed price and its booking details first. Set them in Services.");
          if (s.quote) {
            // Quote is a price setting (Services owns it). Here the talent can
            // only pick request or inquiry; priceDisplay is never written.
            const eff = effectiveServiceMode(current, posture) === "inquiry" ? "inquiry" : "request";
            return (
              <div className="grid gap-2">
                <p className="text-[12.5px] text-admin-ink-muted">
                  {quoteLabel}. {t(BOOKING_MODE_LABELS.quote.sub)}
                </p>
                <div role="radiogroup" aria-label={`${t("Booking mode")}: ${s.title}`} className="grid gap-2">
                  <ChoiceCard checked={false} title={modes[0]!.title} disabledReason={quoteReason} onSelect={() => {}} />
                  {modes.slice(1).map((m) => (
                    <ChoiceCard
                      key={m.mode}
                      checked={eff === m.mode}
                      title={m.title}
                      detail={m.detail}
                      onSelect={() => setService(s.id, { bookingMode: m.mode })}
                    />
                  ))}
                </div>
              </div>
            );
          }
          return (
            <div className="grid gap-2">
              <p className="text-[12.5px] text-admin-ink-muted">
                {current == null ? t("Inherited from your default") : t("Custom for this service")}
              </p>
              <div role="radiogroup" aria-label={`${t("Booking mode")}: ${s.title}`} className="grid gap-2">
                {modes.map((m) => (
                  <ChoiceCard
                    key={m.mode}
                    checked={effectiveServiceMode(current, posture) === m.mode}
                    title={m.title}
                    disabledReason={m.mode === "instant" ? (noPrice ?? s.instantGap ?? null) : null}
                    onSelect={() => setService(s.id, { bookingMode: m.mode })}
                  />
                ))}
              </div>
              {current != null ? (
                <button
                  type="button"
                  onClick={() => setService(s.id, { bookingMode: null })}
                  className="min-h-[44px] w-full rounded-lg border border-admin-border-soft bg-white text-[14px] font-semibold text-admin-ink"
                >
                  {t("Reset to default")} ({postureLabel(posture, t)})
                </button>
              ) : null}
            </div>
          );
        }}
      />
    </>
  );
}

export function TimingGroup({ t, draft, setDefaults, noticeMin }: GroupProps & { noticeMin: number }) {
  const d = draft.defaults;
  const s = stepLabels(t);
  const noticeH = Math.round(noticeMin / 60);
  return (
    <>
      <LiveOnSaveNote>{t(LIVE_NOTE)}</LiveOnSaveNote>
      <SettingsCard>
        <Stepper
          label={t("Preparation before")}
          detail={t("Blocked before the appointment. Clients don't see it.")}
          value={d.bufferBeforeMin ?? 0}
          display={`${d.bufferBeforeMin ?? 0} min`}
          step={5}
          max={240}
          lessLabel={s.less}
          moreLabel={s.more}
          onChange={(n) => setDefaults({ ...d, bufferBeforeMin: n })}
        />
        <Stepper
          label={t("Cleanup after")}
          detail={t("Blocked after the appointment.")}
          value={d.bufferAfterMin ?? 0}
          display={`${d.bufferAfterMin ?? 0} min`}
          step={5}
          max={240}
          lessLabel={s.less}
          moreLabel={s.more}
          onChange={(n) => setDefaults({ ...d, bufferAfterMin: n })}
        />
        <div className="flex min-h-[44px] items-center justify-between gap-3 py-3">
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-admin-ink">{t("Minimum notice")}</span>
            <span className="mt-0.5 block text-[12.5px] text-admin-ink-muted">
              {t("Nothing sooner than this can be booked. Editing it here comes later.")}
            </span>
          </span>
          <span className="shrink-0 text-[14px] font-semibold text-admin-ink">{noticeH} h</span>
        </div>
      </SettingsCard>
    </>
  );
}

/**
 * Per-service override list for a null-means-inherit field. Reset writes null
 * (use my default); there is no "none" here, so null never means "no value".
 */
function InheritList({
  t,
  draft,
  services,
  setService,
  field,
  format,
}: GroupProps &
  ServiceProps & { field: "depositPct" | "cancellationHours"; format: (v: number) => string }) {
  const own = countCustom(draft.services, field);
  return (
    <ServiceList
      t={t}
      services={services}
      aside={t("{n} of {total} with their own setting")
        .replace("{n}", String(own))
        .replace("{total}", String(services.length))}
      describe={(s) => {
        const v = draft.services[s.id]?.[field];
        return v == null ? t("Uses your default") : format(v);
      }}
      badge={(s) => <SourceBadge source={valueSource(draft.services[s.id]?.[field])} t={t} />}
      editor={(s) => {
        const v = draft.services[s.id]?.[field];
        if (v == null) {
          return <p className="text-[12.5px] text-admin-ink-muted">{t("Inherited from your default. Give it its own value in Services.")}</p>;
        }
        if (field === "depositPct" && s.depositRequired) {
          return (
            <p className="text-[12.5px] text-admin-ink-muted">
              {t("Custom for this service. It takes a deposit to book instantly, so it keeps its own. Change it in Services.")}
            </p>
          );
        }
        return (
          <>
            <p className="mb-2 text-[12.5px] text-admin-ink-muted">{t("Custom for this service")}</p>
            <button
              type="button"
              onClick={() => setService(s.id, { [field]: null })}
              className="min-h-[44px] w-full rounded-lg border border-admin-border-soft bg-white text-[14px] font-semibold text-admin-ink"
            >
              {t("Reset to default")}
            </button>
          </>
        );
      }}
    />
  );
}

export function PaymentsGroup(props: GroupProps & ServiceProps) {
  const { t, draft, setDefaults } = props;
  const d = draft.defaults;
  const s = stepLabels(t);
  const pct = d.depositPct ?? 0;
  return (
    <>
      <LiveOnSaveNote>{t(LIVE_NOTE)}</LiveOnSaveNote>
      <SettingsCard title={t("Deposit")} aside={t("Taken when a client books")}>
        <Stepper
          label={t("Default deposit")}
          detail={pct > 0 ? t("The balance is paid at the visit.") : t("No deposit. The client pays everything on the day.")}
          value={pct}
          display={`${pct}%`}
          step={5}
          max={100}
          lessLabel={s.less}
          moreLabel={s.more}
          // An explicit 0 is "no deposit"; null is never written from here.
          onChange={(n) => setDefaults({ ...d, depositPct: n })}
        />
      </SettingsCard>
      <SettingsCard title={t("Paying in person")} aside={t("Shown on your policies")}>
        {(["cash", "transfer", "card_terminal"] as const).map((m) => {
          const on = (d.inPersonMethods ?? []).includes(m);
          return (
            <Switch
              key={m}
              checked={on}
              label={t(m === "cash" ? "Cash" : m === "transfer" ? "Bank transfer" : "Card on your terminal")}
              onChange={(next) => {
                const cur = d.inPersonMethods ?? [];
                setDefaults({ ...d, inPersonMethods: next ? [...cur.filter((x) => x !== m), m] : cur.filter((x) => x !== m) });
              }}
            />
          );
        })}
      </SettingsCard>
      <InheritList {...props} field="depositPct" format={(v) => (v > 0 ? `${t("Deposit")} ${v}%` : t("No deposit"))} />
    </>
  );
}

export function SelfServiceGroup(props: GroupProps & ServiceProps) {
  const { t, draft, setDefaults } = props;
  const d = draft.defaults;
  const s = stepLabels(t);
  const cancel = d.cancelHours ?? 24;
  const resched = d.rescheduleHours ?? 24;
  return (
    <>
      <LiveOnSaveNote>{t(LIVE_NOTE)}</LiveOnSaveNote>
      <SettingsCard>
        <Stepper
          label={t("Cancelling")}
          detail={t("Sets the cancellation window shown to clients ({hours} hours). Refunds follow your published policy.").replace("{hours}", String(cancel))}
          value={cancel}
          display={`${cancel} h`}
          step={12}
          max={168}
          lessLabel={s.less}
          moreLabel={s.more}
          onChange={(n) => setDefaults({ ...d, cancelHours: n })}
        />
        <Stepper
          label={t("Rescheduling")}
          detail={t("The deposit moves to the new date. Inside {hours} hours it is kept and a new one is asked for.").replace("{hours}", String(resched))}
          value={resched}
          display={`${resched} h`}
          step={12}
          max={168}
          lessLabel={s.less}
          moreLabel={s.more}
          onChange={(n) => setDefaults({ ...d, rescheduleHours: n })}
        />
      </SettingsCard>
      <InheritList
        {...props}
        field="cancellationHours"
        format={(v) => t("Free cancelling until {c} h").replace("{c}", String(v))}
      />
    </>
  );
}
