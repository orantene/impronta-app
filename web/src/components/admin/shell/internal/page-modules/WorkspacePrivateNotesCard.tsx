"use client";

// TUL-1686: in a team studio the client's private review note goes to the
// workspace, not the talent. Staff read them here, on the workspace Reviews page.
// Renders nothing for any other work model (the loader returns no notes) or when
// there are none, so other workspaces see no change.

import { useEffect, useState } from "react";
import { useT } from "@/i18n/use-t";
import { loadWorkspaceReviewPrivateNotesAction } from "@/lib/reviews/review-moderation-queue-actions";
import type { WorkspaceReviewPrivateNote } from "@/lib/reviews/review-moderation-loaders";

export function WorkspacePrivateNotesCard({ tenantId }: { tenantId: string }) {
  const t = useT();
  const [notes, setNotes] = useState<WorkspaceReviewPrivateNote[]>([]);

  useEffect(() => {
    let alive = true;
    loadWorkspaceReviewPrivateNotesAction(tenantId)
      .then((rows) => {
        if (alive) setNotes(rows);
      })
      .catch(() => {
        if (alive) setNotes([]);
      });
    return () => {
      alive = false;
    };
  }, [tenantId]);

  if (notes.length === 0) return null;

  return (
    <section
      data-testid="workspace-private-notes"
      className="mt-[16px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[16px]"
    >
      <h3 className="text-admin-13 font-semibold text-admin-ink">{t("dashboard.adminReviews.privateNotesTitle")}</h3>
      <p className="mt-[4px] text-admin-11h text-admin-ink-muted">{t("dashboard.adminReviews.privateNotesHint")}</p>
      <ul className="mt-[12px] flex flex-col gap-[10px]">
        {notes.map((n) => (
          <li key={n.reviewId} className="rounded-[8px] border border-admin-border-soft p-[10px]">
            <p className="whitespace-pre-wrap text-admin-13 text-admin-ink">{n.note}</p>
            {n.talentName ? (
              <p className="mt-[4px] text-admin-11h text-admin-ink-muted">
                {t("dashboard.adminReviews.privateNotesWith", { name: n.talentName })}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
