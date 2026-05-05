import { loadAccessProfile } from "@/lib/access-profile";
import { getSiteUrl } from "@/lib/auth-flow";
import { provisionWorkspaceFromLead } from "@/lib/saas/workspace-signup.server";
import { buildWorkspaceRegisterPath } from "@/lib/saas/workspace-signup";
import { isSupabaseConfigured, SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";

function WorkspaceStateCard({
  title,
  message,
  primaryHref,
  primaryLabel,
}: {
  title: string;
  message: string;
  primaryHref: string;
  primaryLabel: string;
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
          <Button asChild className="w-full" variant="outline">
            <a href={`${getSiteUrl()}/get-started`}>Back to Get Started</a>
          </Button>
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
    redirect(result.adminPath);
  }

  const retryable =
    result.error === "service_unavailable" || result.error === "provision_failed";

  return (
    <WorkspaceStateCard
      title="We couldn't open the workspace yet"
      message={result.message}
      primaryHref={retryable ? buildWorkspaceRegisterPath(leadId) : `${getSiteUrl()}/get-started`}
      primaryLabel={retryable ? "Try workspace signup again" : "Start again"}
    />
  );
}
