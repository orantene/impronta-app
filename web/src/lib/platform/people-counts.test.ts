import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizePeople, type PeopleCountRow } from "./people-counts";

const human = (o: Partial<PeopleCountRow> = {}): PeopleCountRow => ({
  kind: "human",
  appRole: "client",
  isTalent: false,
  isTestAccount: false,
  ...o,
});

test("accounts and talent profiles exclude test rows, matching the Today cards", () => {
  const s = summarizePeople([
    human({ appRole: "talent", isTalent: true }),
    human({ appRole: "client" }),
    human({ appRole: "client", isTestAccount: true }),
    { kind: "unclaimed_talent", appRole: "talent", isTalent: true, isTestAccount: false },
    { kind: "unclaimed_talent", appRole: "talent", isTalent: true, isTestAccount: true },
  ]);
  assert.equal(s.accounts, 2);
  assert.equal(s.talentProfiles, 2);
  assert.equal(s.clients, 1);
});

test("a staff member who also holds a talent profile is counted once as staff", () => {
  const s = summarizePeople([human({ appRole: "agency_staff", isTalent: true })]);
  assert.equal(s.staff, 1);
  assert.equal(s.talentProfiles, 1);
  assert.equal(s.accounts, 1);
});
