"use client";

// ============================================================================
// workspace-not-available-screen.tsx — Phase 3 / Pure Talent state
//
// Shown when a signed-in user navigates to /{tenantSlug}/admin but only has
// a talent profile in this tenant (no workspace membership). Replaces the
// previous 404 for talent-only users.
// ============================================================================

import * as React from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StartFreeWorkspaceDialog } from "@/components/talent/start-free-workspace-dialog";

type Props = {
  tenantSlug: string;
  talentDisplayName: string;
};

export function WorkspaceNotAvailableScreen({ tenantSlug, talentDisplayName }: Props) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // Pre-fill workspace name as "DisplayName Studio"
  const defaultWorkspaceName = talentDisplayName
    ? `${talentDisplayName} Studio`
    : "My Studio";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
        {/* Icon */}
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Building2 className="size-6" strokeWidth={1.5} aria-hidden />
        </div>

        {/* Heading */}
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Workspace not available
        </h1>

        {/* Body */}
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          You&apos;re a talent on this platform but don&apos;t have access to a
          workspace. Want to start a free workspace of your own?
        </p>

        {/* Primary CTA */}
        <Button
          className="mt-6 w-full"
          onClick={() => setDialogOpen(true)}
        >
          Start a free workspace
        </Button>

        {/* Secondary link */}
        <Link
          href={`/${tenantSlug}/talent`}
          className="mt-4 block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline transition-colors"
        >
          Back to your talent dashboard
        </Link>
      </div>

      <StartFreeWorkspaceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultWorkspaceName={defaultWorkspaceName}
      />
    </div>
  );
}
