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
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-16 text-center">
      <div className="inline-flex items-center justify-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/30 text-2xl">
          👋
        </span>
      </div>
      <h1 className="mt-5 font-[family-name:var(--font-cinzel)] text-xl font-medium tracking-wide">
        Profile created — you&apos;re in!
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Your talent profile exists but isn&apos;t linked to an agency roster yet. Once an agency admin adds you, your full dashboard and booking pipeline will appear here.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-card p-5 text-left">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          What to do next
        </p>
        <ul className="mt-4 space-y-3">
          <li className="flex items-start gap-3 text-sm text-foreground">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[0.625rem] font-semibold text-muted-foreground">1</span>
            <span>Share your profile link with an agency or coordinator who uses Tulala so they can add you to their roster.</span>
          </li>
          <li className="flex items-start gap-3 text-sm text-foreground">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[0.625rem] font-semibold text-muted-foreground">2</span>
            <span>Once added, your availability, inquiries, and bookings will appear here automatically.</span>
          </li>
          <li className="flex items-start gap-3 text-sm text-foreground">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[0.625rem] font-semibold text-muted-foreground">3</span>
            <span>Check your inbox — if an agency already invited you, there&apos;s a confirmation email waiting.</span>
          </li>
        </ul>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Signed in as <span className="font-medium">{session.user.email}</span>.{" "}
        <Link href="/" className="underline underline-offset-4">
          Back home
        </Link>
      </p>
    </div>
  );
}
