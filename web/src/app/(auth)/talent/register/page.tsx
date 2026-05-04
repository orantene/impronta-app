import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { normalizeOptionalNextPath } from "@/lib/auth-flow";
import { getPublicHostContext } from "@/lib/saas/scope";
import { RegisterForm } from "../../register/register-form";

/**
 * Phase 3.14 — Branded talent registration entry point.
 *
 * Lives in the (auth) route group so it is reachable by unauthenticated
 * visitors. On an agency host (e.g. improntamodels.com/talent/register),
 * post-auth destination is automatically scoped to /<slug>/talent so the
 * new talent lands in the right workspace.
 */
export default async function TalentRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  // Determine post-auth destination. On an agency host with a known slug
  // redirect to /<slug>/talent; fall back to /talent for app host.
  const hostCtx = await getPublicHostContext();
  const defaultNext =
    hostCtx.kind === "agency" && hostCtx.tenantSlug
      ? `/${hostCtx.tenantSlug}/talent`
      : "/talent";

  // Honour an explicit ?next= override only if it is a valid internal path.
  const nextPath = normalizeOptionalNextPath(next) ?? defaultNext;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Join as Talent</h1>
        <p className="text-sm text-muted-foreground">
          Create an account to join the roster, manage your profile, and
          receive bookings.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {decodeURIComponent(error)}
        </p>
      ) : null}

      <GoogleAuthButton nextPath={nextPath}>Sign up with Google</GoogleAuthButton>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm uppercase">
          <span className="bg-card px-2 text-muted-foreground">or</span>
        </div>
      </div>

      <RegisterForm nextPath={nextPath} />
    </div>
  );
}
