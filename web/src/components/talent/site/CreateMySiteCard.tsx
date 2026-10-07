"use client";

/**
 * The explicit "Create my own website" step (TUL-179). Opening My presence
 * never writes a site row; this click is the only thing that does.
 */

import { useState, useTransition } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { PrimaryButton } from "@/components/admin/shell/internal/primitives";
import { ensureMaxSiteAction } from "@/lib/talent-site/server/site-management-actions";

export function CreateMySiteCard({ onCreated }: { onCreated: () => Promise<void> }) {
  const copy = useDashboardText();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await ensureMaxSiteAction();
        if (!res.ok) {
          setError(copy.t("Could not create your website. Try again."));
          return;
        }
        await onCreated();
      } catch {
        setError(copy.t("Could not create your website. Try again."));
      }
    });
  }

  return (
    <div
      data-testid="create-my-site-card"
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        padding: "16px 18px",
        fontFamily: FONTS.body,
      }}
    >
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.55, maxWidth: 560 }}>
        {copy.t(
          "Your profile page stays as it is. A separate website of your own is only created when you choose to.",
        )}
      </p>
      <PrimaryButton onClick={create} disabled={pending}>
        {pending ? copy.t("Creating your website…") : copy.t("Create my own website")}
      </PrimaryButton>
      {error ? (
        <p role="alert" style={{ margin: "10px 0 0", fontSize: 12.5, color: COLORS.criticalDeep }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
