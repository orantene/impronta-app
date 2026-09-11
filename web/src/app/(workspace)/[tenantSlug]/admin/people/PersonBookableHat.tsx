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
 *   • Hours & locations → the SAME `BookingHoursCard` the talent Calendar
 *     settings mount, writing `talent_booking_hours` through
 *     `saveBookingHours`;
 *   • Requirements, Limits, Pay, POS permissions and "From our Catalog" →
 *     drawn with their sentence, disabled: nothing stores them per person
 *     yet (D-POS-37).
 */

import { BookingHoursCard } from "@/components/appointments/BookingHoursCard";
import { ActionButton, StatePill } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { PersonOffering, PersonRecord } from "@/lib/people/hats";
import { PEOPLE_MUTED, PEOPLE_NOTE, PEOPLE_REFUSAL } from "./people-classes";
import { CARD, HatChip, MutedChip, SectionTitle } from "./people-ui";

const K = "admin.people";
const S = "admin.people.sheet";

const POS_ROWS = ["completeOwn", "collectMoney", "openDrawer", "ownIntake"] as const;

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
    <div className="flex flex-col gap-[16px]" data-testid="person-bookable-hat">
      <div>
        <div className="text-[15px] font-semibold text-admin-ink">{interpolate(t(`${S}.bookableTitle`), { workspace: effectiveTenant.name })}</div>
        <p className={PEOPLE_MUTED}>{interpolate(t(`${S}.bookableWhat`), { name })}</p>
      </div>

      {/* The toggle: the one switch that puts a person in Pick a professional */}
      <div className={`${CARD} flex flex-col gap-[10px] px-[16px] py-[12px]`}>
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
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13px] font-semibold text-admin-ink">{t(`${S}.toggleLabel`)}</span>
            <span className="text-[11.5px] text-admin-ink-muted">{t(`${S}.toggleHelp`)}</span>
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
      <div className="flex flex-col gap-[8px]">
        <SectionTitle sub={t(`${S}.servicesSub`)}>{interpolate(t(`${S}.servicesTitle`), { name })}</SectionTitle>
        <div className={`${CARD} overflow-hidden`}>
          <div className="border-b border-admin-border-soft bg-admin-surface px-[14px] py-[8px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">
            {t(`${S}.fromCatalog`)}
          </div>
          <p className={`${PEOPLE_MUTED} px-[14px] py-[10px]`} data-not-wired="true">
            {t(`${S}.fromCatalogOff`)}
          </p>
          <div className="border-y border-admin-border-soft bg-admin-surface px-[14px] py-[8px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">
            {interpolate(t(`${S}.ownOfferings`), { name })}
          </div>
          {offerings.length === 0 ? (
            <p className={`${PEOPLE_MUTED} px-[14px] py-[10px]`}>{t(`${S}.ownOfferingsNone`)}</p>
          ) : (
            offerings.map((o) => <OfferingRow key={o.id} offering={o} />)
          )}
          <div className="flex flex-wrap items-center gap-[8px] border-t border-admin-border-soft px-[14px] py-[10px]">
            <ActionButton reason={t(`${S}.addFromCatalogOff`)} testId="person-add-from-catalog">
              + {t(`${S}.addFromCatalog`)}
            </ActionButton>
            <ActionButton onClick={openBookingTerms} disabled={!person.talentProfileId} testId="person-edit-offerings">
              {interpolate(t(`${S}.pickOwnOfferings`), { name })}
            </ActionButton>
          </div>
        </div>
      </div>

      {/* Hours & locations: the real editor, the real table */}
      <div className="flex flex-col gap-[8px]" data-testid="person-hours">
        <SectionTitle sub={t(`${S}.hoursSub`)}>{t(`${S}.hoursTitle`)}</SectionTitle>
        <p className={PEOPLE_NOTE} data-not-wired="true">
          {t(`${S}.hoursLocationsOff`)}
        </p>
        {person.talentProfileId ? <BookingHoursCard talentProfileId={person.talentProfileId} /> : null}
      </div>

      {/* Requirements · Limits · Pay: the facts that are not checked yet, said so */}
      <div className="grid grid-cols-2 gap-[12px]">
        <NotWiredCard title={t(`${S}.requirementsTitle`)} body={t(`${S}.requirementsOff`)} />
        <NotWiredCard title={t(`${S}.limitsTitle`)} body={t(`${S}.limitsOff`)} />
      </div>
      <NotWiredCard title={t(`${S}.payTitle`)} body={t(`${S}.payOff`)} />

      {/* POS permissions: drawn as the board draws them, every switch disabled with the sentence */}
      <div className={`${CARD} flex flex-col gap-[10px] p-[16px]`} data-testid="person-pos-permissions">
        <SectionTitle sub={interpolate(t(`${S}.posSub`), { name })}>{t(`${S}.posTitle`)}</SectionTitle>
        <p className={PEOPLE_NOTE} data-not-wired="true">
          {t(`${S}.posOff`)}
        </p>
        {POS_ROWS.map((row) => (
          <div key={row} className="flex items-center gap-[12px]">
            <span role="switch" aria-checked={false} aria-disabled="true" title={t(`${S}.posOff`)} className="relative inline-flex h-[22px] w-[40px] shrink-0 cursor-not-allowed items-center rounded-full bg-admin-border-strong opacity-50">
              <span className="inline-block h-[18px] w-[18px] translate-x-[2px] rounded-full bg-white" />
            </span>
            <span className="flex flex-col">
              <span className="text-[13px] font-medium text-admin-ink">{t(`${S}.pos.${row}`)}</span>
              <span className="text-[11.5px] text-admin-ink-muted">{t(`${S}.pos.${row}Help`)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="text-[11.5px] text-admin-ink-muted">
        <b className="font-semibold uppercase tracking-[0.06em] text-admin-ink-muted">{t(`${S}.readsFrom`)}</b> · {t(`${S}.readsFromItems`)}
      </div>
    </div>
  );
}

function OfferingRow({ offering }: { offering: PersonOffering }) {
  const t = useT();
  const visibility =
    offering.visibility === "agency" ? t(`${S}.offeringAgency`) : offering.visibility === "private" ? t(`${S}.offeringPrivate`) : t(`${S}.offeringPublic`);
  return (
    <div className="flex items-center gap-[10px] border-b border-admin-border-soft px-[14px] py-[9px] last:border-b-0" data-testid="person-offering">
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-admin-ink">
        {offering.title}
        {offering.priceDisplay ? <span className="font-normal text-admin-ink-muted"> · {offering.priceDisplay}</span> : null}
      </span>
      <MutedChip>{offering.bookingMode === "instant" ? t(`${S}.offeringInstant`) : t(`${S}.offeringRequest`)}</MutedChip>
      {offering.status === "draft" ? <StatePill tone="slate">{t(`${S}.offeringDraft`)}</StatePill> : <StatePill tone="indigo">{visibility}</StatePill>}
    </div>
  );
}

function NotWiredCard({ title, body }: { title: string; body: string }) {
  return (
    <div className={`${CARD} flex flex-col gap-[6px] p-[16px]`} data-not-wired="true">
      <div className="text-[13px] font-semibold text-admin-ink">{title}</div>
      <p className={PEOPLE_MUTED}>{body}</p>
    </div>
  );
}
