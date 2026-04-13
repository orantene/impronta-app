"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminUserEditSheet } from "@/app/(dashboard)/admin/users/admin-user-edit-sheet";
import { cn } from "@/lib/utils";

export function AdminUserEditButton({
  userId,
  talentProfile,
  label = "Account",
  className,
  title: titleAttr,
}: {
  userId: string;
  talentProfile?: { id: string; profile_code: string; display_name: string | null };
  /** Visible button label (default “Account”). */
  label?: string;
  className?: string;
  /** Native tooltip, e.g. what this dialog edits. */
  title?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(className)}
        title={
          titleAttr ??
          "Edit account login, role, status, and related profile fields in a side panel."
        }
        aria-label={
          label === "Account"
            ? "Open account and login settings"
            : `${label} account and login settings`
        }
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open ? (
        <AdminUserEditSheet
          key={userId}
          open
          onOpenChange={setOpen}
          userId={userId}
          talentProfileId={talentProfile?.id ?? null}
          profileCode={talentProfile?.profile_code ?? null}
        />
      ) : null}
    </>
  );
}
