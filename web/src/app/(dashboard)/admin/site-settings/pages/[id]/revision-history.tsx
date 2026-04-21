"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { PageRevisionRow } from "@/lib/site-admin/server/pages";

import {
  restorePageRevisionAction,
  type PageActionState,
} from "../actions";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function kindLabel(kind: PageRevisionRow["kind"]): string {
  switch (kind) {
    case "published":
      return "publish";
    case "rollback":
      return "rollback";
    default:
      return "draft";
  }
}

export function RevisionHistory({
  pageId,
  currentVersion,
  revisions,
  canEdit,
}: {
  pageId: string;
  currentVersion: number;
  revisions: PageRevisionRow[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<PageActionState, FormData>(
    restorePageRevisionAction,
    undefined,
  );

  if (revisions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No revisions yet. They appear as you save or publish.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {state && state.ok === false && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state && state.ok === true && (
        <p className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {state.message}
        </p>
      )}
      <ul className="divide-y divide-border/40 rounded-md border border-border/60">
        {revisions.map((rev) => (
          <li
            key={rev.id}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 uppercase tracking-wide text-muted-foreground">
                  {kindLabel(rev.kind)}
                </span>
                <span className="font-mono text-muted-foreground">
                  v{rev.version}
                </span>
                <span className="text-muted-foreground">
                  {formatWhen(rev.created_at)}
                </span>
              </div>
            </div>
            <form action={action}>
              <input type="hidden" name="pageId" value={pageId} />
              <input type="hidden" name="revisionId" value={rev.id} />
              <input
                type="hidden"
                name="expectedVersion"
                value={currentVersion}
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={!canEdit || pending}
              >
                Restore
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
