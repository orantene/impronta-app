"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import type { CmsRevisionListItem } from "@/app/(dashboard)/admin/site-settings/content/cms-revision-actions";
import { getCmsPostRevisionForRestore } from "@/app/(dashboard)/admin/site-settings/content/cms-revision-actions";
import type { CmsPostSnapshot } from "@/lib/cms/revision-snapshots";
import type { Locale } from "@/i18n/config";

type Props = {
  postId: string;
  liveSlug: string;
  liveLocale: Locale;
  items: CmsRevisionListItem[];
  applySnapshot: (snapshot: CmsPostSnapshot) => void;
  onPublicUrlMismatch: (hint: { fromPath: string; toPath: string } | null) => void;
};

export function CmsPostRevisionsPanel({
  postId,
  liveSlug,
  liveLocale,
  items,
  applySnapshot,
  onPublicUrlMismatch,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function restore(revisionId: string) {
    setError(null);
    startTransition(async () => {
      const res = await getCmsPostRevisionForRestore({
        postId,
        revisionId,
        liveSlug,
        liveLocale,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      applySnapshot(res.snapshot);
      onPublicUrlMismatch(res.publicUrlChange);
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 p-4">
        <SectionHeader
          title="Revision history"
          subtitle="Snapshots on each Save. Restore loads the editor only."
          className="!flex-col !items-stretch !gap-1 sm:!flex-col"
        />
        <p className="mt-2 text-xs text-muted-foreground">No revisions yet — save the post once.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 p-4">
      <SectionHeader
        title="Revision history"
        subtitle="Restore merges snapshot fields into this form. If slug or locale differs from the live post, enable the redirect when saving as published."
        className="!flex-col !items-stretch !gap-1 sm:!flex-col"
      />
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm">
        {items.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2"
          >
            <div>
              <span className="font-mono text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
              </span>
              <span
                className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                  r.kind === "published"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {r.kind}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={pending}
              onClick={() => restore(r.id)}
            >
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
