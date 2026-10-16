"use client";

import { useEffect, useState } from "react";
import { getMarketingSupportCopy } from "@/lib/marketing/support-copy";
import { resumeGuestThreadAction } from "@/lib/support/guest-actions";
import { MarketingSupportPanel } from "./MarketingSupportPanel";

/**
 * Email "Reply in app" landing (/contact?t=<signed token>).
 *
 * The panel is mounted HERE, not through the floating launcher: the launcher
 * is off on marketing hosts unless NEXT_PUBLIC_MARKETING_SUPPORT_FAB=1, so the
 * old open-event reached nobody and the reader saw a blank contact form.
 * Re-binding the thread to this browser happens in a server action (it can
 * mint the guest cookie a signed-out reader does not have yet).
 */
export function MarketingContactResume({
  token,
  locale,
  signedIn,
}: {
  token: string;
  /** The ticket's language, so the thread opens in the language it was written in. */
  locale: "en" | "es";
  signedIn: boolean;
}) {
  const copy = getMarketingSupportCopy(locale);
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; ticketId: string } | { kind: "failed" }
  >({ kind: "loading" });
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void resumeGuestThreadAction({ token }).then((res) => {
      if (cancelled) return;
      setState(res.ok ? { kind: "ready", ticketId: res.ticketId } : { kind: "failed" });
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === "failed") {
    return (
      <p role="alert" className="mb-8 rounded-md border border-[var(--plt-hairline-strong)] p-4 text-sm">
        {copy.resumeExpired}
      </p>
    );
  }
  if (state.kind === "loading") return null;

  return (
    <div className="mb-8">
      <h2 className="font-display text-xl">{copy.resumeTitle}</h2>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-md bg-[var(--plt-forest)] px-4 py-2 text-sm text-[var(--plt-bg)]"
        >
          {copy.resumeOpen}
        </button>
      ) : (
        <MarketingSupportPanel
          locale={locale}
          originSlug="/contact"
          signedIn={signedIn}
          resumeTicketId={state.ticketId}
          onClose={() => setOpen(false)}
          onUnread={() => undefined}
        />
      )}
    </div>
  );
}
