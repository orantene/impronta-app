"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { AdminUserEditSheet } from "@/app/(dashboard)/admin/users/admin-user-edit-sheet";
import { Button } from "@/components/ui/button";
import { ADMIN_APANEL_USER } from "@/lib/admin/admin-panel-search-params";
import { useAdminPanelState } from "@/hooks/use-admin-panel-state";
import { cn } from "@/lib/utils";

export function AdminUserEditButton({
  userId,
  talentProfile,
  label = "Account",
  className,
  title: titleAttr,
  /** When set and the current route matches `pathname`, open/close syncs `apanel=user` and `aid` on the URL. */
  urlSync,
}: {
  userId: string;
  talentProfile?: { id: string; profile_code: string; display_name: string | null };
  /** Visible button label (default “Account”). */
  label?: string;
  className?: string;
  /** Native tooltip, e.g. what this dialog edits. */
  title?: string;
  urlSync?: { pathname: string };
}) {
  const pathname = usePathname() ?? "";
  const sync = Boolean(urlSync && pathname === urlSync.pathname);
  const { apanel, aid, openPanel, closePanel } = useAdminPanelState({
    pathname: urlSync?.pathname ?? (pathname || "/admin"),
  });
  const urlOpen = sync && apanel === ADMIN_APANEL_USER && aid === userId;
  const [localOpen, setLocalOpen] = useState(false);
  const open = sync ? urlOpen : localOpen;

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
        onClick={() => {
          if (sync) openPanel(ADMIN_APANEL_USER, userId);
          else setLocalOpen(true);
        }}
      >
        {label}
      </Button>
      {open ? (
        <AdminUserEditSheet
          key={userId}
          open={open}
          onOpenChange={(next) => {
            if (!next) {
              if (sync) closePanel();
              else setLocalOpen(false);
            } else if (!sync) {
              setLocalOpen(true);
            }
          }}
          userId={userId}
          talentProfileId={talentProfile?.id ?? null}
          profileCode={talentProfile?.profile_code ?? null}
        />
      ) : null}
    </>
  );
}
