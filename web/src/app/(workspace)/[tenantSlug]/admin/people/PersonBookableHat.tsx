"use client";

/**
 * PersonBookableHat — W28 / W11: the Bookable hat's body inside the person
 * sheet. What the POS, the calendar and the booking page read for this
 * person, on the readers and writers that exist:
 *
 *   • the toggle → `setPersonBookable` (or the refusal sentence when the
 *     workspace-level switch makes the per-person column inert);
 *   • the person's own offerings → `talent_offerings`, listed; edited in the
 *     profile drawer's Booking terms (the existing editor);
 *   • Hours & locations → W11's DAY · HOURS · BREAKS table over the stored
 *     `talent_booking_hours` row, and under it the SAME `BookingHoursCard`
 *     the talent Calendar settings mount, writing through `saveBookingHours`;
 *     the table follows the editor (`onHoursChange`) so the two never
 *     disagree;
 *   • Requirements, Limits, Pay, POS permissions and "From our Catalog" →
 *     drawn with their sentence, disabled: nothing stores them per person
 *     yet (D-POS-37).
 *
 * The section ids (`bk-*`) are the sheet's left column's anchors.
 */

import { useState } from "react";

import { BookingHoursCard, type BookingHoursSnapshot } from "@/components/appointments/BookingHoursCard";
import { ActionButton, StatePill } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { PersonOffering, PersonRecord } from "@/lib/people/hats";
import { PEOPLE_MUTED, PEOPLE_NOTE, PEOPLE_REFUSAL } from "./people-classes";
import { CARD, HatChip, MutedChip, SectionTitle } from "./people-ui";

const K = "admin.people";
const S = "admin.people.sheet";
const D = "dashboard.adminWorkspace.appointments.day";

const POS_ROWS = ["completeOwn", "collectMoney", "openDrawer", "ownIntake"] as const;

/** Monday first, as the board's table reads. */
const WEEK: ReadonlyArray<{ day: number; key: string }> = [
  { day: 1, key: "mon" },
  { day: 2, key: "tue" },
  { day: 3, key: "wed" },
  { day: 4, key: "thu" },
  { day: 5, key: "fri" },
  { day: 6, key: "sat" },
  { day: 0, key: "sun" },
];

const CATALOG_HEAD = "border-b border-admin-border-soft bg-admin-surface px-[14px] py-[9px] text-[10.5px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-admin-ink-muted";

