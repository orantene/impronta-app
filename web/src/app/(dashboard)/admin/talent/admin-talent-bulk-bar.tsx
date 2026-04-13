"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminBulkTalentAction } from "@/app/(dashboard)/admin/talent/actions";
import { Button } from "@/components/ui/button";
import { ADMIN_OUTLINE_CONTROL_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function AdminTalentBulkBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (selectedIds.length === 0) return null;

  const run = (action: Parameters<typeof adminBulkTalentAction>[0]["action"]) => {
    setErr(null);
    startTransition(async () => {
      const res = await adminBulkTalentAction({ talentIds: selectedIds, action });
      if (res.error) {
        setErr(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(`Updated ${res.updated ?? selectedIds.length} profile(s).`);
      onClear();
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--impronta-gold)]/35 bg-[var(--impronta-gold)]/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium text-foreground">
        {selectedIds.length} selected
        {err ? <span className="mt-1 block text-xs text-destructive">{err}</span> : null}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          className="h-8 rounded-lg px-2.5 text-xs"
          onClick={() => run("approve")}
        >
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          className={cn("h-8 rounded-lg px-2.5 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)}
          onClick={() => run("hide")}
        >
          Hide
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          className={cn("h-8 rounded-lg px-2.5 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)}
          onClick={() => run("feature")}
        >
          Feature
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          className={cn("h-8 rounded-lg px-2.5 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)}
          onClick={() => run("unfeature")}
        >
          Unfeature
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          className={cn("h-8 rounded-lg px-2.5 text-xs text-destructive hover:text-destructive", ADMIN_OUTLINE_CONTROL_CLASS)}
          onClick={() => {
            if (!window.confirm("Soft-delete selected profiles? They can be restored from the Removed tab.")) return;
            run("soft_delete");
          }}
        >
          Delete
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          className="h-8 rounded-lg px-2.5 text-xs"
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground sm:max-w-[200px] sm:text-right">
        Assign location per talent in the hub. Messaging uses your normal channels for now.
      </p>
    </div>
  );
}
