import { loadAccessProfile } from "@/lib/access-profile";
import { getSiteUrl } from "@/lib/auth-flow";
import { provisionWorkspaceFromLead } from "@/lib/saas/workspace-signup.server";
import { buildWorkspaceRegisterPath } from "@/lib/saas/workspace-signup";
import { isSupabaseConfigured, SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";

const SUPPORT_EMAIL = "hello@tulala.digital";

function buildSupportMailto(leadId: string, state: string): string {
  const subject = encodeURIComponent(
    leadId
      ? `Workspace setup failed — lead ${leadId}`
      : `Workspace setup failed`,
  );
  const body = encodeURIComponent(
    [
      `Hi Tulala team,`,
      ``,
      `I couldn't finish workspace setup.`,
      leadId ? `Lead reference: ${leadId}` : null,
      state ? `State: ${state}` : null,
      ``,
      `(Please add any details about what happened just before this email.)`,
    ]
      .filter((line) => line !== null)
      .join("\n"),
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

function WorkspaceStateCard({
  title,
  message,
  primaryHref,
  primaryLabel,
  supportMailto,
}: {
  title: string;
  message: string;
  primaryHref: string;
  primaryLabel: string;
  supportMailto?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-3 text-center">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link href={primaryHref}>{primaryLabel}</Link>
          </Button>
          {supportMailto ? (
            <Button asChild className="w-full" variant="outline">
              <a href={supportMailto}>Get help</a>
            </Button>
          ) : (
            <Button asChild className="w-full" variant="outline">
              <a href={`${getSiteUrl()}/get-started`}>Back to Get Started</a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function OnboardingWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const { lead } = await searchParams;
  const leadId = typeof lead === "string" ? lead.trim() : "";

  if (!leadId) {
    return (
      <WorkspaceStateCard
        title="Start from Get Started"
        message="We couldn't find the workspace signup request. Start again from Get Started and we'll generate the right claim link for your free workspace."
        primaryHref={`${getSiteUrl()}/get-started`}
        primaryLabel="Start again"
      />
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <WorkspaceStateCard
        title="Setup required"
        message={SUPABASE_ENV_HELP}
        primaryHref={`${getSiteUrl()}/get-started`}
        primaryLabel="Back home"
      />
    );
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return (
      <WorkspaceStateCard
        title="Setup required"
        message={SUPABASE_ENV_HELP}
        primaryHref={`${getSiteUrl()}/get-started`}
        primaryLabel="Back home"
      />
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildWorkspaceRegisterPath(leadId));
  }

  const profile = await loadAccessProfile(supabase, user.id);
  const result = await provisionWorkspaceFromLead({
    leadId,
    userId: user.id,
    userEmail: user.email,
    profile,
  });

  if (result.ok) {
    if (result.checkoutUrl) {
      redirect(result.checkoutUrl);
    }
    redirect(result.adminPath);
  }

  // "One free workspace per owner." Not an error the user can retry away:
  // send them to the workspace they already have instead of leaving them on a
  // dead end, and never pretend the reserved slug was created.
  if (result.error === "free_workspace_limit" && result.existingWorkspace) {
    return (
      <WorkspaceStateCard
        title="You already have a free workspace"
        message={result.message}
        primaryHref={result.existingWorkspace.adminPath}
        primaryLabel={`Open ${result.existingWorkspace.displayName}`}
        supportMailto={buildSupportMailto(leadId, result.error)}
      />
    );
  }

  // Retryable = the provisioner hit a transient error. Send the user BACK
  // to this same route with the same lead ID — provisionWorkspaceFromLead
  // is idempotent (it reuses already-claimed tenants and owned free
  // workspaces), so re-entering the trampoline is the right recovery.
  // Previously this pointed at `/register?lead=<id>`, which is wrong for
  // an already-signed-in user and just dropped them out of the funnel.
  const retryable =
    result.error === "service_unavailable" || result.error === "provision_failed";

  // Show a Get-help mailto on any handled failure that needs human
  // intervention. Skip the mailto on `invalid_lead` (lead doesn't exist
  // or is in the wrong shape — the user just needs to start over).
  const showSupportMailto =
    result.error === "service_unavailable" ||
    result.error === "provision_failed" ||
    result.error === "claimed_elsewhere" ||
    result.error === "unsupported_existing_role";

  return (
    <WorkspaceStateCard
      title="We couldn't open the workspace yet"
      message={result.message}
      primaryHref={
        retryable
          ? `/onboarding/workspace?lead=${encodeURIComponent(leadId)}`
          : `${getSiteUrl()}/get-started`
      }
      primaryLabel={retryable ? "Try again" : "Start again"}
      supportMailto={
        showSupportMailto ? buildSupportMailto(leadId, result.error) : undefined
      }
    />
  );
}
