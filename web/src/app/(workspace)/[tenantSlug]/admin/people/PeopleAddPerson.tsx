"use client";

/**
 * PeopleAddPerson — W32: Add a person · pick hats.
 *
 * Honest about which doors exist. Public profile → the roster's own create
 * drawer (`talent-profile-shell`, mode create), seeded with the name and the
 * address typed here; it owns seat limits, profile codes and exclusivity, so
 * this screen does not open a second writer for the same rows. Access →
 * `invitePersonAccess`, the invitation the Team drawer sends; an invitation
 * is not access, and the screen says so. Bookable alone → no door yet
 * (D-POS-37): the button is disabled with its sentence. "Existing person?"
 * matches the address against the people already loaded, so the same human
 * is not entered twice.
 */

import { useMemo, useState, useTransition } from "react";

import { ActionButton, FactRow } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { personNameOr } from "@/lib/people/display-name";
import { PERSON_HATS, type PersonHat, type PersonRecord } from "@/lib/people/hats";
import { invitePersonAccess, type PeopleActionResult } from "./people-actions";
import { PEOPLE_INPUT, PEOPLE_NOTE, PEOPLE_REFUSAL } from "./people-classes";
import { CARD, MutedChip } from "./people-ui";

const K = "admin.people";
const A = "admin.people.add";

const COMBOS = ["employee", "frontDesk", "talentBooked", "talentOnly", "contractor", "owner"] as const;

