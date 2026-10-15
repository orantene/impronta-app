"use client";

/**
 * TUL-1066: the pieces of the dock catalog's first-add flow that talk to the
 * server, kept out of GuestDockCatalog.tsx.
 */
import { messagingClientDiscardEmptyDraft } from "@/lib/server-actions/messaging-client";

import { getGuestThreadMessages } from "../_actions/guest-chat-actions";

/**
 * The panel's "make sure an inquiry exists" callback. `onDiscarded` (optional) lets
 * the panel forget an id the catalog just deleted so the next add starts clean.
 */
export type EnsureInquiryForItems = (() => Promise<string | null>) & {
  onDiscarded?: (inquiryId: string) => void;
};

/** The thread token for a thread this guest owns, or null when the server did not mint one. */
export async function readGuestThreadToken(inquiryId: string): Promise<string | null> {
  const res = await getGuestThreadMessages({ inquiryId, afterIso: null });
  return res.ok ? (res.v5?.threadToken ?? null) : null;
}

/** Drops the empty draft a failed first add left behind; never throws. */
export async function discardEmptyDraft(token: string, inquiryId: string, ensure: EnsureInquiryForItems): Promise<void> {
  try {
    const res = await messagingClientDiscardEmptyDraft({ token });
    if (res.ok) ensure.onDiscarded?.(inquiryId);
  } catch {
    /* the draft stays; the guest can still send or ignore it */
  }
}
