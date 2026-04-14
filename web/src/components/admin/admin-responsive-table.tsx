"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW_INTERACTIVE,
  ADMIN_TABLE_TH,
  ADMIN_TABLE_WRAP,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export type AdminResponsiveTableColumn<T> = {
  id: string;
  label: string;
  /** High-priority cells surface on mobile cards; low only after “Show more”. */
  priority: "high" | "low";
  headerClassName?: string;
  cellClassName?: string;
  cell: (row: T) => React.ReactNode;
};

type AdminResponsiveTableProps<T> = {
  "aria-label"?: string;
  columns: AdminResponsiveTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage?: React.ReactNode;
  className?: string;
};

/**
 * Desktop: standard admin table chrome. Mobile: stacked cards with optional “Show more” for low-priority fields.
 */
export function AdminResponsiveTable<T>({
  "aria-label": ariaLabel = "Data table",
  columns,
  rows,
  getRowKey,
  emptyMessage = "No rows.",
  className,
}: AdminResponsiveTableProps<T>) {
  const high = columns.filter((c) => c.priority === "high");
  const low = columns.filter((c) => c.priority === "low");

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border/45 bg-muted/15 px-4 py-6 text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className={ADMIN_TABLE_WRAP}>
        <table className="hidden w-full border-collapse text-sm md:table" aria-label={ariaLabel}>
          <thead className={ADMIN_TABLE_HEAD}>
            <tr className="border-b border-border/45 text-left">
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={cn(ADMIN_TABLE_TH, col.headerClassName)}
                  scope="col"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/25">
            {rows.map((row) => (
              <tr key={getRowKey(row)} className={ADMIN_TABLE_ROW_INTERACTIVE}>
                {columns.map((col) => (
                  <td key={col.id} className={cn("px-4 py-3.5 align-top", col.cellClassName)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label={`${ariaLabel} (mobile)`}>
        {rows.map((row) => (
          <MobileRowCard
            key={getRowKey(row)}
            row={row}
            high={high}
            low={low}
          />
        ))}
      </ul>
    </div>
  );
}

function MobileRowCard<T>({
  row,
  high,
  low,
}: {
  row: T;
  high: AdminResponsiveTableColumn<T>[];
  low: AdminResponsiveTableColumn<T>[];
}) {
  const [more, setMore] = useState(false);
  return (
    <li className="rounded-2xl border border-border/50 bg-card/50 p-4 shadow-sm">
      <dl className="space-y-2">
        {high.map((col) => (
          <div key={col.id} className="flex flex-col gap-0.5">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {col.label}
            </dt>
            <dd className={cn("text-sm text-foreground", col.cellClassName)}>{col.cell(row)}</dd>
          </div>
        ))}
        {low.length > 0 ? (
          <>
            {more ? (
              <div className="space-y-2 border-t border-border/40 pt-3">
                {low.map((col) => (
                  <div key={col.id} className="flex flex-col gap-0.5">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {col.label}
                    </dt>
                    <dd className={cn("text-sm text-foreground", col.cellClassName)}>{col.cell(row)}</dd>
                  </div>
                ))}
              </div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 w-full justify-center rounded-xl text-xs font-semibold sm:h-10"
              onClick={() => setMore((v) => !v)}
            >
              {more ? "Show less" : `Show ${low.length} more field${low.length === 1 ? "" : "s"}`}
            </Button>
          </>
        ) : null}
      </dl>
    </li>
  );
}
