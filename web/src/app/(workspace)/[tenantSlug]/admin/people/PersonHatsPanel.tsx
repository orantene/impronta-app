"use client";

/**
 * PersonHatsPanel — W28 / W11 / W34: one person, their three hats.
 *
 * The rule this panel exists to keep: EVERY refusal reaches the operator as a
 * sentence. A hat that is off always says which switch is off and who can
 * flip it; an action that fails always says why, in the operator's language,
 * from a closed set of reason keys. There is no state in which this panel
 * renders an empty box.
 *
 * The Public profile hat opens the EXISTING profile drawer. Nothing about
 * that editor changes here; it is framed as one hat among three.
 */

import { useState, useTransition } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { cn } from "@/lib/utils";
import {
  hatRemovalAlsoRemoves,
  hatsAfterRemoving,
  holdsMoneyPermissions,
  type HatState,
  type PersonHat,
  type PersonRecord,
} from "@/lib/people/hats";
import {
  PEOPLE_CHIP,
  PEOPLE_CHIP_OFF,
  PEOPLE_CHIP_ON,
  PEOPLE_INPUT,
  PEOPLE_MUTED,
  PEOPLE_NOTE,
  PEOPLE_PRIMARY_ACTION,
  PEOPLE_REFUSAL,
  PEOPLE_SECONDARY_ACTION,
  PEOPLE_SECTION_TITLE,
  PEOPLE_SELECT,
  PEOPLE_SURFACE,
  PEOPLE_WARNING,
} from "./people-classes";
import {
  grantPersonAccess,
  invitePersonAccess,
  revokePersonAccess,
  setPersonAccessRole,
  setPersonBookable,
  setPersonPublicProfile,
  type PeopleActionResult,
  type PeopleReasonKey,
} from "./people-actions";

const GRANTABLE_ROLES = ["viewer", "editor", "manager", "admin"] as const;

type Feedback =
  | { kind: "refusal"; reasonKey: PeopleReasonKey }
  | { kind: "note"; reasonKey: PeopleReasonKey }
  | { kind: "saved" }
  | null;

