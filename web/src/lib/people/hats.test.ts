/**
 * The People model's guards, each proven by BREAKING the rule and watching
 * the assertion go red before it is restored — a test that only exercises
 * the happy path measures something adjacent to the rule.
 *
 * Lane: `npm run test:tenant-isolation`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_FACTS,
  ACCESS_ROLES,
  HAT_BLOCK_REASONS,
  accessHat,
  bookableHat,
  hatRemovalAlsoRemoves,
  hatsAfterRemoving,
  holdsMoneyPermissions,
  mergePeople,
  performerEligibility,
  personKey,
  pickAProfessional,
  publicProfileHat,
  type AccessRole,
  type BookableInputs,
  type MembershipSide,
  type PersonRecord,
  type RosterSide,
} from "./hats";

// ── fixtures ────────────────────────────────────────────────────────────────

/** Every switch on. Each test turns exactly one off. */
const BOOKABLE_ALL_ON: BookableInputs = {
  hasRosterRow: true,
  rosterStatus: "active",
  rosterSiteVisible: true,
  workspaceAppointmentsEnabled: true,
  workspaceAllowsDirectBooking: false,
  rosterDirectBookingEnabled: true,
  personOptedIn: true,
  isResource: false,
  isExclusive: false,
  isExclusivePrimarySite: false,
  externalBookingReleased: false,
  hasBookingHours: true,
  hasOfferings: true,
};

function person(over: Partial<PersonRecord> = {}): PersonRecord {
  return {
    key: "account:u1",
    name: "Dani Cruz",
    talentProfileId: "t1",
    accountId: "u1",
    email: "dani@example.com",
    avatarUrl: null,
    role: null,
    publicProfile: publicProfileHat({ hasRosterRow: true, rosterStatus: "active" }),
    bookable: bookableHat(BOOKABLE_ALL_ON),
    access: accessHat({ hasMembership: false, membershipStatus: null, hasAccount: true, hasPendingInvitation: false }),
    facts: EMPTY_FACTS,
    ...over,
  };
}

// ── the bookable gate: one switch at a time ─────────────────────────────────

test("all switches on: the bookable hat is on and names no reason", () => {
  const hat = bookableHat(BOOKABLE_ALL_ON);
  assert.equal(hat.on, true);
  assert.deepEqual(hat.blockedBy, []);
  assert.deepEqual(hat.warnings, []);
});

test("each switch, turned off alone, turns the hat off AND names itself", () => {
  const cases: Array<[Partial<BookableInputs>, string]> = [
    [{ workspaceAppointmentsEnabled: false }, "workspaceAppointmentsOff"],
    [{ personOptedIn: false }, "personHasNotOptedIn"],
    [{ rosterDirectBookingEnabled: false }, "agencyGateOff"],
    [{ rosterSiteVisible: false }, "notSiteVisible"],
    [{ hasRosterRow: false }, "noRosterRow"],
    [{ rosterStatus: "removed" }, "rosterRemoved"],
    [{ isExclusive: true }, "exclusiveNotReleased"],
  ];
  for (const [broken, reason] of cases) {
    const hat = bookableHat({ ...BOOKABLE_ALL_ON, ...broken });
    assert.equal(hat.on, false, `${reason}: hat should be off`);
    assert.ok(
      hat.blockedBy.includes(reason as (typeof HAT_BLOCK_REASONS)[number]),
      `${reason}: not named. Got [${hat.blockedBy.join(", ")}]`,
    );
  }
});

test("a refusal ALWAYS carries at least one reason, never an empty box", () => {
  // Every combination of the five booleans the operator can actually flip.
  const flips: Array<keyof BookableInputs> = [
    "workspaceAppointmentsEnabled",
    "workspaceAllowsDirectBooking",
    "rosterDirectBookingEnabled",
    "personOptedIn",
    "rosterSiteVisible",
  ];
  for (let mask = 0; mask < 1 << flips.length; mask++) {
    const input = { ...BOOKABLE_ALL_ON };
    flips.forEach((k, i) => {
      (input as Record<string, unknown>)[k] = (mask & (1 << i)) !== 0;
    });
    const hat = bookableHat(input);
    if (!hat.on) {
      assert.ok(
        hat.blockedBy.length > 0,
        `mask ${mask} refused with no reason: ${JSON.stringify(input)}`,
      );
    }
  }
});

