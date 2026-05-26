import { chooseClientRole, chooseTalentRole } from "@/app/onboarding/actions";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { loadAccessProfile } from "@/lib/access-profile";
import { normalizeOptionalNextPath, resolveAuthenticatedDestination } from "@/lib/auth-flow";
import { isSupabaseConfigured, SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
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
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-[440px] flex-col justify-center px-5 py-16">
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
            {SUPABASE_ENV_HELP}
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

  const { error, next } = await searchParams;
  const nextPath = normalizeOptionalNextPath(next);

  return (
    <div className="mx-auto w-full max-w-[520px] px-5 py-12 sm:py-16">
      {/* Eyebrow */}
      <p
        className="plt-mono text-center text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
        style={{ color: "var(--plt-forest)" }}
      >
        Step 1 of 2 · Role
      </p>

      {/* Title */}
      <h1
        className="plt-display mt-2 text-center text-[1.875rem] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem]"
        style={{ color: "var(--plt-ink)" }}
      >
        How will you use{" "}
        <span style={{ color: "var(--plt-forest)" }}>{PLATFORM_BRAND.name}?</span>
      </h1>
      <p
        className="mx-auto mt-3 max-w-[380px] text-center text-[0.9375rem] leading-[1.5]"
        style={{ color: "var(--plt-muted)" }}
      >
        Pick your role to get the right dashboard. You can&apos;t change this later from here.
      </p>

      {/* Card */}
      <div
        className="mt-8 rounded-[28px] p-6 sm:p-8"
        style={{
          background: "var(--plt-bg-elevated)",
          border: "1px solid var(--plt-hairline-strong)",
          boxShadow:
            "0 24px 60px -28px rgba(15,23,20,0.32), 0 2px 6px -2px rgba(15,23,20,0.06)",
        }}
      >
        {onboardingErrorMessage(error) ? (
          <p
            className="mb-4 rounded-xl px-3 py-2 text-center text-[0.8125rem]"
            style={{
              background: "rgba(180, 35, 24, 0.08)",
              color: "#9b1c14",
              border: "1px solid rgba(180, 35, 24, 0.18)",
            }}
          >
            {onboardingErrorMessage(error)}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <form action={chooseTalentRole} className="contents">
            {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
            <RoleChoice
              glyph={<TalentGlyph />}
              title="I'm Talent"
              description="Model, performer, artist, or creative — get a beautiful profile, share one link, and let bookings come to you."
            />
          </form>

          <form action={chooseClientRole} className="contents">
            {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
            <RoleChoice
              glyph={<ClientGlyph />}
              title="I'm a Client"
              description="Brand, producer, event planner, or casting director — browse the directory and send booking requests."
            />
          </form>
        </div>

        <p
          className="mt-5 text-center text-[0.75rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          Staff accounts are assigned by the agency directly.
        </p>
      </div>
    </div>
  );
}

function RoleChoice({
  glyph,
  title,
  description,
}: {
  glyph: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="submit"
      className="group flex w-full items-start gap-4 rounded-2xl p-4 text-left transition-all hover:-translate-y-px"
      style={{
        background: "var(--plt-bg)",
        border: "1px solid var(--plt-hairline-strong)",
      }}
    >
      <span
        className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors"
        style={{
          background:
            "color-mix(in srgb, var(--plt-forest) 8%, var(--plt-bg-raised))",
          color: "var(--plt-forest)",
        }}
      >
        {glyph}
      </span>
      <span className="flex-1 space-y-1">
        <span
          className="plt-display block text-[1rem] font-semibold tracking-[-0.01em]"
          style={{ color: "var(--plt-ink)" }}
        >
          {title}
        </span>
        <span
          className="block text-[0.8125rem] leading-[1.5]"
          style={{ color: "var(--plt-muted)" }}
        >
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className="mt-3 text-[var(--plt-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--plt-forest)]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 7H11M11 7L7 3M11 7L7 11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}

function TalentGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2.5l2.756 5.583 6.16.895-4.458 4.345 1.053 6.136L12 16.566l-5.51 2.893 1.052-6.136L3.084 8.978l6.16-.895L12 2.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClientGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="7"
        width="18"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
