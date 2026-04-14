import { DocsPageHeader } from "@/components/docs/docs-page-header";
import { AiDocsClient } from "./ai-docs-client";
import { AiDocsHeaderActions } from "./ai-docs-header-actions";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";

export const dynamic = "force-dynamic";

export default async function AdminDocsAiPage() {
  const flags = await getAiFeatureFlags();

  return (
    <div className={ADMIN_PAGE_STACK}>
      <DocsPageHeader
        eyebrow="Docs"
        title="AI documentation"
        description="Structured reference for search, ranking, guest experiences, and operator workflows."
        actions={<AiDocsHeaderActions />}
      />
      <AiDocsClient flags={flags} />
    </div>
  );
}