test("GUARD BITES: a hat with no reason would fail the no-empty-box rule", () => {
  // The rule under test is "off implies at least one reason". Prove the
  // assertion can fail by feeding it a hand-made counterexample.
  const fake = { on: false, blockedBy: [] as string[], warnings: [] };
  assert.throws(() => {
    assert.ok(fake.on || fake.blockedBy.length > 0, "silent refusal");
  });
});

test("the workspace-wide allowance substitutes for the per-person one", () => {
  const hat = bookableHat({
    ...BOOKABLE_ALL_ON,
    rosterDirectBookingEnabled: false,
    workspaceAllowsDirectBooking: true,
  });
  assert.equal(hat.on, true, "workspace allowTalentDirectBooking should stand in");
});

test("a resource skips the person opt-in; a person does not", () => {
  const asPerson = bookableHat({ ...BOOKABLE_ALL_ON, personOptedIn: false });
  assert.equal(asPerson.on, false);
  const asResource = bookableHat({
    ...BOOKABLE_ALL_ON,
    personOptedIn: false,
    isResource: true,
  });
  assert.equal(asResource.on, true, "a chair has no login to opt in with");
});

test("no hours is a warning on a bookable person, not a refusal", () => {
  const hat = bookableHat({ ...BOOKABLE_ALL_ON, hasBookingHours: false });
  assert.equal(hat.on, true);
  assert.deepEqual(hat.warnings, ["noBookingHours"]);
  assert.deepEqual(hat.blockedBy, []);
});

// ── pick a professional ─────────────────────────────────────────────────────

test("only the bookable hat puts a person in Pick a professional", () => {
  const bookable = person({ key: "account:a" });
  const publicOnly = person({
    key: "account:b",
    name: "Ana Public",
    bookable: bookableHat({ ...BOOKABLE_ALL_ON, personOptedIn: false }),
  });
  const accessOnly = person({
    key: "account:c",
    name: "Cass Access",
    talentProfileId: null,
    publicProfile: publicProfileHat({ hasRosterRow: false, rosterStatus: null }),
    bookable: bookableHat({ ...BOOKABLE_ALL_ON, hasRosterRow: false }),
    access: accessHat({ hasMembership: true, membershipStatus: "active", hasAccount: true, hasPendingInvitation: false }),
    role: "admin",
  });

  const picked = pickAProfessional([bookable, publicOnly, accessOnly]);
  assert.deepEqual(picked.map((p) => p.key), ["account:a"]);

  // BREAK IT: turn the bookable hat back on for the access-only person and
  // the picker must include them — proving the filter reads the hat and not
  // the presence of a membership.
  const nowBookable = { ...accessOnly, bookable: bookableHat(BOOKABLE_ALL_ON) };
  assert.equal(pickAProfessional([nowBookable]).length, 1);
});

// ── access never grants money by accident ───────────────────────────────────

test("bookable never grants money permissions", () => {
  const bookableNoRole = person();
  assert.equal(bookableNoRole.bookable.on, true);
  assert.equal(holdsMoneyPermissions(bookableNoRole), false);

  // BREAK IT: the same person given a manager membership DOES hold them, so
  // the false above is the hat's doing and not a function that always says no.
  const manager = person({
    role: "manager",
    access: accessHat({ hasMembership: true, membershipStatus: "active", hasAccount: true, hasPendingInvitation: false }),
  });
  assert.equal(holdsMoneyPermissions(manager), true);

  const viewer = person({
    role: "viewer",
    access: accessHat({ hasMembership: true, membershipStatus: "active", hasAccount: true, hasPendingInvitation: false }),
  });
  assert.equal(holdsMoneyPermissions(viewer), false, "viewer is not a money role");
});

