"use client";

/**
 * The radio a card option carries (`POSSeatParty`, `POSDeparted`,
 * `POSMergeChecks`): a 20px ring, filled forest with a white dot when picked.
 */

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function RadioDot({ active, off }: { readonly active: boolean; readonly off?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
        active ? "border-admin-brand bg-admin-brand" : off ? "border-admin-border bg-admin-card" : "border-admin-border-strong bg-admin-card",
      )}
    >
      {active && <i className="block h-2 w-2 rounded-full bg-admin-card" />}
    </span>
  );
}

/** The checkbox mark a reset checklist row carries (`POSTableReset`). */
export function CheckMark({ active }: { readonly active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2",
        active ? "border-admin-brand bg-admin-brand text-admin-card" : "border-admin-border-strong bg-admin-card",
      )}
    >
      {active && <Check size={12} strokeWidth={3} />}
    </span>
  );
}
