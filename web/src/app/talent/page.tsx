// Thin tenant-resolver redirect.
//
// Resolves the primary agency slug for the authenticated talent user and
// bounces to the canonical workspace talent shell at /{slug}/talent/today.
//
// Resolution order:
//   1. Unauthenticated → /login?next=/talent (preserving query)
//   2. Has roster row (active or pending) → /{slug}/talent/today
//   3. Has app_role='talent' but no roster → render unlinked-talent landing
//      (no forced /onboarding/role round-trip — they already picked their
//      role; pushing them back to the chooser is pointless friction)
//   4. No app_role yet (genuinely first-time user) → /onboarding/role

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCachedActorSession, getCachedServerSupabase } from "@/lib/server/request-cache";
import { loadTalentPrimaryTenantSlug } from "@/lib/saas/role-tenant-resolver";
import { loadAccessProfile } from "@/lib/access-profile";
import { buildQuerySuffix } from "@/lib/saas/redirect-query";

export const dynamic = "force-dynamic";

export default async function TalentRootPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const querySuffix = buildQuerySuffix(sp);

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent(`/talent${querySuffix}`)}`);
  }

  const slug = await loadTalentPrimaryTenantSlug(session.user.id).catch(() => null);
  if (slug) redirect(`/${slug}/talent/today${querySuffix}`);

  // No roster — branch by whether the user has already picked a role.
  // Pushing a user who already chose "talent" back to the role-chooser
  // makes the app feel broken; show a plain unlinked-talent landing
  // instead so the user understands what's happening.
  const supabase = await getCachedServerSupabase();
  const profile = supabase ? await loadAccessProfile(supabase, session.user.id).catch(() => null) : null;
  if (profile?.app_role !== "talent") {
    redirect(`/onboarding/role${querySuffix}`);
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-16 text-center">
      <h1 className="font-[family-name:var(--font-cinzel)] text-xl font-medium tracking-wide">
        Your talent profile isn&apos;t linked to an agency yet
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Once an agency adds you to their roster, you&apos;ll see your dashboard here. If you were expecting to see one already, your agency contact can link your profile from their roster page.
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        Signed in as <span className="font-medium">{session.user.email}</span>. <Link href="/" className="underline">Back home</Link>.
      </p>
    </div>
  );
}
