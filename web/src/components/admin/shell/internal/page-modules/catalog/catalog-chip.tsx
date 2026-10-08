import type { ReactNode } from "react";

/** The compact 17px chip inside a cell (W01's channels): grey, or the brand's tint. */
export function Chip({ tone = "slate", children }: { tone?: "slate" | "brand"; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-[17px] items-center whitespace-nowrap rounded-[5px] px-[7px] font-admin-body text-[11px] font-semibold leading-none ${
        tone === "brand" ? "bg-admin-brand-soft text-admin-brand" : "bg-admin-surface-alt text-admin-ink"
      }`}
    >
      {children}
    </span>
  );
}
