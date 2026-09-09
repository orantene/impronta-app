/**
 * Table — a real `<table>`, which is the entire point.
 *
 * WHY NOT A GRID OF DIVS. Every operational list in this repo is a CSS grid of
 * `<div>`s, and the cost is invisible until someone uses one without sight: a
 * grid of divs has no row/column relationship, so a screen reader reads
 * "Sold out 4 12:00" with no way to know which column any of those came from,
 * and there is no header association to announce. A `<table>` with `<th scope>`
 * gets all of that from the browser for free. `caption` carries what the table
 * IS, visually hidden by default because the surrounding page usually already
 * says it in a heading — but present, because a screen-reader user landing on
 * the table directly does not have that heading.
 *
 * NO SORTING, NO SELECTION, NO PAGINATION. Those are three different products
 * and every screen wants a different one. This is markup with correct
 * semantics; a data grid built on top of it can come later and will not have
 * to relitigate the accessibility.
 *
 * SERVER-RENDERABLE. No `"use client"`, no state, no effects — the admin lists
 * that will adopt this are server components, and a primitive that forces them
 * to become client components would be a bundle regression dressed as a
 * refactor.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

export const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { caption?: string }
>(({ className, caption, children, ...props }, ref) => (
  // The wrapper scrolls, not the table: a table with `overflow` on itself
  // loses its own layout, and a narrow tablet is the normal case here.
  <div className="w-full overflow-x-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom border-collapse text-sm", className)}
      {...props}
    >
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      {children}
    </table>
  </div>
));
Table.displayName = "Table";

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b [&_tr]:border-border/60", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

export const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t border-border/60 bg-muted/40 font-medium", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn("border-b border-border/40 transition-colors hover:bg-muted/30", className)}
    {...props}
  />
));
TableRow.displayName = "TableRow";

/**
 * `scope` defaults to `col` and is REQUIRED to be one of the two.
 *
 * A `<th>` with no scope is ambiguous to assistive technology, and the default
 * that browsers infer is not reliable across a table with both a header row and
 * a header column. Making it a typed prop with a default means the common case
 * is free and the row-header case is one word rather than a research project.
 */
export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { scope?: "col" | "row" }
>(({ className, scope = "col", ...props }, ref) => (
  <th
    ref={ref}
    scope={scope}
    className={cn(
      "h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("px-3 py-2.5 align-middle", className)} {...props} />
));
TableCell.displayName = "TableCell";

/**
 * The empty state, as a row rather than as something the caller improvises
 * outside the table.
 *
 * A list that renders `<tbody>` with nothing in it is a table with no rows and
 * no explanation, which reads to everyone — sighted or not — as a broken
 * screen. This keeps the message inside the table's own structure so the
 * column count stays correct and the caption still applies.
 */
export function TableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
