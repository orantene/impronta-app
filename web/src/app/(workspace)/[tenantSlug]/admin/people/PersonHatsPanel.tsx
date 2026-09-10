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
import { useRouter } from "next/navigation";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { cn } from "@/lib/utils";
import { personNameOr } from "@/lib/people/display-name";
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const run = (action: () => Promise<PeopleActionResult>) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setFeedback({ kind: "refusal", reasonKey: result.reasonKey });
        return;
      }
      setFeedback(result.note ? { kind: "note", reasonKey: result.note } : { kind: "saved" });
      // READ IT BACK. Every action here revalidates `/{slug}/admin/people`, but
      // on a branded host this page IS `/admin/people` and that path string
      // matches nothing — so the panel would go on showing the state the write
      // just changed, under a line saying it had landed. Refreshing the route
      // the operator is actually on re-runs `loadPeopleSurface`, and the hats
      // below are re-derived from the rows rather than from this callback.
      router.refresh();
    });
  };

  return (
    <section className={cn(PEOPLE_SURFACE, "flex flex-col gap-5 p-4 sm:p-5")}>
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">
          {personNameOr(person.name, t("admin.people.unnamed"))}
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
          <InviteThisPerson person={person} pending={pending} run={run} />
        ) : null}

        {person.access.on ? <RemovalConsequence person={person} hat="access" /> : null}
      </HatBlock>
    </section>
  );
}

/**
 * "Invite this person to sign in" — W29, repaired.
 *
 * THE DEFECT THIS REPLACES. A free-text email box sat inside ONE named
 * person's access panel, so an operator could type any address at all and the
 * screen would report success for a write that had nothing to do with the
 * person whose record they were looking at. Worse, even the right address
 * could not grant them access: `inviteTeamMember` writes an invitation token
 * and no membership, so after a successful send the panel re-drew the same
 * empty box and still said the person had no access.
 *
 * WHAT IT DOES NOW. Three states, and every one of them is a sentence:
 *
 *   • an invitation is already out to this person — say so, and offer nothing
 *     to click, because sending a second one only revokes the first;
 *   • this workspace has no email for them — say so, and name the editor that
 *     can add one. There is nowhere to send an invitation, and pretending
 *     otherwise is what the free-text box did;
 *   • otherwise — invite THE ADDRESS ON THE RECORD, shown in full before the
 *     click, and report back that an invitation was sent rather than "Saved".
 *
 * The pending state is not a client-side flag: `people-invitations.ts` reads
 * the live tokens, so it survives a reload and is the same fact the redemption
 * route will act on.
 */
function InviteThisPerson({
  person,
  pending,
  run,
}: {
  person: PersonRecord;
  pending: boolean;
  run: (action: () => Promise<PeopleActionResult>) => void;
}) {
  const t = useT();
  const invitationPending = person.access.blockedBy.includes("invitationPending");
  const email = person.email?.trim() ?? "";

  if (invitationPending) {
    // `HatBlock` has already rendered the `invitationPending` refusal line
    // above; this is the part an operator can act on, which is "wait".
    return (
      <p className={PEOPLE_NOTE}>
        {email
          ? interpolate(t("admin.people.detail.invitationWaitingOn"), { email })
          : t("admin.people.reason.invitationPending")}
      </p>
    );
  }

  if (!email) {
    return (
      <div className="flex flex-col gap-1">
        <p className={PEOPLE_SECTION_TITLE}>{t("admin.people.detail.inviteByEmail")}</p>
        <p className={PEOPLE_REFUSAL}>{t("admin.people.result.noEmailOnFile")}</p>
        <p className={PEOPLE_MUTED}>{t("admin.people.detail.addEmailWhere")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className={PEOPLE_SECTION_TITLE}>{t("admin.people.detail.inviteByEmail")}</p>
      {/* The address, in full, BEFORE the click. */}
      <p className={PEOPLE_MUTED}>
        {interpolate(t("admin.people.detail.inviteWillGoTo"), { email })}
      </p>
      {/* An invitation is not access, and the screen says so before it is sent
          as well as after. */}
      <p className={PEOPLE_NOTE}>{t("admin.people.detail.inviteGrantsNothingYet")}</p>
      <button
        type="button"
        className={PEOPLE_SECONDARY_ACTION}
        disabled={pending}
        onClick={() => run(() => invitePersonAccess(email, "viewer"))}
      >
        {pending ? t("admin.people.detail.working") : t("admin.people.detail.invite")}
      </button>
    </div>
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
