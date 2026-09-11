/**
 * The CONTRACT half of the bookable gate, proven against the case that made
 * it necessary: an exclusive primary in ANOTHER workspace.
 *
 * Lane: `npm run test:tenant-isolation`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NOT_EXCLUSIVE,
  resolveExclusivityByTalent,
  type ExclusivityRosterRow,
} from "./exclusivity";
import { bookableHat } from "./hats";

const HERE = "tenant-here";
const ELSEWHERE = "tenant-elsewhere";

const plans = new Map<string, string | null>([
  [HERE, "agency"],
  [ELSEWHERE, "agency"],
]);

function row(over: Partial<ExclusivityRosterRow> = {}): ExclusivityRosterRow {
  return {
    talentProfileId: "t1",
    tenantId: HERE,
    isPrimary: false,
    exclusivityStatus: null,
    externalBookingReleased: false,
    ...over,
  };
}

test("no primary row anywhere means no exclusive claim", () => {
  const verdicts = resolveExclusivityByTalent([row()], plans, HERE);
  assert.deepEqual(verdicts.get("t1"), NOT_EXCLUSIVE);
});

test("this workspace's own exclusive claim does not block booking here", () => {
  const verdicts = resolveExclusivityByTalent([row({ isPrimary: true })], plans, HERE);
  const v = verdicts.get("t1")!;
  assert.equal(v.isExclusive, true);
  assert.equal(v.isExclusivePrimarySite, true);

  const hat = bookableHat({
    hasRosterRow: true,
    rosterStatus: "active",
    rosterSiteVisible: true,
    workspaceAppointmentsEnabled: true,
    workspaceAllowsDirectBooking: false,
    rosterDirectBookingEnabled: true,
    personOptedIn: true,
    isResource: false,
    isExclusive: v.isExclusive,
    isExclusivePrimarySite: v.isExclusivePrimarySite,
    externalBookingReleased: v.externalBookingReleased,
    hasBookingHours: true,
    hasOfferings: true,
  });
  assert.equal(hat.on, true, "an agency's own exclusive talent is bookable on its own site");
});

test("ANOTHER workspace's exclusive claim turns the hat off, with a sentence", () => {
  const verdicts = resolveExclusivityByTalent(
    [row(), row({ tenantId: ELSEWHERE, isPrimary: true })],
    plans,
    HERE,
  );
  const v = verdicts.get("t1")!;
  assert.equal(v.isExclusive, true);
  assert.equal(v.isExclusivePrimarySite, false, "the claim is not ours");

  const hat = bookableHat({
    hasRosterRow: true,
    rosterStatus: "active",
    rosterSiteVisible: true,
    workspaceAppointmentsEnabled: true,
    workspaceAllowsDirectBooking: false,
    rosterDirectBookingEnabled: true,
    personOptedIn: true,
    isResource: false,
    isExclusive: v.isExclusive,
    isExclusivePrimarySite: v.isExclusivePrimarySite,
    externalBookingReleased: v.externalBookingReleased,
    hasBookingHours: true,
    hasOfferings: true,
  });
  assert.equal(hat.on, false, "the screen must not promise what the engine refuses");
  assert.deepEqual(hat.blockedBy, ["exclusiveNotReleased"]);
});

test("a release from the other workspace puts the hat back on", () => {
  const verdicts = resolveExclusivityByTalent(
    [row({ tenantId: ELSEWHERE, isPrimary: true, externalBookingReleased: true })],
    plans,
    HERE,
  );
  const v = verdicts.get("t1")!;
  assert.equal(v.externalBookingReleased, true);
  const hat = bookableHat({
    hasRosterRow: true,
    rosterStatus: "active",
    rosterSiteVisible: true,
    workspaceAppointmentsEnabled: true,
    workspaceAllowsDirectBooking: false,
    rosterDirectBookingEnabled: true,
    personOptedIn: true,
    isResource: false,
    isExclusive: v.isExclusive,
    isExclusivePrimarySite: v.isExclusivePrimarySite,
    externalBookingReleased: v.externalBookingReleased,
    hasBookingHours: true,
    hasOfferings: true,
  });
  assert.equal(hat.on, true);
});

test("a free workspace's primary row is not an exclusive claim", () => {
  const freePlans = new Map<string, string | null>([[ELSEWHERE, "free"]]);
  const verdicts = resolveExclusivityByTalent(
    [row({ tenantId: ELSEWHERE, isPrimary: true })],
    freePlans,
    HERE,
  );
  assert.deepEqual(verdicts.get("t1"), NOT_EXCLUSIVE);
});

test("a declined exclusivity status is not a claim", () => {
  const verdicts = resolveExclusivityByTalent(
    [row({ tenantId: ELSEWHERE, isPrimary: true, exclusivityStatus: "declined" })],
    plans,
    HERE,
  );
  assert.deepEqual(verdicts.get("t1"), NOT_EXCLUSIVE);
});

test("each talent gets its own verdict", () => {
  const verdicts = resolveExclusivityByTalent(
    [
      row({ talentProfileId: "t1", tenantId: ELSEWHERE, isPrimary: true }),
      row({ talentProfileId: "t2" }),
    ],
    plans,
    HERE,
  );
  assert.equal(verdicts.get("t1")!.isExclusive, true);
  assert.deepEqual(verdicts.get("t2"), NOT_EXCLUSIVE);
});