export function PeopleAddPerson({
  people,
  onCancel,
  onOpenExisting,
  onCreateProfile,
}: {
  people: readonly PersonRecord[];
  onCancel: () => void;
  onOpenExisting: (key: string) => void;
  onCreateProfile: (name: string, email: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hats, setHats] = useState<Record<PersonHat, boolean>>({ publicProfile: false, bookable: false, access: false });
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PeopleActionResult | null>(null);

  const trimmedEmail = email.trim().toLowerCase();
  const existing = useMemo(
    () => (trimmedEmail.includes("@") ? people.find((p) => p.email?.trim().toLowerCase() === trimmedEmail) ?? null : null),
    [people, trimmedEmail],
  );

  const picked = PERSON_HATS.filter((h) => hats[h]);
  const wantsProfile = hats.publicProfile;
  const wantsAccess = hats.access;
  const bookableOnly = hats.bookable && !wantsProfile && !wantsAccess;

  // The one sentence that says why Continue cannot go, or null when it can.
  const reason = (() => {
    if (picked.length === 0) return t(`${A}.continueOff.noHat`);
    if (!name.trim()) return t(`${A}.continueOff.noName`);
    if (bookableOnly) return t(`${A}.continueOff.bookableOnly`);
    if (wantsAccess && !wantsProfile && !trimmedEmail.includes("@")) return t(`${A}.continueOff.noEmailForAccess`);
    return null;
  })();

  const nextLine = picked.length === 0
    ? t(`${A}.next.none`)
    : bookableOnly
      ? t(`${A}.next.bookableOnly`)
      : wantsProfile
        ? t(`${A}.next.publicProfile`)
        : t(`${A}.next.access`);

  const go = () => {
    setResult(null);
    if (wantsProfile) {
      // The roster's create drawer: the real writer, seeded so nothing is typed twice.
      onCreateProfile(name.trim(), trimmedEmail);
      return;
    }
    startTransition(async () => {
      const r = await invitePersonAccess(trimmedEmail, "viewer");
      setResult(r);
    });
  };

  return (
    <div className="flex flex-col gap-[16px]" data-testid="people-add">
      <div className="grid grid-cols-3 gap-[16px]">
        <label className="flex flex-col gap-[6px] text-[12.5px] font-semibold text-admin-ink">
          <span>
            {t(`${A}.name`)} <span className="text-admin-red">*</span>
          </span>
          <input className={PEOPLE_INPUT} value={name} placeholder={t(`${A}.namePlaceholder`)} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-[6px] text-[12.5px] font-semibold text-admin-ink">
          <span>{t(`${A}.emailOrPhone`)}</span>
          <input className={PEOPLE_INPUT} type="email" value={email} placeholder={t(`${A}.emailPlaceholder`)} onChange={(e) => setEmail(e.target.value)} />
          <span className="text-[11.5px] font-normal text-admin-ink-muted">{t(`${A}.emailHelp`)}</span>
        </label>
        <div className="flex flex-col gap-[6px] text-[12.5px] font-semibold text-admin-ink">
          <span>{t(`${A}.existing`)}</span>
          <div className={`${PEOPLE_INPUT} flex items-center justify-between font-normal`} data-testid="people-add-existing">
            <span className={existing ? "text-admin-ink" : "text-admin-ink-muted"}>
              {existing ? interpolate(t(`${A}.existingMatch`), { name: personNameOr(existing.name, t(`${K}.unnamed`)) }) : t(`${A}.existingNone`)}
            </span>
            {existing ? (
              <button type="button" className="cursor-pointer font-semibold text-admin-brand hover:underline" onClick={() => onOpenExisting(existing.key)}>
                {t(`${A}.openExisting`)}
              </button>
            ) : null}
          </div>
          <span className="text-[11.5px] font-normal text-admin-ink-muted">{t(`${A}.existingHelp`)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-[16px]">
        {PERSON_HATS.map((hat) => {
          const on = hats[hat];
          return (
            <label
              key={hat}
              data-testid={`people-add-hat-${hat}`}
              className={`flex cursor-pointer flex-col gap-[8px] rounded-[14px] border p-[16px] ${
                on ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card"
              }`}
            >
              <span className="flex items-center gap-[8px]">
                <input type="checkbox" className="h-[16px] w-[16px] accent-admin-brand" checked={on} onChange={(e) => setHats((h) => ({ ...h, [hat]: e.target.checked }))} />
                <span className="text-[14px] font-semibold text-admin-ink">{t(`${K}.hat.${hat}`)}</span>
                <span className="flex-1" />
                <MutedChip>{t(`${A}.hatBadge.${hat}`)}</MutedChip>
              </span>
              <span className="text-[12.5px] leading-[1.45] text-admin-ink-muted">{t(`${A}.hatWhat.${hat}`)}</span>
              <span className="text-[11.5px] leading-[1.45] text-admin-ink-muted">
                <b className="font-semibold text-admin-ink">{t(`${A}.asksFor`)}</b> {t(`${A}.asks.${hat}`)}
              </span>
            </label>
          );
        })}
      </div>

      <div className={`${CARD} px-[16px] py-[12px]`} data-testid="people-add-combos">
        <div className="mb-[4px] text-[13px] font-semibold text-admin-ink">{t(`${A}.combosTitle`)}</div>
        {COMBOS.map((c) => (
          <FactRow key={c} label={t(`${A}.combos.${c}`)}>
            {t(`${A}.combos.${c}Hats`)}
          </FactRow>
        ))}
      </div>

      {result ? (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? PEOPLE_NOTE : PEOPLE_REFUSAL} data-testid="people-add-result">
          {result.ok ? t(`${K}.result.${result.note ?? "saved"}`) : t(`${K}.result.${result.reasonKey}`)}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-[12px]">
        <ActionButton onClick={onCancel}>{t(`${A}.cancel`)}</ActionButton>
        <div className="flex items-center gap-[12px]">
          <span className="text-[12px] text-admin-ink-muted">{nextLine}</span>
          <ActionButton tone="primary" reason={reason} disabled={pending} onClick={go} testId="people-add-continue">
            {picked.length === 0 ? t(`${A}.continueBare`) : interpolate(t(`${A}.continue`), { hats: picked.map((h) => t(`${K}.hat.${h}`)).join(" + ") })}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
