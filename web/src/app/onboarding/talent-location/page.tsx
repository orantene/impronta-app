import { redirect } from "next/navigation";
import { completeTalentLocationOnboarding } from "@/app/onboarding/actions";
import { TalentLocationOnboardingForm } from "./talent-location-onboarding-form";
import { loadAccessProfile } from "@/lib/access-profile";
import { resolveAuthenticatedDestination } from "@/lib/auth-flow";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { isSupabaseConfigured, SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function TalentLocationOnboardingPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-16">
        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <h1 className="text-center text-xl font-medium">Setup required</h1>
          <p className="mt-3 text-center text-sm text-muted-foreground">{SUPABASE_ENV_HELP}</p>
          <Button className="mt-6 w-full" asChild variant="outline">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) redirect("/");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await loadAccessProfile(supabase, user.id);
  const destination = resolveAuthenticatedDestination(profile);
  if (destination !== "/onboarding/role") {
    redirect(destination);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Complete your profile</h1>
          <p className="text-sm text-muted-foreground">
            Fill in the required fields below to create your talent profile. You can edit all details later from your dashboard.
          </p>
        </div>
        <div className="mt-6">
          <TalentLocationOnboardingForm action={completeTalentLocationOnboarding} />
        </div>
      </div>
    </div>
  );
}