export function PersonHatsPanel({ person }: { person: PersonRecord }) {
  const t = useT();
  const { openDrawer } = useAdminShell();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [inviteEmail, setInviteEmail] = useState("");

  const run = (action: () => Promise<PeopleActionResult>) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setFeedback({ kind: "refusal", reasonKey: result.reasonKey });
        return;
      }
      setFeedback(result.note ? { kind: "note", reasonKey: result.note } : { kind: "saved" });
    });
  };

  return (
    <section className={cn(PEOPLE_SURFACE, "flex flex-col gap-5 p-4 sm:p-5")}>
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">
          {person.name || t("admin.people.unnamed")}
        </h2>
        {person.email ? <p className={PEOPLE_MUTED}>{person.email}</p> : null}
      </header>

      {feedback ? <FeedbackLine feedback={feedback} /> : null}

      {/* ── Public profile hat (W34) ───────────────────────────────── */}
      <HatBlock
        title={t("admin.people.hat.publicProfile")}
        what={t("admin.people.hatWhat.publicProfile")}
        state={person.publicProfile}
      >
        {person.talentProfileId ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={PEOPLE_SECONDARY_ACTION}
              onClick={() =>
                openDrawer("talent-profile-shell", {
                  mode: "edit-admin",
                  talentId: person.talentProfileId,
                  seed: { stageName: person.name || undefined },
                })
              }
            >
              {t("admin.people.detail.openProfileEditor")}
            </button>
            <button
              type="button"
              className={PEOPLE_SECONDARY_ACTION}
              disabled={pending}
              onClick={() =>
                run(() =>
                  setPersonPublicProfile(person.talentProfileId!, !person.publicProfile.on),
                )
              }
            >
              {pending
                ? t("admin.people.detail.working")
                : person.publicProfile.on
                  ? t("admin.people.detail.turnOff")
                  : t("admin.people.detail.turnOn")}
            </button>
          </div>
        ) : null}
        <p className={PEOPLE_MUTED}>{t("admin.people.detail.profileEditorNote")}</p>
        {person.publicProfile.on ? (
          <RemovalConsequence person={person} hat="publicProfile" />
        ) : null}
      </HatBlock>

      {/* ── Bookable hat (W28 / W11) ───────────────────────────────── */}
      <HatBlock
        title={t("admin.people.hat.bookable")}
        what={t("admin.people.hatWhat.bookable")}
        state={person.bookable}
      >
        {person.talentProfileId ? (
          <button
            type="button"
            className={PEOPLE_PRIMARY_ACTION}
            disabled={pending}
            onClick={() =>
              run(() => setPersonBookable(person.talentProfileId!, !person.bookable.on))
            }
          >
            {pending
              ? t("admin.people.detail.working")
              : person.bookable.on
                ? t("admin.people.detail.turnOff")
                : t("admin.people.detail.turnOn")}
          </button>
        ) : (
          <p className={PEOPLE_MUTED}>{t("admin.people.reason.noRosterRow")}</p>
        )}
        <p className={PEOPLE_MUTED}>{t("admin.people.detail.moneyNote")}</p>
        {person.bookable.on ? <RemovalConsequence person={person} hat="bookable" /> : null}
      </HatBlock>

      {/* ── Access hat (W29) ───────────────────────────────────────── */}
      <HatBlock
        title={t("admin.people.hat.access")}
        what={t("admin.people.hatWhat.access")}
        state={person.access}
      >
        <p className={PEOPLE_MUTED}>
          {`${t("admin.people.detail.roleLabel")}: ${t(
            `admin.people.role.${person.role ?? "none"}`,
          )}`}
        </p>
        <p className={PEOPLE_MUTED}>
          {holdsMoneyPermissions(person)
            ? t("admin.people.detail.holdsMoney")
            : t("admin.people.detail.noMoney")}
        </p>

        {person.access.on && person.accountId ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`role-${person.key}`}>
              {t("admin.people.detail.changeRole")}
            </label>
            <select
              id={`role-${person.key}`}
              className={cn(PEOPLE_SELECT, "max-w-[12rem]")}
              defaultValue={person.role ?? "viewer"}
              disabled={pending || person.role === "owner"}
              onChange={(e) =>
                run(() => setPersonAccessRole(person.accountId!, e.target.value))
              }
            >
              {GRANTABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`admin.people.role.${role}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={PEOPLE_SECONDARY_ACTION}
              disabled={pending}
              onClick={() => run(() => revokePersonAccess(person.accountId!))}
            >
              {t("admin.people.detail.revokeAccess")}
            </button>
          </div>
        ) : null}

        {!person.access.on && person.accountId && person.talentProfileId ? (
          <button
            type="button"
            className={PEOPLE_SECONDARY_ACTION}
            disabled={pending}
            onClick={() => run(() => grantPersonAccess(person.talentProfileId!, "viewer"))}
          >
            {t("admin.people.detail.grantAccess")}
          </button>
        ) : null}

        {!person.access.on && !person.accountId ? (
          <div className="flex flex-col gap-2">
            <p className={PEOPLE_SECTION_TITLE}>{t("admin.people.detail.inviteByEmail")}</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
                <label className="text-xs text-muted-foreground" htmlFor={`email-${person.key}`}>
                  {t("admin.people.detail.emailLabel")}
                </label>
                <input
                  id={`email-${person.key}`}
                  type="email"
                  className={PEOPLE_INPUT}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <button
                type="button"
                className={PEOPLE_SECONDARY_ACTION}
                disabled={pending || inviteEmail.trim().length === 0}
                onClick={() => run(() => invitePersonAccess(inviteEmail.trim(), "viewer"))}
              >
                {t("admin.people.detail.invite")}
              </button>
            </div>
          </div>
        ) : null}

        {person.access.on ? <RemovalConsequence person={person} hat="access" /> : null}
      </HatBlock>
    </section>
  );
}

function FeedbackLine({ feedback }: { feedback: NonNullable<Feedback> }) {
  const t = useT();
  if (feedback.kind === "saved") {
    return <p className={PEOPLE_NOTE}>{t("admin.people.result.saved")}</p>;
  }
  const text = t(`admin.people.result.${feedback.reasonKey}`);
  return (
    <p className={feedback.kind === "refusal" ? PEOPLE_REFUSAL : PEOPLE_NOTE}>{text}</p>
  );
}

function HatBlock({
  title,
  what,
  state,
  children,
}: {
  title: string;
  what: string;
  state: HatState;
  children?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={PEOPLE_SECTION_TITLE}>{title}</h3>
        <span className={cn(PEOPLE_CHIP, state.on ? PEOPLE_CHIP_ON : PEOPLE_CHIP_OFF)}>
          {state.on ? t("admin.people.on") : t("admin.people.off")}
        </span>
      </div>
      <p className={PEOPLE_MUTED}>{what}</p>

      {/* A hat that is off ALWAYS says why. */}
      {state.blockedBy.map((reason) => (
        <p key={reason} className={PEOPLE_REFUSAL}>
          {t(`admin.people.reason.${reason}`)}
        </p>
      ))}
      {state.warnings.map((warning) => (
        <p key={warning} className={PEOPLE_WARNING}>
          {t(`admin.people.warning.${warning}`)}
        </p>
      ))}
      {children}
    </div>
  );
}

/**
 * What taking this hat off would leave behind. Shown BEFORE the click, because
 * "remove" must never read as "delete this person".
 */
function RemovalConsequence({ person, hat }: { person: PersonRecord; hat: PersonHat }) {
  const t = useT();
  const stays = hatsAfterRemoving(person, hat);
  const alsoRemoves = hatRemovalAlsoRemoves(person, hat);
  const staying = stays
    .filter((h) => !alsoRemoves.includes(h))
    .map((h) => t(`admin.people.hat.${h}`))
    .join(", ");
  return (
    <div className={PEOPLE_NOTE}>
      {alsoRemoves.length > 0 ? <p>{t("admin.people.detail.alsoRemoves")}</p> : null}
      <p>
        {staying
          ? interpolate(t("admin.people.detail.whatStays"), { hats: staying })
          : t("admin.people.detail.nothingElseChanges")}
      </p>
    </div>
  );
}
