import { chooseClientRole, chooseTalentRole } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { loadAccessProfile } from "@/lib/access-profile";
import { resolveAuthenticatedDestination } from "@/lib/auth-flow";
import { isSupabaseConfigured, SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

const ONBOARDING_ERROR_COPY: Record<string, string> = {
  failed: "Something went wrong. Please try again.",
  unknown: "Something went wrong. Please try again.",
};

function onboardingErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return ONBOARDING_ERROR_COPY[code] ?? ONBOARDING_ERROR_COPY.failed;
}

export default async function OnboardingRolePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-16">
        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <h1 className="text-center font-[family-name:var(--font-cinzel)] text-xl font-medium tracking-wide">
            Setup required
          </h1>
          <p className="mt-3 text-center text-m text-muted-foreground">
            {SUPABASE_ENV_HELP}
          </p>
          <Button className="mt-6 w-full" asChild variant="outline">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    redirect("/");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await loadAccessProfile(supabase, user.id);

  const destination = resolveAuthenticatedDestination(profile);

  if (destination !== "/onboarding/role") {
    redirect(destination);
  }

  const { error } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-16">
      <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="text-center font-[family-name:var(--font-cinzel)] text-xl font-medium tracking-wide">
          How will you use Impronta?
        </h1>
        <p className="mt-2 text-center text-m text-muted-foreground">
          Choose one — you can&apos;t select staff roles from this screen.
        </p>
        {onboardingErrorMessage(error) ? (
          <p className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-m text-destructive">
            {onboardingErrorMessage(error)}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3">
          <form action={chooseTalentRole}>
            <Button type="submit" className="h-11 w-full text-base">
              I am Talent
            </Button>
          </form>
          <form action={chooseClientRole}>
            <Button
              type="submit"
              variant="outline"
              className="h-11 w-full text-base"
            >
              I am a Client
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
