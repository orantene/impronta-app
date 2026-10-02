/**
 * RETIRED — legacy talent onboarding, now a redirect.
 *
 * This was the post-signup profile step for talent who came through the
 * marketing header's register modal. The platform has a second, newer talent
 * signup — /join -> /talent/register -> /register?intent=talent — which lands on
 * /talent/profile/fields, so which button someone pressed decided which
 * onboarding they got. Worse, this one asks a NEW account to create a profile,
 * which is how an invited talent ended up with a duplicate and a permanently
 * unredeemable claim invitation (see auth-flow.ts resolvePostAuthDestination).
 *
 * The five callers now point at /talent/profile/fields directly. This route
 * stays as a redirect rather than a 404 because confirmation emails already
 * sent carry `next=/onboarding/talent-location`, and those land in real inboxes
 * for days. Delete the route, the form and
 * `completeTalentLocationOnboarding` once those have expired.
 *
 * `next` is carried through so a deep link still resolves where it meant to.
 */

import { redirect } from "next/navigation";

import { normalizeOptionalNextPath } from "@/lib/auth-flow";

export default async function TalentLocationOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = normalizeOptionalNextPath(next);
  redirect(safeNext ?? "/talent/profile/fields");
}
