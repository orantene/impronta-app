"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { restoreTalentProfile, softDeleteTalentProfile, type TalentActionState } from "@/app/(dashboard)/admin/talent/actions";
import { Button } from "@/components/ui/button";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

export function AdminTalentRosterActions({
  talentId,
  deletedAt,
}: {
  talentId: string;
  deletedAt: string | null;
}) {
  const [removeState, removeFormAction, removePending] = useActionState<TalentActionState, FormData>(
    softDeleteTalentProfile,
    undefined,
  );
  const [restoreState, restoreFormAction, restorePending] = useActionState<TalentActionState, FormData>(
    restoreTalentProfile,
    undefined,
  );

  const removeToasted = useRef(false);
  const restoreToasted = useRef(false);

  useEffect(() => {
    if (!removeState?.success || removePending) return;
    if (removeToasted.current) return;
    removeToasted.current = true;
    restoreToasted.current = false;
    toast.success("Profile removed from the active roster.");
  }, [removeState?.success, removePending]);

  useEffect(() => {
    if (!restoreState?.success || restorePending) return;
    if (restoreToasted.current) return;
    restoreToasted.current = true;
    removeToasted.current = false;
    toast.success("Profile restored to the active roster.");
  }, [restoreState?.success, restorePending]);

  useEffect(() => {
    removeToasted.current = false;
    restoreToasted.current = false;
  }, [talentId]);

  return (
    <DashboardSectionCard
      title="Roster hygiene"
      description="Soft-remove hides the profile from normal admin and public lists. Restore anytime."
      titleClassName={ADMIN_SECTION_TITLE_CLASS}
    >
      <div className="space-y-3">
        {removeState?.error ? (
          <p className="text-sm text-destructive">{removeState.error}</p>
        ) : null}
        {restoreState?.error ? (
          <p className="text-sm text-destructive">{restoreState.error}</p>
        ) : null}

        {deletedAt ? (
          <form action={restoreFormAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="talent_id" value={talentId} />
            <Button type="submit" variant="secondary" disabled={restorePending}>
              {restorePending ? "Restoring…" : "Restore to active roster"}
            </Button>
          </form>
        ) : (
          <form
            action={removeFormAction}
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              if (
                !confirm(
                  "Remove this talent from the active roster? They will disappear from default lists until restored.",
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="talent_id" value={talentId} />
            <Button type="submit" variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" disabled={removePending}>
              {removePending ? "Removing…" : "Remove from active roster"}
            </Button>
          </form>
        )}
      </div>
    </DashboardSectionCard>
  );
}
