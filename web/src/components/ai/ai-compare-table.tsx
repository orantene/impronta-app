"use client";

import { cn } from "@/lib/utils";

export type AICompareColumn = { key: string; header: string };
export type AICompareRow = Record<string, React.ReactNode>;

type AICompareTableProps = {
  columns: AICompareColumn[];
  rows: AICompareRow[];
  className?: string;
};

export function AICompareTable({ columns, rows, className }: AICompareTableProps) {
  return (
    <div className={cn("overflow-x-auto rounded-md border border-border/60", className)}>
      <table className="w-full min-w-[20rem] text-left text-sm">
        <thead className="border-b border-border/60 bg-muted/20">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium text-foreground">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-muted-foreground">
                  {row[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
