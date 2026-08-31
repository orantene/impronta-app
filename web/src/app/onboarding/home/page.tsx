/**
 * Home chooser — for accounts with more than one valid dashboard.
 *
 * THE BUG THIS EXISTS FOR
 * A talent who opens a workspace keeps `app_role = 'talent'`: workspace
 * provisioning deliberately never overwrites an existing role
 * (`resolveWorkspaceOwnerAppRole`). Routing read `app_role`, which holds exactly
 * one value, so they landed on /talent forever — and the staff-role gate on
 * /admin meant the workspace they owned was unreachable from the app entirely.
 * The gate is fixed (membership decides, at web/src/app/admin/page.tsx); this
 * page is the other half: somewhere to say which side is home.
 *
 * NOT AN INTERSTITIAL. Nothing redirects here. Forcing a chooser on login would
 * put a question in front of people who already know where they were going, and
 * a redirect driven by object counts costs queries on the hot path. It is a
 * destination: linked from the surface switcher, and reachable directly.
 *
 * Single-home accounts never see it — they are sent to the one home they have,
 * because a choice between one option is not a choice.
 */

import { redirect } from "next/navigation";

import { chooseHomeSurface } from "./actions";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  HOME_PATH,
  deriveStructure,
  isRepresented,
  reachableWorkspaces,
  validHomes,
  type Home,
} from "@/lib/tulala/structure-model";
import {
  loadHomePreference,
  loadOwnedObjects,
} from "@/lib/tulala/structure-model.server";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  unknown: "That isn't one of your dashboards.",
  unavailable: "You don't have that dashboard yet.",
  failed: "Couldn't save your choice. Please try again.",
};

export default async function OnboardingHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/");

  const session = await getCachedActorSession();
  if (!session.user) redirect("/login?next=%2Fonboarding%2Fhome");

  const [owned, storedPreference] = await Promise.all([
    loadOwnedObjects(session.user.id),
    loadHomePreference(session.user.id),
  ]);

  const homes = validHomes(owned, session.profile?.app_role ?? null);

  // Nothing to choose between. An account with no dashboards at all still needs
  // to finish signup, which is what /onboarding/role is for.
  if (homes.length === 0) redirect("/onboarding/role");
  if (homes.length === 1) redirect(HOME_PATH[homes[0] as Home]);

  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_COPY[error] ?? ERROR_COPY.failed) : null;

  const structure = deriveStructure(owned);
  const workspaces = reachableWorkspaces(owned);
  const workspaceName =
    workspaces.find((w) => w.displayName)?.displayName ?? "your workspace";

  return (
    <div className="mx-auto w-full max-w-[520px] px-5 py-12 sm:py-16">
      <p
        className="plt-mono text-center text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
        style={{ color: "var(--plt-forest)" }}
      >
        Your home
      </p>

      <h1
        className="plt-display mt-2 text-center text-[1.875rem] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem]"
        style={{ color: "var(--plt-ink)" }}
      >
        Where should we{" "}
        <span style={{ color: "var(--plt-forest)" }}>start you?</span>
      </h1>
      <p
        className="mx-auto mt-3 max-w-[400px] text-center text-[0.9375rem] leading-[1.5]"
        style={{ color: "var(--plt-muted)" }}
      >
        {structure === "hybrid"
          ? "You have both a profile and a workspace. Pick the one to open on sign-in. You keep full access to the other, and you can change this whenever you like."
          : "Pick the dashboard to open on sign-in. You keep access to the others, and you can change this whenever you like."}
      </p>

      <div
        className="mt-8 rounded-[28px] p-6 sm:p-8"
        style={{
          background: "var(--plt-bg-elevated)",
          border: "1px solid var(--plt-hairline-strong)",
          boxShadow:
            "0 24px 60px -28px rgba(15,23,20,0.32), 0 2px 6px -2px rgba(15,23,20,0.06)",
        }}
      >
        {errorMessage ? (
          <p
            className="mb-4 rounded-xl px-3 py-2 text-center text-[0.8125rem]"
            style={{
              background: "rgba(180, 35, 24, 0.08)",
              color: "#9b1c14",
              border: "1px solid rgba(180, 35, 24, 0.18)",
            }}
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          {homes.includes("workspace") ? (
            <form action={chooseHomeSurface} className="contents">
              <input type="hidden" name="home" value="workspace" />
              <HomeChoice
                glyph={<WorkspaceGlyph />}
                title={workspaceName}
                description="Roster, bookings, payments, and your website."
                isCurrent={storedPreference === "workspace"}
              />
            </form>
          ) : null}

          {homes.includes("talent") ? (
            <form action={chooseHomeSurface} className="contents">
              <input type="hidden" name="home" value="talent" />
              <HomeChoice
                glyph={<TalentGlyph />}
                title="My profile"
                description={
                  isRepresented(owned)
                    ? "Your own bookings, calendar, and earnings, including work through the agencies that represent you."
                    : "Your own bookings, calendar, and earnings."
                }
                isCurrent={storedPreference === "talent"}
              />
            </form>
          ) : null}

          {homes.includes("client") ? (
            <form action={chooseHomeSurface} className="contents">
              <input type="hidden" name="home" value="client" />
              <HomeChoice
                glyph={<ClientGlyph />}
                title="Booking dashboard"
                description="The requests you've sent and the talent you've saved."
                isCurrent={storedPreference === "client"}
              />
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const HOME_CHOICE_CLASSNAME =
  "group flex w-full items-start gap-4 rounded-2xl p-4 text-left transition-all hover:-translate-y-px";

function HomeChoice({
  glyph,
  title,
  description,
  isCurrent,
}: {
  glyph: React.ReactNode;
  title: string;
  description: string;
  isCurrent: boolean;
}) {
  return (
    <button
      type="submit"
      className={HOME_CHOICE_CLASSNAME}
      style={{
        background: "var(--plt-bg)",
        border: isCurrent
          ? "1px solid var(--plt-forest)"
          : "1px solid var(--plt-hairline-strong)",
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
      {isCurrent ? (
        <span
          className="plt-mono mt-3 shrink-0 text-[0.5625rem] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--plt-forest)" }}
        >
          Current
        </span>
      ) : (
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
      )}
    </button>
  );
}

function WorkspaceGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3.5 20.5h17M5 20.5V9.2a1 1 0 0 1 .46-.84l6-3.9a1 1 0 0 1 1.08 0l6 3.9a1 1 0 0 1 .46.84V20.5M9.5 20.5v-4.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v4.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
