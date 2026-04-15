import { chooseClientRole, chooseTalentRole } from "@/app/onboarding/actions";
import { loadAccessProfile } from "@/lib/access-profile";
import { resolveAuthenticatedDestination } from "@/lib/auth-flow";
import { isSupabaseConfigured, SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase, Star } from "lucide-react";
import { cn } from "@/lib/utils";

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
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {SUPABASE_ENV_HELP}
          </p>
          <Button className="mt-6 w-full" asChild variant="outline">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const supabase = await getCachedServerSupabase();
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
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 space-y-1.5 text-center">
          <h1 className="font-[family-name:var(--font-cinzel)] text-xl font-medium tracking-wide">
            How will you use Impronta?
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose your role — you can&apos;t change this later from here.
          </p>
        </div>

        {onboardingErrorMessage(error) ? (
          <p className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {onboardingErrorMessage(error)}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <form action={chooseTalentRole} className="contents">
            <button
              type="submit"
              className={cn(
                "group flex w-full items-start gap-4 rounded-xl border border-border/60 bg-card px-4 py-4 text-left transition-all",
                "hover:border-foreground/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/30 transition-colors group-hover:border-foreground/25 group-hover:bg-muted/60">
                <Star className="size-4 text-muted-foreground group-hover:text-foreground" aria-hidden />
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-semibold text-foreground">I&apos;m Talent</span>
                <span className="block text-xs text-muted-foreground">
                  Model, performer, artist, or creative — join the agency roster and receive bookings.
                </span>
              </span>
            </button>
          </form>

          <form action={chooseClientRole} className="contents">
            <button
              type="submit"
              className={cn(
                "group flex w-full items-start gap-4 rounded-xl border border-border/60 bg-card px-4 py-4 text-left transition-all",
                "hover:border-foreground/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/30 transition-colors group-hover:border-foreground/25 group-hover:bg-muted/60">
                <Briefcase className="size-4 text-muted-foreground group-hover:text-foreground" aria-hidden />
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-semibold text-foreground">I&apos;m a Client</span>
                <span className="block text-xs text-muted-foreground">
                  Brand, production company, or event organiser — browse the directory and send booking requests.
                </span>
              </span>
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Staff accounts are assigned by the agency directly.
        </p>
      </div>
    </div>
  );
}
