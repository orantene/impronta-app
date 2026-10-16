"use client";

/**
 * PostUpgradeSheet — what Publicar opens when the server answers
 * `upgrade_required`. The draft is already saved (`draftSaved: true`), so the
 * sheet only explains and points at the plans; nothing is lost by closing it.
 * Talent and workspace admins share it, only the copy and the link differ.
 */

import Link from "next/link";

import type { PostsT } from "./posts-t";

export type PostUpgradeSheetProps = {
  open: boolean;
  audience: "talent" | "workspace";
  /** Where the plans live (talent: /talent/plan, workspace: billing). */
  upgradeHref: string;
  t: PostsT;
  onClose: () => void;
};

export function PostUpgradeSheet({ open, audience, upgradeHref, t, onClose }: PostUpgradeSheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" data-testid="post-upgrade-sheet">
      <button
        type="button"
        aria-label={t("dashboard.talentPosts.close")}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-upgrade-title"
        className="relative w-full max-w-[420px] rounded-t-[20px] bg-admin-card p-[20px] pb-[28px] shadow-xl sm:rounded-[20px]"
      >
        <h2 id="post-upgrade-title" className="m-0 text-[18px] font-semibold text-admin-ink">
          {t("dashboard.talentPosts.upgradeTitle")}
        </h2>
        <p className="mt-[8px] mb-[18px] text-[14px] leading-relaxed text-admin-ink-muted">
          {audience === "workspace"
            ? t("dashboard.talentPosts.upgradeBodyWorkspace")
            : t("dashboard.talentPosts.upgradeBody")}
        </p>
        <div className="flex flex-col gap-[8px]">
          <Link
            href={upgradeHref}
            className="inline-flex min-h-11 items-center justify-center rounded-admin-md bg-admin-ink px-[16px] text-[14px] font-semibold text-admin-surface no-underline"
          >
            {t("dashboard.talentPosts.upgradeCta")}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-admin-md border border-admin-border bg-admin-card px-[16px] text-[14px] font-medium text-admin-ink"
          >
            {t("dashboard.talentPosts.upgradeLater")}
          </button>
        </div>
      </div>
    </div>
  );
}
