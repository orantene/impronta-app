import { redirect } from "next/navigation";
import { completeTalentLocationOnboarding } from "@/app/onboarding/actions";
import { TalentLocationOnboardingForm } from "./talent-location-onboarding-form";
import { loadAccessProfile } from "@/lib/access-profile";
import { normalizeOptionalNextPath, resolveAuthenticatedDestination } from "@/lib/auth-flow";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { isSupabaseConfigured, SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import Link from "next/link";

export default async function TalentLocationOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <SetupRequired message={SUPABASE_ENV_HELP} />
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

  const { next } = await searchParams;
  const nextPath = normalizeOptionalNextPath(next);

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 py-12 sm:py-16">
      {/* Eyebrow */}
      <p
        className="plt-mono text-center text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
        style={{ color: "var(--plt-forest)" }}
      >
        Step 2 of 2 · Profile
      </p>

      {/* Title */}
      <h1
        className="plt-display mt-2 text-center text-[2rem] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[2.5rem]"
        style={{ color: "var(--plt-ink)" }}
      >
        Complete your{" "}
        <span style={{ color: "var(--plt-forest)" }}>talent profile.</span>
      </h1>
      <p
        className="mx-auto mt-3 max-w-[420px] text-center text-[0.9375rem] leading-[1.55]"
        style={{ color: "var(--plt-muted)" }}
      >
        Just the essentials — you can complete your portfolio, location and rates from your dashboard.
      </p>

      {/* Card */}
      <div
        className="mt-9 rounded-[28px] p-7 sm:p-10"
        style={{
          background: "var(--plt-bg-elevated)",
          border: "1px solid var(--plt-hairline-strong)",
          boxShadow:
            "0 24px 60px -28px rgba(15,23,20,0.32), 0 2px 6px -2px rgba(15,23,20,0.06)",
        }}
      >
        <TalentLocationOnboardingForm
          action={completeTalentLocationOnboarding}
          nextPath={nextPath}
        />
      </div>

      <p
        className="mt-6 text-center text-[0.75rem]"
        style={{ color: "var(--plt-muted)" }}
      >
        Need help?{" "}
        <Link
          href="/contact"
          className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
          style={{ color: "var(--plt-ink-soft)" }}
        >
          Contact support
        </Link>
      </p>
    </div>
  );
}

function SetupRequired({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[440px] flex-col justify-center px-5">
      <div
        className="rounded-[24px] p-8 text-center"
        style={{
          background: "var(--plt-bg-elevated)",
          border: "1px solid var(--plt-hairline-strong)",
        }}
      >
        <h1
          className="plt-display text-[1.25rem] font-semibold"
          style={{ color: "var(--plt-ink)" }}
        >
          Setup required
        </h1>
        <p
          className="mt-3 text-[0.875rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          {message}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-full border px-5 py-2.5 text-[0.8125rem] font-medium transition-colors"
          style={{
            borderColor: "var(--plt-hairline-strong)",
            color: "var(--plt-ink)",
            background: "var(--plt-bg-raised)",
          }}
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