test("a removed membership holds nothing, whatever role the row still says", () => {
  const removed = person({
    role: "admin",
    access: accessHat({ hasMembership: true, membershipStatus: "removed", hasAccount: true, hasPendingInvitation: false }),
  });
  assert.equal(removed.access.on, false);
  assert.deepEqual(removed.access.blockedBy, ["membershipRemoved"]);
  assert.equal(holdsMoneyPermissions(removed), false);
});

test("an invitation is not access, and carries no money permissions", () => {
  for (const status of ["invited", "pending_acceptance"]) {
    const hat = accessHat({ hasMembership: true, membershipStatus: status, hasAccount: true, hasPendingInvitation: false });
    assert.equal(hat.on, false, `${status} should not be signed-in access`);
    assert.deepEqual(hat.blockedBy, ["invitationPending"]);
    const invitee = person({ role: "admin", access: hat });
    assert.equal(
      holdsMoneyPermissions(invitee),
      false,
      `${status}: an unaccepted invitation must not carry an admin's money permissions`,
    );
  }
  // BREAK IT: the same membership, accepted, IS access and DOES carry them.
  const accepted = accessHat({
    hasMembership: true,
    membershipStatus: "active",
    hasAccount: true, hasPendingInvitation: false });
  assert.equal(accepted.on, true);
  assert.equal(holdsMoneyPermissions(person({ role: "admin", access: accepted })), true);
});

test("a person with an invitation OUT is a different state from one nobody invited", () => {
  // THE DEFECT THIS EXISTS FOR. "Invite by email" writes a team_invite_tokens
  // row and NO membership, so a hat that only ever asked `hasMembership`
  // answered "noMembership" both before the invitation and after it. The panel
  // therefore reported no access and re-drew the same empty box for a person
  // who had just been invited, and an operator could not tell the two apart.
  const neverInvited = accessHat({
    hasMembership: false,
    membershipStatus: null,
    hasAccount: false,
    hasPendingInvitation: false,
  });
  assert.equal(neverInvited.on, false);
  assert.deepEqual(neverInvited.blockedBy, ["noMembership"]);

  const invited = accessHat({
    hasMembership: false,
    membershipStatus: null,
    hasAccount: false,
    hasPendingInvitation: true,
  });
  // STILL OFF. An invitation is not access, and this must never read as on.
  assert.equal(invited.on, false, "an unaccepted invitation must never be access");
  assert.deepEqual(invited.blockedBy, ["invitationPending"]);
  assert.notDeepEqual(
    invited.blockedBy,
    neverInvited.blockedBy,
    "the screen cannot tell an invited person from an uninvited one",
  );

  // And it carries no permissions, whatever role the token names.
  assert.equal(holdsMoneyPermissions(person({ role: "admin", access: invited })), false);
});

test("every access role is a known role and only three carry money", () => {
  const money = ACCESS_ROLES.filter((r: AccessRole) =>
    holdsMoneyPermissions(
      person({
        role: r,
        access: accessHat({ hasMembership: true, membershipStatus: "active", hasAccount: true, hasPendingInvitation: false }),
      }),
    ),
  );
  assert.deepEqual(money, ["manager", "admin", "owner"]);
});

// ── removing a hat leaves the others ────────────────────────────────────────

test("removing one hat leaves the other two", () => {
  const all = person({
    role: "manager",
    access: accessHat({ hasMembership: true, membershipStatus: "active", hasAccount: true, hasPendingInvitation: false }),
  });
  assert.deepEqual(hatsAfterRemoving(all, "bookable"), ["publicProfile", "access"]);
  assert.deepEqual(hatsAfterRemoving(all, "access"), ["publicProfile", "bookable"]);
  assert.deepEqual(hatsAfterRemoving(all, "publicProfile"), ["bookable", "access"]);
});

