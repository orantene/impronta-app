"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PlanChangeConfirm } from "@/components/billing/plan-change-confirm";
import { confirmWorkspacePlanChange, previewWorkspacePlanChange } from "./plan-change-actions";

/**
 * TUL-831: a workspace that already subscribes and arrives with
 * `?plan=&interval=` gets the in-app plan change confirm for that target,
 * once, instead of a second checkout. Dismissing it leaves the normal page.
 */
export function WorkspacePlanChangeOpener({
  planKey,
  interval,
  planName,
  tenantSlug,
}: {
  planKey: string;
  interval: "month" | "year";
  planName: string;
  tenantSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const preview = useCallback(() => previewWorkspacePlanChange(tenantSlug, planKey, interval), [tenantSlug, planKey, interval]);
  const confirm = useCallback(
    (prorationDate: number) => confirmWorkspacePlanChange(tenantSlug, planKey, interval, prorationDate),
    [tenantSlug, planKey, interval],
  );
  const close = useCallback(() => setOpen(false), []);
  const done = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-xl">
        <PlanChangeConfirm planName={planName} preview={preview} confirm={confirm} onDone={done} onCancel={close} />
      </div>
    </div>
  );
}
