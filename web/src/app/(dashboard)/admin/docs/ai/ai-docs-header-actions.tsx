"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AiWorkspaceQuickEnableButton } from "@/app/(dashboard)/admin/ai-workspace/ai-workspace-quick-enable";
import { Button } from "@/components/ui/button";
import { ADMIN_OUTLINE_CONTROL_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export function AiDocsHeaderActions() {
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
      <AiWorkspaceQuickEnableButton />
      <Button asChild className={cn(ADMIN_OUTLINE_CONTROL_CLASS, "h-9 shrink-0")} variant="outline" size="sm">
        <Link href="/admin/ai-workspace/settings">
          AI settings
          <ExternalLink className="ml-1 size-3.5 opacity-60" aria-hidden />
        </Link>
      </Button>
      <Button asChild className={cn(ADMIN_OUTLINE_CONTROL_CLASS, "h-9 shrink-0")} variant="outline" size="sm">
        <Link href="/admin/ai-workspace/logs">
          Search logs
          <ExternalLink className="ml-1 size-3.5 opacity-60" aria-hidden />
        </Link>
      </Button>
      <Button asChild className={cn(ADMIN_OUTLINE_CONTROL_CLASS, "h-9 shrink-0")} variant="outline" size="sm">
        <Link href="/admin/ai-workspace/match-preview">
          Match preview
          <ExternalLink className="ml-1 size-3.5 opacity-60" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