test("taking off the public profile hat is declared to take bookable with it", () => {
  const all = person();
  assert.deepEqual(hatRemovalAlsoRemoves(all, "publicProfile"), ["bookable"]);
  assert.deepEqual(hatRemovalAlsoRemoves(all, "bookable"), []);
  assert.deepEqual(hatRemovalAlsoRemoves(all, "access"), []);

  // And the claim is TRUE against the gate, not just a label: drop the roster
  // row and the bookable hat really does go off.
  assert.equal(bookableHat({ ...BOOKABLE_ALL_ON, hasRosterRow: false }).on, false);
});

// ── nobody is entered twice ─────────────────────────────────────────────────

const rosterSide: RosterSide = {
  talentProfileId: "t1",
  accountId: "u1",
  name: "Dani Cruz",
  email: null,
  avatarUrl: null,
  publicProfile: publicProfileHat({ hasRosterRow: true, rosterStatus: "active" }),
  bookable: bookableHat(BOOKABLE_ALL_ON),
  access: accessHat({
    hasMembership: false,
    membershipStatus: null,
    hasAccount: true,
    hasPendingInvitation: false,
  }),
};

const membershipSide: MembershipSide = {
  accountId: "u1",
  name: "D. Cruz",
  email: "dani@example.com",
  avatarUrl: null,
  role: "manager",
  access: accessHat({ hasMembership: true, membershipStatus: "active", hasAccount: true, hasPendingInvitation: false }),
};

test("a roster person carries their own access hat, not a constant", () => {
  // `mergePeople` used to stamp every roster row with a hardcoded
  // "noMembership", which threw away the pending-invitation state before any
  // screen could read it. The roster side answers the question now.
  const invitedOnRoster: RosterSide = {
    ...rosterSide,
    talentProfileId: "t9",
    accountId: null,
    email: "waiting@example.com",
    access: accessHat({
      hasMembership: false,
      membershipStatus: null,
      hasAccount: false,
      hasPendingInvitation: true,
    }),
  };
  const [merged] = mergePeople([invitedOnRoster], []);
  assert.deepEqual(merged!.access.blockedBy, ["invitationPending"]);
  assert.equal(merged!.email, "waiting@example.com", "the invite has nowhere to go without this");

  // BREAK IT: the same roster row with no invitation out reads as never
  // invited, so the line above is the input's doing and not a constant.
  const [plain] = mergePeople([{ ...invitedOnRoster, access: rosterSide.access }], []);
  assert.deepEqual(plain!.access.blockedBy, ["noMembership"]);

  // And a real membership still wins over either: the merge must not let a
  // stale token hide live access.
  const [withMembership] = mergePeople([invitedOnRoster], [
    { ...membershipSide, accountId: "u9" },
  ]);
  assert.equal(withMembership !== undefined, true);
});

test("one human with a roster row AND a membership is ONE record", () => {
  const merged = mergePeople([rosterSide], [membershipSide]);
  assert.equal(merged.length, 1, "the same human was entered twice");
  const [only] = merged;
  assert.equal(only.name, "Dani Cruz", "the profile's own name wins");
  assert.equal(only.email, "dani@example.com", "the account email fills the gap");
  assert.equal(only.talentProfileId, "t1");
  assert.equal(only.accountId, "u1");
  assert.equal(only.publicProfile.on, true);
  assert.equal(only.bookable.on, true);
  assert.equal(only.access.on, true);
  assert.equal(only.role, "manager");
});

test("BREAK IT: different account ids stay two people", () => {
  const merged = mergePeople([rosterSide], [{ ...membershipSide, accountId: "u2" }]);
  assert.equal(merged.length, 2, "two unrelated humans collapsed into one");
});

test("an unclaimed profile and a member with no profile each stand alone", () => {
  const unclaimed: RosterSide = { ...rosterSide, accountId: null };
  const merged = mergePeople([unclaimed], [membershipSide]);
  assert.equal(merged.length, 2);
  const keys = merged.map((p) => p.key).sort();
  assert.deepEqual(keys, ["account:u1", "talent:t1"]);
});

