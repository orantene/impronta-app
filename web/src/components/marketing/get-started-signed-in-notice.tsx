"use client";

import type { GetStartedFormCopy } from "./get-started-form-copy";

/**
 * The banner above the /get-started form for a signed-in visitor.
 *
 * Two states, and the difference matters: the amber one is shown BEFORE the
 * visitor names a business and reserves a link, because "one free workspace per
 * account" means the provisioner would refuse to create the workspace this form
 * is about to promise. See `lib/saas/owned-free-workspace.ts`.
 *
 * Extracted from `get-started-form.tsx` to keep that file under the 800-line
 * lint cap.
 */
export function GetStartedSignedInNotice({
  t,
  email,
  freeLimitWorkspace,
}: {
  t: GetStartedFormCopy;
  email: string;
  freeLimitWorkspace: { displayName: string; adminUrl: string } | null;
}) {
  if (freeLimitWorkspace) {
    return (
      <div
        className="mb-5 rounded-xl border px-4 py-3.5 text-[0.8125rem] leading-[1.55]"
        style={{
          borderColor: "rgba(214,158,46,0.28)",
          background: "rgba(214,158,46,0.08)",
          color: "#7C5A14",
        }}
      >
        <strong style={{ fontWeight: 700 }}>{t.freeLimitTitle}</strong>{" "}
        {t.freeLimitBody(freeLimitWorkspace.displayName)}
        <span className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={freeLimitWorkspace.adminUrl}
            className="font-medium underline underline-offset-2"
            style={{ color: "#7C5A14" }}
          >
            {t.freeLimitOpen}
          </a>
          <a
            href="?tier=studio"
            className="font-medium underline underline-offset-2"
            style={{ color: "#7C5A14" }}
          >
            {t.freeLimitPaidPlans}
          </a>
        </span>
      </div>
    );
  }

  return (
    <div
      className="mb-5 rounded-xl border px-4 py-3 text-[0.8125rem] leading-[1.5]"
      style={{
        borderColor: "var(--plt-hairline)",
        background: "rgba(46,107,82,0.06)",
        color: "var(--plt-ink-soft)",
      }}
    >
      {t.signedInAs} <strong style={{ color: "var(--plt-ink)" }}>{email}</strong>.{" "}
      {t.signedInAdds}
    </div>
  );
}
