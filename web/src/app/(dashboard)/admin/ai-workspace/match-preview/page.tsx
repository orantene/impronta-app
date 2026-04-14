import Link from "next/link";

import { ADMIN_PAGE_STACK, ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

import { MatchPreviewClient } from "./match-preview-client";

export default function AiMatchPreviewPage() {
  return (
    <div className={ADMIN_PAGE_STACK}>
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/ai-workspace" className="text-primary hover:underline">
            AI Workspace
          </Link>
        </p>
        <h1 className={ADMIN_SECTION_TITLE_CLASS}>Talent match preview</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Calls <code className="text-xs">POST /api/ai/search</code> with the current flags and keys.
          Explanations render via <code className="text-xs">AIMatchExplanation</code> when enabled in
          settings.
        </p>
      </div>
      <MatchPreviewClient />
    </div>
  );
}
