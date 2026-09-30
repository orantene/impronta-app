"use client";

import { useState } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { Btn } from "@/components/messages-v5/kit";
import { useTalentPublicProfileHref } from "@/lib/talent/use-public-profile-href";

/**
 * F35: a brand-new talent's inbox. Instead of "Nothing needs you" over
 * seven filters, it says how clients reach her and hands her the link to
 * share (her public page, on this origin when local, see F41).
 */
export function MessagesFirstRun() {
  const { bridgeTalentSelfProfile } = useAdminShell();
  const copy = useDashboardText();
  const href = useTalentPublicProfileHref(bridgeTalentSelfProfile?.profileCode);
  const [copied, setCopied] = useState(false);
  if (!href) return null;
  const label = href.replace(/^https?:\/\//, "");
  return (
    <div className="flex flex-col items-center gap-2 px-4 pb-6" data-messages-first-run>
      <span className="max-w-full truncate rounded-lg border border-admin-border-soft bg-admin-surface-alt px-3 py-1.5 font-admin-body text-[12.5px] text-admin-ink-muted">
        {label}
      </span>
      <div className="flex gap-2">
        <Btn
          size="sm"
          variant="primary"
          icon="link"
          onClick={() => {
            void navigator.clipboard?.writeText(href).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? copy.t("Link copied") : copy.t("Copy your link")}
        </Btn>
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg px-3 font-admin-body text-[12.5px] font-semibold text-admin-ink underline-offset-2 hover:underline">
          {copy.t("Open your page")}
        </a>
      </div>
    </div>
  );
}
