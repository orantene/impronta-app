"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adminTranslationsBulkAiPlaceholder } from "@/app/(dashboard)/admin/translations/actions";

/** Kept for compatibility if referenced; the bio table toolbar uses its own disabled “Bulk AI” control. */
export function TranslationsBulkAiCta() {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      className="rounded-full"
      onClick={() => {
        start(async () => {
          const res = await adminTranslationsBulkAiPlaceholder();
          if ("ok" in res && res.ok) {
            toast.success("Done");
          } else if ("error" in res) {
            toast.message(res.error);
          }
        });
      }}
    >
      Bulk AI (preview)
    </Button>
  );
}
