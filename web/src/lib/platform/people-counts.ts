/**
 * One definition of the people counts shown on Platform HQ.
 *
 * The Today cards count real (non-test) profiles as "users" and real
 * talent_profiles as "talent". The Users page used to count every row it
 * lists, test rows and unclaimed talents included, so the two screens
 * disagreed (310 / 336 vs 404 / 348). Both now read the same rule: test
 * rows never count, a person with an account is an account, and every real
 * talent profile (claimed or not) is a talent profile.
 */
export type PeopleCountRow = {
  kind: "human" | "unclaimed_talent";
  appRole: string | null;
  isTalent: boolean;
  isTestAccount: boolean;
};

export type PeopleCounts = {
  accounts: number;
  talentProfiles: number;
  clients: number;
  staff: number;
};

const STAFF_ROLES = new Set(["super_admin", "agency_staff", "admin"]);

export function summarizePeople(rows: readonly PeopleCountRow[]): PeopleCounts {
  const out: PeopleCounts = { accounts: 0, talentProfiles: 0, clients: 0, staff: 0 };
  for (const r of rows) {
    if (r.isTestAccount) continue;
    if (r.isTalent) out.talentProfiles += 1;
    if (r.kind !== "human") continue;
    out.accounts += 1;
    if (r.appRole === "client") out.clients += 1;
    if (r.appRole && STAFF_ROLES.has(r.appRole)) out.staff += 1;
  }
  return out;
}
