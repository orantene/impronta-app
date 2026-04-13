import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { adminStatusBadgePillClass } from "@/lib/admin/status-badge-classes";
import { cn } from "@/lib/utils";

export function AdminCommercialStatusBadge({
  kind,
  status,
  className,
  children,
}: {
  kind: "inquiry" | "booking" | "client";
  status: string;
  className?: string;
  children?: ReactNode;
}) {
  const label = children ?? status.replace(/_/g, " ");
  return (
    <Badge variant="outline" className={cn(adminStatusBadgePillClass(kind, status), "px-2.5 py-0.5 text-xs", className)}>
      {label}
    </Badge>
  );
}