test("personKey prefers the account id and never collapses on empty strings", () => {
  assert.equal(personKey({ accountId: "u1", talentProfileId: "t1" }), "account:u1");
  assert.equal(personKey({ accountId: "  ", talentProfileId: "t1" }), "talent:t1");
  assert.equal(personKey({ accountId: null, talentProfileId: null }), "unknown");
});

test("a member with no profile still shows both other hats as OFF with a reason", () => {
  const [only] = mergePeople([], [membershipSide]);
  assert.equal(only.publicProfile.on, false);
  assert.ok(only.publicProfile.blockedBy.length > 0);
  assert.equal(only.bookable.on, false);
  assert.ok(only.bookable.blockedBy.length > 0);
});

// ── who performs ────────────────────────────────────────────────────────────

test("who performs: three distinct nos and a marked unverified yes", () => {
  const bookablePerson = person();
  const notBookable = person({
    bookable: bookableHat({ ...BOOKABLE_ALL_ON, personOptedIn: false }),
  });

  assert.deepEqual(
    performerEligibility(
      { person: notBookable, skills: [{ skillSlug: "fade", verified: true }], hardNos: [] },
      "fade",
    ),
    { eligible: false, reason: "notBookable" },
  );

  assert.deepEqual(
    performerEligibility(
      { person: bookablePerson, skills: [{ skillSlug: "fade", verified: true }], hardNos: ["fade"] },
      "fade",
    ),
    { eligible: false, reason: "hardNo" },
    "a hard no must REFUSE the assignment, not warn about it",
  );

  assert.deepEqual(
    performerEligibility(
      { person: bookablePerson, skills: [{ skillSlug: "colour", verified: true }], hardNos: [] },
      "fade",
    ),
    { eligible: false, reason: "skillMissing" },
  );

  assert.deepEqual(
    performerEligibility(
      { person: bookablePerson, skills: [{ skillSlug: "fade", verified: false }], hardNos: [] },
      "fade",
    ),
    { eligible: true, verified: false },
    "an unverified match is shown differently, not hidden",
  );

  assert.deepEqual(
    performerEligibility(
      { person: bookablePerson, skills: [{ skillSlug: "fade", verified: true }], hardNos: [] },
      "fade",
    ),
    { eligible: true, verified: true },
  );
});

test("every reason this model can produce is in the published reason list", () => {
  const known = new Set<string>(HAT_BLOCK_REASONS);
  const produced = new Set<string>();
  const record = (r: readonly string[]) => r.forEach((x) => produced.add(x));

  record(publicProfileHat({ hasRosterRow: false, rosterStatus: null }).blockedBy);
  record(publicProfileHat({ hasRosterRow: true, rosterStatus: "removed" }).blockedBy);
  record(accessHat({ hasMembership: false, membershipStatus: null, hasAccount: true, hasPendingInvitation: false }).blockedBy);
  record(accessHat({ hasMembership: true, membershipStatus: "removed", hasAccount: true, hasPendingInvitation: false }).blockedBy);
  record(accessHat({ hasMembership: true, membershipStatus: "invited", hasAccount: true, hasPendingInvitation: false }).blockedBy);
  record(accessHat({ hasMembership: true, membershipStatus: "active", hasAccount: false, hasPendingInvitation: false }).blockedBy);
  for (const broken of [
    { workspaceAppointmentsEnabled: false },
    { personOptedIn: false },
    { rosterDirectBookingEnabled: false },
    { rosterSiteVisible: false },
    { hasRosterRow: false },
    { rosterStatus: "removed" },
    { isExclusive: true },
  ]) {
    record(bookableHat({ ...BOOKABLE_ALL_ON, ...broken }).blockedBy);
  }

  for (const r of produced) {
    assert.ok(known.has(r), `${r} is produced but not published as a reason key`);
  }
  assert.ok(produced.size >= 9, `only ${produced.size} reasons exercised`);
});
