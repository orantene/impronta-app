"use client";

/**
 * LinksScreen — `Payment links` (POSPaymentLink), the Links destination.
 *
 * NOT WIRED (D-POS-42). No table records a sent payment link (an id, the
 * record it resolves to, an expiry, a paid state), so there is nothing to
 * list and nothing to resend. The screen draws the board's frame over the
 * one sentence, plus the board's own rule so the operator knows what a
 * link would and would not do once it exists.
 */

import { Link2 } from "lucide-react";

import { POS_NOTE_INFO, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import { cn } from "@/lib/utils";

import type { ProjectsModeCopy } from "./projects-copy";

export function LinksScreen({ copy }: { copy: ProjectsModeCopy }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-[18px]" data-pos-links>
      <div className={cn(POS_SURFACE, "flex flex-col items-center gap-2 px-5 py-8 text-center")}>
        <Link2 aria-hidden size={28} strokeWidth={1.5} className="text-admin-ink-dim" />
        <p role="status" className="m-0 max-w-[560px] text-[15px] text-admin-ink-muted">
          {copy.board.linksUnavailable}
        </p>
      </div>
      <p className={cn(POS_NOTE_INFO, "m-0")}>{copy.board.linksNote}</p>
    </div>
  );
}
