"use client";

/**
 * PersonHatsPanel — W28 / W34 / W11 / W29: one person, their three hats, in
 * a sheet over the list. The frame the boards draw around the existing
 * profile drawer: the header (name, TAL code, state, close), the hat strip
 * (Public profile · Bookable · Access, each lit when on) and the three hat
 * sections stacked below it. The Public profile hat OPENS the existing
 * drawer; nothing inside that editor changes here.
 *
 * The rule this panel exists to keep: EVERY refusal reaches the operator as
 * a sentence. A hat that is off always says which switch is off and who can
 * flip it; an action that fails always says why, in the operator's language,
 * from a closed set of reason keys. There is no state in which this panel
 * renders an empty box.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { StatePill, type PillTone } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { personNameOr } from "@/lib/people/display-name";
import {
  hatRemovalAlsoRemoves,
  hatsAfterRemoving,
  holdsMoneyPermissions,
  PERSON_HATS,
  type HatBlockReason,
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
  PEOPLE_REFUSAL,
  PEOPLE_SECONDARY_ACTION,
  PEOPLE_SECTION_TITLE,
  PEOPLE_SELECT,
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
import { PersonBookableHat } from "./PersonBookableHat";
import { PersonRegisterPin } from "./PersonRegisterPin";

const K = "admin.people";
const S = "admin.people.sheet";
const B = "admin.people.board";

const GRANTABLE_ROLES = ["viewer", "editor", "manager", "admin"] as const;

const STATE_TONE: Record<NonNullable<PersonRecord["facts"]["profileState"]>, PillTone> = {
  draft: "slate",
  invited: "indigo",
  published: "green",
  "awaiting-approval": "coral",
  claimed: "green",
};

type Feedback =
  | { kind: "refusal"; reasonKey: PeopleReasonKey }
  | { kind: "note"; reasonKey: PeopleReasonKey }
  | { kind: "saved" }
  | null;

export function PersonHatsPanel({
  person,
  workspaceAllowsDirectBooking,
  registerPinUserIds = [],
  onClose,
}: {
  person: PersonRecord;
  /** See `PeopleSurface.workspaceAllowsDirectBooking`. */
  workspaceAllowsDirectBooking: boolean;
  /** The accounts that hold a register PIN (`agencies.settings.people.pins`). */
  registerPinUserIds?: readonly string[];
  onClose: () => void;
}) {
  const t = useT();
  const { openDrawer, adminBasePath } = useAdminShell();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const name = personNameOr(person.name, t(`${K}.unnamed`));

  // Esc closes the sheet, as it closes the shell's own drawers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      // matches nothing, so the panel would go on showing the state the write
      // just changed, under a line saying it had landed. Refreshing the route
      // the operator is actually on re-runs `loadPeopleSurface`, and the hats
      // below are re-derived from the rows rather than from this callback.
      router.refresh();
    });
  };

  const openProfileEditor = () =>
    person.talentProfileId
      ? openDrawer("talent-profile-shell", {
          mode: "edit-admin",
          talentId: person.talentProfileId,
          seed: { stageName: person.name || undefined, profileCode: person.facts.profileCode ?? undefined },
        })
      : undefined;

  const blanket = cannotTurnOffOneAtATime(person, workspaceAllowsDirectBooking);
  const state = person.facts.profileState;

  return (
    <div className="fixed inset-0 top-[56px] z-[150] max-[720px]:top-0" role="presentation">
      <button type="button" aria-label={t(`${S}.close`)} className="absolute inset-0 cursor-default bg-admin-ink/30" onClick={onClose} />
      {/* An aside, not a dialog: the profile editor that opens over it IS the
          dialog, and a test that asks for "the dialog" must find that one.
          It hangs under the shell's 56px top bar as the boards draw it. */}
      <aside
        aria-label={name}
        data-testid="person-sheet"
        className="absolute inset-y-0 right-0 flex w-[800px] max-w-[94vw] flex-col bg-admin-card font-admin-body leading-[1.2] shadow-[-8px_0_32px_rgba(0,0,0,0.12)]"
      >
        {/* Header: close, name + code, meta, state, the roster door */}
        <header className="flex items-start gap-[12px] border-b border-admin-border bg-admin-card px-[20px] py-[16px]">
          <button type="button" aria-label={t(`${S}.close`)} className="mt-[1px] inline-flex h-[28px] w-[28px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-admin-ink-muted hover:bg-admin-surface-alt hover:text-admin-ink" onClick={onClose}>
            <Icon name="x" size={16} stroke={1.75} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-[8px]">
              <h2 className="m-0 text-[16px]! font-semibold leading-[1.2] text-admin-ink">{name}</h2>
              {person.facts.profileCode ? <span className="font-mono text-[11px] font-semibold tracking-[0.02em] text-admin-ink-muted">{person.facts.profileCode}</span> : null}
            </div>
            <p className="m-0 mt-[4px] text-[12px] leading-[1.3] text-admin-ink-muted">
              {[person.email, person.facts.isYou ? t(`${S}.meta.ownedByYou`) : null, person.accountId ? t(`${S}.meta.hasAccount`) : t(`${S}.meta.noAccount`)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {state ? (
            <StatePill tone={STATE_TONE[state]} state={state}>
              {t(`${B}.state.${state}`)}
            </StatePill>
          ) : null}
          {person.talentProfileId ? (
            <a href={`${adminBasePath}/roster/${person.talentProfileId}`} className="text-[12px] font-semibold text-admin-ink-muted hover:text-admin-ink hover:underline">
              {t(`${S}.openInRoster`)}
            </a>
          ) : null}
        </header>

        {/* The hat strip: a lit pill per hat, the dot in the hat's ink */}
        <div className="flex h-[48px] items-center gap-[6px] border-b border-admin-border bg-admin-surface-alt px-[20px]" data-testid="person-hat-strip">
          {PERSON_HATS.map((hat) => {
            const on = person[hat].on;
            return (
              <a
                key={hat}
                href={`#hat-${hat}`}
                data-hat={hat}
                data-on={on ? "true" : "false"}
                className={`inline-flex h-[28px] items-center gap-[7px] rounded-full px-[12px] text-[12.5px] font-semibold leading-[1.2] no-underline ${
                  on ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-admin-ink-muted"
                }`}
              >
                <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${on ? HAT_DOT[hat] : "bg-admin-ink-dim"}`} />
                {t(`${K}.hat.${hat}`)}
                {hat === "access" && !on ? <span className="font-normal text-admin-ink-dim">· {t(`${S}.strip.notGranted`)}</span> : null}
              </a>
            );
          })}
          <span className="flex-1" />
          <span className="text-[11.5px] text-admin-ink-muted">{t(`${S}.strip.note`)}</span>
        </div>

        {/* The body: the board's section list on the left, the hats on the right */}
        <div className="grid min-h-0 flex-1 grid-cols-[168px_minmax(0,1fr)] gap-[24px] overflow-y-auto px-[20px] py-[16px] max-[720px]:grid-cols-1">
          <SheetNav person={person} />
          <div className="flex min-w-0 flex-col gap-[20px]">
            {feedback ? <FeedbackLine feedback={feedback} /> : null}

            {/* ── Public profile hat (W34) ─────────────────────────────── */}
            <HatBlock id="hat-publicProfile" title={t(`${K}.hat.publicProfile`)} what={t(`${S}.publicWhat`)} state={person.publicProfile}>
              {person.talentProfileId ? (
                <div className="flex flex-wrap items-center gap-[8px]">
                  <button type="button" className={PEOPLE_SECONDARY_ACTION} onClick={openProfileEditor}>
                    {t(`${K}.detail.openProfileEditor`)}
                  </button>
                  <button
                    type="button"
                    className={PEOPLE_SECONDARY_ACTION}
                    disabled={pending}
                    onClick={() => run(() => setPersonPublicProfile(person.talentProfileId!, !person.publicProfile.on))}
                  >
                    {pending ? t(`${K}.detail.working`) : person.publicProfile.on ? t(`${K}.detail.turnOff`) : t(`${K}.detail.turnOn`)}
                  </button>
                </div>
              ) : null}
              <p className={PEOPLE_MUTED}>{t(`${K}.detail.profileEditorNote`)}</p>
              {person.publicProfile.on ? <RemovalConsequence person={person} hat="publicProfile" /> : null}
            </HatBlock>

            {/* ── Bookable hat (W28 / W11) ─────────────────────────────── */}
            <HatBlock
              id="hat-bookable"
              title={t(`${K}.hat.bookable`)}
              what={t(`${K}.hatWhat.bookable`)}
              state={person.bookable}
              // "Only they can say yes, from their own account" is false of a
              // person who has no account: this workspace answers for them, and
              // the toggle under the sentence is exactly that answer.
              reasonKeyFor={(reason) => (reason === "personHasNotOptedIn" && person.accountId == null ? "personHasNotOptedInNoAccount" : reason)}
            >
              {person.talentProfileId ? (
                <PersonBookableHat
                  person={person}
                  name={name}
                  pending={pending}
                  canToggle
                  onToggle={() => run(() => setPersonBookable(person.talentProfileId!, !person.bookable.on))}
                  // NO BUTTON, AND A SENTENCE INSTEAD. PROVEN ON THE QA FIXTURE:
                  // with the workspace-level switch on, "Turn off" wrote
                  // `direct_booking_enabled = false`, the panel said "Saved.",
                  // and the hat stayed On because the engine ORs the two
                  // switches. The column it wrote is inert here, so the control
                  // that wrote it is not offered; the switch that governs is named.
                  blanketRefusal={blanket ? t(`${K}.detail.workspaceBooksEveryone`) : null}
                />
              ) : (
                <p className={PEOPLE_MUTED}>{t(`${K}.reason.noRosterRow`)}</p>
              )}
              <p className={PEOPLE_MUTED}>{t(`${K}.detail.moneyNote`)}</p>
              {person.bookable.on ? <RemovalConsequence person={person} hat="bookable" /> : null}
            </HatBlock>

            {/* ── Access hat (W29) ─────────────────────────────────────── */}
            <HatBlock id="hat-access" title={t(`${K}.hat.access`)} what={t(`${S}.accessWhat`)} state={person.access}>
              <p className={PEOPLE_MUTED}>{`${t(`${K}.detail.roleLabel`)}: ${t(`${K}.role.${person.role ?? "none"}`)}`}</p>
              <p className={PEOPLE_MUTED}>{holdsMoneyPermissions(person) ? t(`${K}.detail.holdsMoney`) : t(`${K}.detail.noMoney`)}</p>

              {person.access.on && person.accountId ? (
                <div className="flex flex-wrap items-center gap-[8px]">
                  <label className="sr-only" htmlFor={`role-${person.key}`}>
                    {t(`${K}.detail.changeRole`)}
                  </label>
                  <select
                    id={`role-${person.key}`}
                    className={`${PEOPLE_SELECT} max-w-[12rem]`}
                    defaultValue={person.role ?? "viewer"}
                    disabled={pending || person.role === "owner"}
                    onChange={(e) => run(() => setPersonAccessRole(person.accountId!, e.target.value))}
                  >
                    {GRANTABLE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(`${K}.role.${role}`)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={PEOPLE_SECONDARY_ACTION} disabled={pending} onClick={() => run(() => revokePersonAccess(person.accountId!))}>
                    {t(`${K}.detail.revokeAccess`)}
                  </button>
                </div>
              ) : null}

              {person.access.on && person.accountId ? <PersonRegisterPin accountId={person.accountId} hasPin={registerPinUserIds.includes(person.accountId)} /> : null}

              {!person.access.on && person.accountId && person.talentProfileId ? (
                <button type="button" className={PEOPLE_SECONDARY_ACTION} disabled={pending} onClick={() => run(() => grantPersonAccess(person.talentProfileId!, "viewer"))}>
                  {t(`${K}.detail.grantAccess`)}
                </button>
              ) : null}

              {!person.access.on && !person.accountId ? <InviteThisPerson person={person} pending={pending} run={run} /> : null}

              {person.access.on ? <RemovalConsequence person={person} hat="access" /> : null}
            </HatBlock>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** The boards' dot per hat, in the hat's own ink. */
const HAT_DOT: Record<PersonHat, string> = {
  publicProfile: "bg-admin-royal",
  bookable: "bg-admin-success",
  access: "bg-admin-brand",
};

/**
 * The board's left column (W28, W34): the sections of each hat as anchors,
 * a lit dot where the hat is on, and under them what the Bookable hat reads
 * from the Public profile. Sticky, so it stays while the hats scroll.
 */
function SheetNav({ person }: { person: PersonRecord }) {
  const t = useT();
  const { effectiveTenant } = useAdminShell();
  const groups: ReadonlyArray<{ hat: PersonHat; label: string; items: ReadonlyArray<{ href: string; label: string }> }> = [
    { hat: "publicProfile", label: t(`${K}.hat.publicProfile`), items: [{ href: "#hat-publicProfile", label: t(`${S}.nav.editor`) }] },
    {
      hat: "bookable",
      label: interpolate(t(`${S}.bookableTitle`), { workspace: effectiveTenant.name }),
      items: [
        { href: "#hat-bookable", label: t(`${S}.nav.status`) },
        { href: "#bk-services", label: t(`${S}.nav.services`) },
        { href: "#bk-hours", label: t(`${S}.nav.hours`) },
        { href: "#bk-requirements", label: t(`${S}.nav.requirements`) },
        { href: "#bk-limits", label: t(`${S}.nav.limits`) },
        { href: "#bk-pos", label: t(`${S}.nav.pos`) },
        { href: "#bk-pay", label: t(`${S}.nav.pay`) },
      ],
    },
    { hat: "access", label: t(`${K}.hat.access`), items: [{ href: "#hat-access", label: t(`${S}.nav.role`) }] },
  ];
  return (
    <nav aria-label={t(`${K}.title`)} className="sticky top-0 flex flex-col gap-[16px] self-start max-[720px]:hidden" data-testid="person-sheet-nav">
      {groups.map((g) => {
        const on = person[g.hat].on;
        return (
          <div key={g.hat} className="flex flex-col gap-[2px]">
            <div className="mb-[4px] text-[10.5px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-admin-ink-muted">{g.label}</div>
            {g.items.map((item) => (
              <a key={item.href} href={item.href} className="flex h-[25px] items-center gap-[8px] rounded-[7px] px-[6px] text-admin-13 font-medium leading-[1.2] text-admin-ink no-underline hover:bg-admin-surface-alt">
                <span aria-hidden className={`h-[6px] w-[6px] shrink-0 rounded-full ${on ? HAT_DOT[g.hat] : "bg-admin-ink-dim"}`} />
                <span className="truncate">{item.label}</span>
              </a>
            ))}
          </div>
        );
      })}
      <div className="flex flex-col gap-[4px] border-t border-admin-border-soft pt-[12px]">
        <div className="mb-[2px] text-[10.5px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-admin-ink-muted">{t(`${S}.readsFrom`)}</div>
        {t(`${S}.readsFromItems`)
          .split(" · ")
          .map((item) => (
            <span key={item} className="flex items-center gap-[8px] text-[12.5px] leading-[1.3] text-admin-ink-muted">
              <Icon name="external" size={11} stroke={1.75} />
              {item}
            </span>
          ))}
      </div>
    </nav>
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
 *   • an invitation is already out to this person: say so, and offer nothing
 *     to click, because sending a second one only revokes the first;
 *   • this workspace has no email for them: say so, and name the editor that
 *     can add one. There is nowhere to send an invitation, and pretending
 *     otherwise is what the free-text box did;
 *   • otherwise: invite THE ADDRESS ON THE RECORD, shown in full before the
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
    return <p className={PEOPLE_NOTE}>{email ? interpolate(t(`${K}.detail.invitationWaitingOn`), { email }) : t(`${K}.reason.invitationPending`)}</p>;
  }

  if (!email) {
    return (
      <div className="flex flex-col gap-[6px]">
        <p className={PEOPLE_SECTION_TITLE}>{t(`${K}.detail.inviteByEmail`)}</p>
        <p className={PEOPLE_REFUSAL}>{t(`${K}.result.noEmailOnFile`)}</p>
        <p className={PEOPLE_MUTED}>{t(`${K}.detail.addEmailWhere`)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[8px]">
      <p className={PEOPLE_SECTION_TITLE}>{t(`${K}.detail.inviteByEmail`)}</p>
      {/* The address, in full, BEFORE the click. */}
      <p className={PEOPLE_MUTED}>{interpolate(t(`${K}.detail.inviteWillGoTo`), { email })}</p>
      {/* An invitation is not access, and the screen says so before it is sent as well as after. */}
      <p className={PEOPLE_NOTE}>{t(`${K}.detail.inviteGrantsNothingYet`)}</p>
      <button type="button" className={PEOPLE_SECONDARY_ACTION} disabled={pending} onClick={() => run(() => invitePersonAccess(email, "viewer"))}>
        {pending ? t(`${K}.detail.working`) : t(`${K}.detail.invite`)}
      </button>
    </div>
  );
}

/**
 * Whether the Bookable hat's "Turn off" can do anything for this person.
 *
 * The engine's agency gate is `workspaceAllow OR roster.direct_booking_enabled`,
 * so while the workspace-level switch is on the per-person column is inert.
 * The hat can still come off through the person's own half (their opt-in),
 * but the workspace may only answer that for a person with no sign-in of
 * their own; `setPersonBookable` does exactly that. For a person who holds
 * an account, there is nothing this panel can write that turns them off, and
 * offering a button would be the defect this branch was found by.
 */
function cannotTurnOffOneAtATime(person: PersonRecord, workspaceAllowsDirectBooking: boolean): boolean {
  return person.bookable.on && workspaceAllowsDirectBooking && person.accountId != null;
}

function FeedbackLine({ feedback }: { feedback: NonNullable<Feedback> }) {
  const t = useT();
  if (feedback.kind === "saved") {
    return (
      <p role="status" className={PEOPLE_NOTE}>
        {t(`${K}.result.saved`)}
      </p>
    );
  }
  const text = t(`${K}.result.${feedback.reasonKey}`);
  return (
    <p role={feedback.kind === "refusal" ? "alert" : "status"} className={feedback.kind === "refusal" ? PEOPLE_REFUSAL : PEOPLE_NOTE}>
      {text}
    </p>
  );
}

function HatBlock({
  id,
  title,
  what,
  state,
  reasonKeyFor,
  children,
}: {
  id: string;
  title: string;
  what: string;
  state: HatState;
  /** Lets a hat say the same refusal differently for a different kind of person. */
  reasonKeyFor?: (reason: HatBlockReason) => string;
  children?: React.ReactNode;
}) {
  const t = useT();
  return (
    <section id={id} className="flex flex-col gap-[10px] rounded-[14px] border border-admin-border bg-admin-card p-[16px]">
      <div className="flex flex-wrap items-center gap-[8px]">
        <h3 className={PEOPLE_SECTION_TITLE}>{title}</h3>
        <span className={`${PEOPLE_CHIP} ${state.on ? PEOPLE_CHIP_ON : PEOPLE_CHIP_OFF}`}>{state.on ? t(`${K}.on`) : t(`${K}.off`)}</span>
      </div>
      <p className={PEOPLE_MUTED}>{what}</p>

      {/* A hat that is off ALWAYS says why. */}
      {state.blockedBy.map((reason) => {
        // Resolved in a variable first so the key family `admin.people.reason.*`
        // is a plain template the static usage check can see.
        const reasonKey = reasonKeyFor ? reasonKeyFor(reason) : reason;
        return (
          <p key={reason} className={PEOPLE_REFUSAL}>
            {t(`${K}.reason.${reasonKey}`)}
          </p>
        );
      })}
      {state.warnings.map((warning) => (
        <p key={warning} className={PEOPLE_WARNING}>
          {t(`${K}.warning.${warning}`)}
        </p>
      ))}
      {children}
    </section>
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
    .map((h) => t(`${K}.hat.${h}`))
    .join(", ");
  return (
    <div className={PEOPLE_NOTE}>
      {alsoRemoves.length > 0 ? <p className="m-0">{t(`${K}.detail.alsoRemoves`)}</p> : null}
      <p className="m-0">{staying ? interpolate(t(`${K}.detail.whatStays`), { hats: staying }) : t(`${K}.detail.nothingElseChanges`)}</p>
    </div>
  );
}
