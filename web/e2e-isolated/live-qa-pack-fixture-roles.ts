/**
 * TUL-595: the live-QA pack must never run a check as an account whose role
 * does not match the fixture's name.
 *
 * `fixtures.json` only carries user ids. When the `superAdmin` id pointed at a
 * client profile (`profiles.app_role = 'client'`), every platform-admin check
 * was bounced to /start and the failure read like a product bug. The pack now
 * reads each fixture's profile first and refuses to start, naming the fixture,
 * the role it has, the roles it may have, and the fix.
 *
 * Pure (no I/O) so it is unit-tested in `src/lib/quality/live-qa-pack-fixture-roles.test.ts`.
 */
import { isPlatformAdmin } from "../src/lib/access/platform-role";

export type FixtureName =
  | "myself"
  | "both"
  | "studio"
  | "clientPortal"
  | "superAdmin"
  | "offerDraft"
  | "paidBooking";

/** `profiles.app_role` values a fixture may have. */
export const FIXTURE_ALLOWED_APP_ROLES: Readonly<Record<FixtureName, readonly string[]>> = {
  superAdmin: ["super_admin"],
  clientPortal: ["client"],
  myself: ["talent", "agency_staff"],
  both: ["talent", "agency_staff"],
  studio: ["talent", "agency_staff"],
  offerDraft: ["talent", "agency_staff"],
  paidBooking: ["talent", "agency_staff", "super_admin"],
};

export type FixtureProfile = { app_role?: string | null } | null | undefined;

/** Returns a human message when the fixture's profile does not fit its name, else null. */
export function fixtureRoleProblem(
  name: FixtureName,
  userId: string,
  profile: FixtureProfile,
): string | null {
  if (!profile) {
    return `fixture "${name}" (${userId}) has no profiles row. Create it on the isolated stack (scripts/seed-journeys-program.mjs) or point the fixture at an existing user.`;
  }
  const role = profile.app_role ?? "(none)";
  if (name === "superAdmin") {
    if (isPlatformAdmin(profile)) return null;
    return (
      `fixture "superAdmin" (${userId}) has profiles.app_role="${role}", not "super_admin". ` +
      `Platform-admin pages bounce it to /start. Fix on the ISOLATED project only: ` +
      `update public.profiles set app_role='super_admin' where id='${userId}'; ` +
      `or run scripts/seed-journeys-program.mjs (it seeds qa-journeys-super-admin@impronta.test).`
    );
  }
  const allowed = FIXTURE_ALLOWED_APP_ROLES[name];
  if (allowed.includes(role)) return null;
  return `fixture "${name}" (${userId}) has profiles.app_role="${role}"; expected one of ${allowed.join(", ")}.`;
}

/** All problems across the fixtures that were supplied. Empty array = consistent. */
export function fixtureRoleProblems(
  fixtures: Partial<Record<FixtureName, { userId: string } | undefined>>,
  profiles: ReadonlyMap<string, FixtureProfile>,
): string[] {
  const out: string[] = [];
  for (const name of Object.keys(FIXTURE_ALLOWED_APP_ROLES) as FixtureName[]) {
    const fx = fixtures[name];
    if (!fx) continue;
    const problem = fixtureRoleProblem(name, fx.userId, profiles.get(fx.userId));
    if (problem) out.push(problem);
  }
  return out;
}
