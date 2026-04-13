"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ADMIN_ACTION_TERTIARY_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export function AdminCopyEntityIdButton({
  id,
  label = "Copy ID",
}: {
  id: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(ADMIN_ACTION_TERTIARY_CLASS)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          /* ignore */
        }
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}
