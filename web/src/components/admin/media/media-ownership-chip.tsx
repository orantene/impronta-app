"use client";

import {
  describeMediaOwnership,
  type MediaOwnershipTone,
} from "@/lib/media/ownership";

/**
 * media-ownership-chip.tsx — "who owns this photo?", on the tile.
 *
 * Phase 1 of the media-ownership plan makes every writer stamp
 * `media_assets.ownership_kind`. This is the read side: the Media page
 * answers the question in words on every tile instead of leaving the user to
 * guess, which is the whole point of stamping (plan §6, "ownership chips on
 * tiles").
 *
 * Lives outside `components/admin/shell/**` deliberately: that tree is frozen
 * against new inline `style={{…}}`, and this is new UI, so it is written in
 * token classes from the start.
 */

const TONE_CLASS: Record<MediaOwnershipTone, string> = {
  workspace: "bg-admin-accent-soft text-admin-accent border-admin-accent/25",
  talent: "bg-admin-surface-alt text-admin-ink-muted border-admin-border",
  platform: "bg-admin-surface-alt text-admin-ink-dim border-admin-border-soft",
  external: "bg-rose-50 text-rose-700 border-rose-200",
};

export function MediaOwnershipChip({
  ownershipKind,
  ownedByThisWorkspace,
  workspaceName,
  className,
}: {
  ownershipKind: unknown;
  ownedByThisWorkspace: boolean;
  workspaceName?: string | null;
  className?: string;
}) {
  const chip = describeMediaOwnership({
    ownershipKind,
    ownedByThisWorkspace,
    workspaceName,
  });

  return (
    <span
      title={chip.hint}
      className={[
        "inline-flex max-w-full items-center gap-1 truncate rounded-full border px-1.5 py-[1px] text-[9.5px] font-semibold leading-[1.35] tracking-[0.02em]",
        TONE_CLASS[chip.tone],
        className ?? "",
      ].join(" ")}
    >
      {chip.label}
    </span>
  );
}
