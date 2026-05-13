import { cookies } from "next/headers";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { normalizeOptionalNextPath } from "@/lib/auth-flow";
import {
  buildWorkspaceOnboardingPath,
  WORKSPACE_SIGNUP_INTENT,
} from "@/lib/saas/workspace-signup";
import { readInviteFromCookieStore } from "@/lib/invites/cookie";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { RegisterForm } from "./register-form";

async function loadInviterAgencyName(): Promise<string | null> {
  try {
    const store = await cookies();
    const payload = readInviteFromCookieStore({ get: (name) => store.get(name) });
    if (!payload) return null;
    const supabase = createPublicSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from("agency_business_identity")
      .select("public_name")
      .eq("tenant_id", payload.inviterTenantId)
      .maybeSingle();
    return (data as { public_name?: string | null } | null)?.public_name?.trim() || null;
  } catch {
    return null;
  }
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    intent?: string;
    lead?: string;
    next?: string;
  }>;
}) {
  const { error, intent, lead, next } = await searchParams;
  const workspaceLeadId = typeof lead === "string" && lead ? lead : null;
  const workspaceIntent = intent === WORKSPACE_SIGNUP_INTENT && workspaceLeadId;
  const nextPath = workspaceIntent
    ? buildWorkspaceOnboardingPath(workspaceLeadId)
    : normalizeOptionalNextPath(next);

  // E.5 — Surface inviter context when the visitor came from /invite/[token].
  const isInviteFlow = !workspaceIntent && nextPath?.startsWith("/invite/");
  const inviterAgencyName = isInviteFlow ? await loadInviterAgencyName() : null;

  const title = workspaceIntent
    ? "Create your operator account"
    : inviterAgencyName
      ? `Join ${inviterAgencyName}`
      : "Create your account";
  const description = workspaceIntent
    ? "Use the same email you used on Get Started. We'll open your free workspace and create its Tulala URL automatically after signup."
    : inviterAgencyName
      ? `${inviterAgencyName} invited you to join their roster. Create a Tulala account to claim your profile and start receiving bookings.`
      : "After signing up you'll choose whether you're Talent (join the agency roster) or a Client (book talent for events).";
  const googleLabel = workspaceIntent ? "Continue with Google" : "Sign up with Google";
  const emailLabel = workspaceIntent
    ? "Create account and open workspace"
    : inviterAgencyName
      ? "Create account & claim profile"
      : "Sign up with email";

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {decodeURIComponent(error)}
        </p>
      ) : null}
      <GoogleAuthButton nextPath={nextPath}>{googleLabel}</GoogleAuthButton>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm uppercase">
          <span className="bg-card px-2 text-muted-foreground">or</span>
        </div>
      </div>
      <RegisterForm nextPath={nextPath} submitLabel={emailLabel} />
    </div>
  );
}