function clock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function PersonBookableHat({
  person,
  name,
  pending,
  canToggle,
  onToggle,
  blanketRefusal,
}: {
  person: PersonRecord;
  name: string;
  pending: boolean;
  /** False when there is no roster row to write. */
  canToggle: boolean;
  onToggle: () => void;
  /** Set when the workspace-level switch makes the per-person column inert. */
  blanketRefusal: string | null;
}) {
  const t = useT();
  const { effectiveTenant, openDrawer } = useAdminShell();
  const on = person.bookable.on;
  const offerings = person.facts.offerings;
  // The hours the table prints: the server's summary at first paint, then
  // whatever the editor below loaded or saved.
  const [hours, setHours] = useState<BookingHoursSnapshot | null>(
    person.facts.hours ? { weekly: person.facts.hours.weekly as BookingHoursSnapshot["weekly"], timezone: person.facts.hours.timezone } : null,
  );

  const openBookingTerms = () =>
    person.talentProfileId
      ? openDrawer("talent-profile-shell", {
          mode: "edit-admin",
          talentId: person.talentProfileId,
          section: "commercial_terms",
          seed: { stageName: person.name || undefined, profileCode: person.facts.profileCode ?? undefined },
        })
      : undefined;

  return (
    <div className="flex flex-col gap-[16px] leading-[1.2]" data-testid="person-bookable-hat">
      <div>
        <div className="text-[15px] font-semibold text-admin-ink">{interpolate(t(`${S}.bookableTitle`), { workspace: effectiveTenant.name })}</div>
        <p className={`${PEOPLE_MUTED} mt-[3px]`}>{interpolate(t(`${S}.bookableWhat`), { name })}</p>
      </div>

      {/* The toggle: the one switch that puts a person in Pick a professional */}
      <div className={`${CARD} flex flex-col gap-[10px] px-[16px] py-[14px]`}>
        <div className="flex items-center gap-[12px]">
          {!blanketRefusal ? (
            <button
              type="button"
              disabled={pending || !canToggle}
              data-testid="person-bookable-toggle"
              data-on={on ? "true" : "false"}
              className="inline-flex shrink-0 cursor-pointer items-center gap-[10px] rounded-[9px] px-[4px] py-[2px] text-[12px] font-semibold text-admin-ink-muted hover:text-admin-ink disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onToggle}
            >
              <span aria-hidden className={`relative inline-flex h-[22px] w-[40px] items-center rounded-full transition-colors ${on ? "bg-admin-brand" : "bg-admin-border-strong"}`}>
                <span className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform ${on ? "translate-x-[20px]" : "translate-x-[2px]"}`} />
              </span>
              {pending ? t(`${K}.detail.working`) : on ? t(`${K}.detail.turnOff`) : t(`${K}.detail.turnOn`)}
            </button>
          ) : (
            <span aria-hidden className="relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full bg-admin-brand opacity-50">
              <span className="inline-block h-[18px] w-[18px] translate-x-[20px] rounded-full bg-white" />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-[13px] font-semibold text-admin-ink">{t(`${S}.toggleLabel`)}</span>
            <span className="text-[11.5px] leading-[1.3] text-admin-ink-muted">{t(`${S}.toggleHelp`)}</span>
          </div>
          {person.publicProfile.on ? <HatChip hat="publicProfile" label={`${t(`${K}.hat.publicProfile`)} · ${t(`${K}.on`)}`} /> : null}
        </div>
        {blanketRefusal ? (
          <p className={PEOPLE_REFUSAL} data-testid="person-bookable-blanket">
            {blanketRefusal}
          </p>
        ) : null}
      </div>

      {/* Services: two sources, one list */}
      <div id="bk-services" className="flex flex-col gap-[10px] scroll-mt-[16px]">
        <SectionTitle sub={t(`${S}.servicesSub`)}>{interpolate(t(`${S}.servicesTitle`), { name })}</SectionTitle>
        <div className={`${CARD} overflow-hidden`}>
          <div className={CATALOG_HEAD}>{t(`${S}.fromCatalog`)}</div>
          <p className={`${PEOPLE_MUTED} px-[14px] py-[12px]`} data-not-wired="true">
            {t(`${S}.fromCatalogOff`)}
          </p>
          <div className={`${CATALOG_HEAD} border-t`}>{interpolate(t(`${S}.ownOfferings`), { name })}</div>
          {offerings.length === 0 ? (
            <p className={`${PEOPLE_MUTED} px-[14px] py-[12px]`}>{t(`${S}.ownOfferingsNone`)}</p>
          ) : (
            offerings.map((o) => <OfferingRow key={o.id} offering={o} />)
          )}
          <div className="flex flex-wrap items-center gap-[8px] border-t border-admin-border-soft px-[14px] py-[10px]">
            <ActionButton reason={t(`${S}.addFromCatalogOff`)} testId="person-add-from-catalog">
              <Icon name="plus" size={13} stroke={1.75} />
              {t(`${S}.addFromCatalog`)}
            </ActionButton>
            <ActionButton onClick={openBookingTerms} disabled={!person.talentProfileId} testId="person-edit-offerings">
              {interpolate(t(`${S}.pickOwnOfferings`), { name })}
            </ActionButton>
          </div>
        </div>
      </div>

      {/* Hours & locations: W11's table over the stored row, the real editor under it */}
      <div id="bk-hours" className="flex flex-col gap-[10px] scroll-mt-[16px]" data-testid="person-hours">
        <SectionTitle sub={t(`${S}.hoursSub`)}>{t(`${S}.hoursTitle`)}</SectionTitle>
        <p className={PEOPLE_NOTE} data-not-wired="true">
          {t(`${S}.hoursLocationsOff`)}
        </p>
        <div className={`${CARD} overflow-hidden`} data-testid="person-hours-table">
          <table className="w-full border-collapse text-admin-13 leading-[1.2]">
            <thead>
              <tr>
                {[t(`${S}.hoursTable.day`), hours ? `${t(`${S}.hoursTable.hours`)} · ${hours.timezone}` : t(`${S}.hoursTable.hours`), t(`${S}.hoursTable.breaks`)].map((h) => (
                  <th key={h} scope="col" className="border-b border-admin-border px-[16px] py-[10px] text-left text-admin-11 font-semibold uppercase leading-[1.2] tracking-[0.05em] text-admin-ink-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEK.map(({ day, key }) => {
                const windows = hours?.weekly[day as 0 | 1 | 2 | 3 | 4 | 5 | 6] ?? [];
                return (
                  <tr key={key} data-hours-day={key}>
                    <td className="w-[120px] border-b border-admin-border-soft px-[16px] py-[9px] font-semibold text-admin-ink">{t(`${D}.${key}`)}</td>
                    <td className={`border-b border-admin-border-soft px-[16px] py-[9px] ${windows.length ? "text-admin-ink" : "text-admin-ink-muted"}`}>
                      {windows.length ? windows.map((w) => `${clock(w.startMin)}–${clock(w.endMin)}`).join(" · ") : t(`${S}.hoursTable.off`)}
                    </td>
                    <td className="w-[160px] border-b border-admin-border-soft px-[16px] py-[9px] text-admin-ink-dim" title={t(`${S}.hoursTable.breaksWhy`)}>
                      –
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {person.talentProfileId ? (
            <details className="group border-t border-admin-border-soft" data-testid="person-hours-editor">
              <summary className="flex cursor-pointer list-none items-center gap-[8px] px-[16px] py-[10px] text-admin-13 font-semibold text-admin-ink [&::-webkit-details-marker]:hidden">
                <span className="transition-transform group-open:rotate-180">
                  <Icon name="chevron-down" size={13} stroke={1.75} />
                </span>
                {t(`${S}.hoursTable.edit`)}
              </summary>
              <div className="px-[16px] pb-[12px]">
                <BookingHoursCard talentProfileId={person.talentProfileId} onHoursChange={setHours} />
              </div>
            </details>
          ) : null}
        </div>
      </div>

      {/* Requirements · Limits · Pay: the facts that are not checked yet, said so */}
      <div className="grid grid-cols-2 gap-[12px]">
        <NotWiredCard id="bk-requirements" title={t(`${S}.requirementsTitle`)} body={t(`${S}.requirementsOff`)} />
        <NotWiredCard id="bk-limits" title={t(`${S}.limitsTitle`)} body={t(`${S}.limitsOff`)} />
      </div>

      {/* POS permissions: drawn as the board draws them, every switch disabled with the sentence */}
      <div id="bk-pos" className={`${CARD} flex flex-col gap-[12px] p-[16px] scroll-mt-[16px]`} data-testid="person-pos-permissions">
        <SectionTitle sub={interpolate(t(`${S}.posSub`), { name })}>{t(`${S}.posTitle`)}</SectionTitle>
        <p className={PEOPLE_NOTE} data-not-wired="true">
          {t(`${S}.posOff`)}
        </p>
        {POS_ROWS.map((row) => (
          <div key={row} className="flex items-center gap-[12px]">
            <span role="switch" aria-checked={false} aria-disabled="true" title={t(`${S}.posOff`)} className="relative inline-flex h-[22px] w-[40px] shrink-0 cursor-not-allowed items-center rounded-full bg-admin-border-strong opacity-50">
              <span className="inline-block h-[18px] w-[18px] translate-x-[2px] rounded-full bg-white" />
            </span>
            <span className="flex flex-col gap-[3px]">
              <span className="text-[13px] font-medium text-admin-ink">{t(`${S}.pos.${row}`)}</span>
              <span className="text-[11.5px] text-admin-ink-muted">{t(`${S}.pos.${row}Help`)}</span>
            </span>
          </div>
        ))}
      </div>

      <NotWiredCard id="bk-pay" title={t(`${S}.payTitle`)} body={t(`${S}.payOff`)} />
    </div>
  );
}

function OfferingRow({ offering }: { offering: PersonOffering }) {
  const t = useT();
  const visibility =
    offering.visibility === "agency" ? t(`${S}.offeringAgency`) : offering.visibility === "private" ? t(`${S}.offeringPrivate`) : t(`${S}.offeringPublic`);
  return (
    <div className="flex min-h-[44px] items-center gap-[10px] border-b border-admin-border-soft px-[14px] py-[8px] last:border-b-0" data-testid="person-offering">
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-admin-ink">
        {offering.title}
        {offering.priceDisplay ? <span className="font-normal text-admin-ink-muted"> · {offering.priceDisplay}</span> : null}
      </span>
      <MutedChip>{offering.bookingMode === "instant" ? t(`${S}.offeringInstant`) : t(`${S}.offeringRequest`)}</MutedChip>
      {offering.status === "draft" ? <StatePill tone="slate">{t(`${S}.offeringDraft`)}</StatePill> : <StatePill tone="indigo">{visibility}</StatePill>}
    </div>
  );
}

function NotWiredCard({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <div id={id} className={`${CARD} flex flex-col gap-[6px] p-[16px] scroll-mt-[16px]`} data-not-wired="true">
      <div className="text-[13px] font-semibold text-admin-ink">{title}</div>
      <p className={PEOPLE_MUTED}>{body}</p>
    </div>
  );
}
