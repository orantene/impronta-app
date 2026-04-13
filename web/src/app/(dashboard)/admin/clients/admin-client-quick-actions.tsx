"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { AdminClientInquiriesPanelTrigger } from "@/components/admin/admin-client-inquiries-panel";
import { AdminUserEditButton } from "@/app/(dashboard)/admin/users/admin-user-edit-button";
import { adminQuickSetAccountStatus } from "@/app/(dashboard)/admin/users/actions";
import { Button } from "@/components/ui/button";
import { ADMIN_OUTLINE_CONTROL_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function AdminClientQuickActions({
  userId,
  accountStatus,
  displayName,
}: {
  userId: string;
  accountStatus: string | null;
  displayName?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const deactivate = () => {
    if (accountStatus === "suspended") {
      toast.message("Already suspended.");
      return;
    }
    if (!window.confirm("Suspend this client account?")) return;
    startTransition(async () => {
      const res = await adminQuickSetAccountStatus(userId, "suspended");
      if (res.error) toast.error(res.error);
      else {
        toast.success("Client suspended.");
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" className="h-8 rounded-lg px-2.5 text-xs" asChild>
        <Link href={`/admin/clients/${userId}`} scroll={false}>
          View
        </Link>
      </Button>
      <AdminUserEditButton userId={userId} />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || accountStatus === "suspended"}
        className={cn("h-8 rounded-lg px-2.5 text-xs text-destructive hover:text-destructive", ADMIN_OUTLINE_CONTROL_CLASS)}
        onClick={deactivate}
      >
        Deactivate
      </Button>
      <AdminClientInquiriesPanelTrigger userId={userId} displayName={displayName} trigger="text" />
      <Button size="sm" variant="outline" className={cn("h-8 rounded-lg px-2.5 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
        <Link href={`/admin/clients/${userId}#saved`} scroll={false}>
          Assign talent
        </Link>
      </Button>
    </div>
  );
}
