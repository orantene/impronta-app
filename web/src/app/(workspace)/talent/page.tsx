// Platform talent root — resolver (same URL as the shell; no duplicate app/talent route).
//
// Resolution order:
//   1. Unauthenticated → /login?next=/talent (preserving query)
//   2. Has talent profile → seed agency cookie, redirect /talent/today
//   3. app_role=talent but no profile → unlinked-talent landing (no shell)
//   4. No app_role → /onboarding/role

import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { getCachedActorSession, getCachedServerSupabase } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  ACTIVE_TALENT_TENANT_COOKIE,
  loadPrimaryTalentAgency,
} from "@/lib/talent/active-agency-context";
import { loadAccessProfile } from "@/lib/access-profile";
import { buildQuerySuffix } from "@/lib/saas/redirect-query";

export const dynamic = "force-dynamic";

export default async function PlatformTalentRootPage({
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

  const admin = createServiceRoleClient();
  if (admin) {
    const { data: profile } = await admin
      .from("talent_profiles")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (profile?.id) {
      try {
        const store = await cookies();
        if (!store.get(ACTIVE_TALENT_TENANT_COOKIE)?.value) {
          const primary = await loadPrimaryTalentAgency(profile.id as string);
          if (primary) {
            store.set(ACTIVE_TALENT_TENANT_COOKIE, primary.tenantId, {
              path: "/",
              httpOnly: true,
              sameSite: "lax",
              maxAge: 60 * 60 * 24 * 365,
            });
          }
        }
      } catch {
        // cookies() unavailable outside request
      }
      redirect(`/talent/today${querySuffix}`);
    }
  }

  const supabase = await getCachedServerSupabase();
  const profile = supabase
    ? await loadAccessProfile(supabase, session.user.id).catch(() => null)
    : null;
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
        Signed in as <span className="font-medium">{session.user.email}</span>.{" "}
        <Link href="/" className="underline">
          Back home
        </Link>
        .
      </p>
    </div>
  );
}
