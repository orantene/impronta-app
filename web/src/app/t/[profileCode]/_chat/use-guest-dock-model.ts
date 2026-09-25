"use client";

/**
 * L13 · the per-thread card model + clock the column shares between the
 * stream's card rows and the next-step block. A held time shows a countdown;
 * the clock ticks once a second while any card is held (same rule as the
 * secure link). Split out of MiniChatPanelColumn to keep it under the
 * file-size cap.
 */

import { useCallback, useEffect, useState } from "react";

import type { Translator } from "@/i18n/interpolate";
import type { GuestThreadMessage, GuestThreadV5Extras, MiniChatBrand } from "@/lib/inquiry/guest-chat-contract";
import type { GuestDockCatalogProps } from "./GuestDockCatalog";
import { bookAgainRecordId } from "@/lib/messages-v5/guest-book-again";
import { messagingClientBookAgain } from "@/lib/server-actions/messaging-client";

import { useGuestClientCards } from "./GuestClientCards";
import type { paletteFor } from "./mini-chat-styles";

export function useGuestDockModel(input: {
  readonly rows: readonly GuestThreadMessage[];
  readonly v5: GuestThreadV5Extras | null;
  readonly refresh: (() => void) | undefined;
  readonly threadStatus: string;
  readonly brand: MiniChatBrand;
  readonly t: Translator;
  readonly C: ReturnType<typeof paletteFor>;
  readonly accent: string;
  readonly accentInk: string;
  readonly contactName?: string;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
  readonly onRenameSaved?: (name: string) => void;
  readonly inquiryId?: string | null;
  readonly onOpenInquiry?: (inquiryId: string) => void;
  readonly onAsk?: (text: string) => void;
}) {
  const locale = input.brand.locale ?? "en";
  const businessName = input.brand.agencyName;
  const [now, setNow] = useState(() => new Date());
  const anyHold =
    input.rows.some(
      (m) =>
        (m.kind === "professional_times" || m.kind === "service_card") &&
        typeof (m.cardPayload as { holdExpiresAt?: unknown } | null)?.holdExpiresAt === "string",
    ) ||
    (input.v5?.items?.records.some((r) => typeof r.holdExpiresAt === "string") ?? false);
  useEffect(() => {
    if (!anyHold) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [anyHold]);
  const cardModel = useGuestClientCards({
    rows: input.rows,
    v5: input.v5,
    locale,
    businessName,
    refresh: input.refresh ?? (() => undefined),
    onTick: () => setNow(new Date()),
    onAsk: input.onAsk,
  });
  const recordId = bookAgainRecordId(input.v5?.items?.records);
  const token = input.v5?.threadToken ?? null;
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [bookAgainStarted, setBookAgainStarted] = useState(false);
  const run = useCallback(async () => {
    if (!token || !recordId || busy) return;
    setBusy(true);
    setRefusal(null);
    setBookAgainStarted(false);
    const result = await messagingClientBookAgain({ token, recordId });
    setBusy(false);
    if (!result.ok) {
      setRefusal(result.reason);
      return;
    }
    setBookAgainStarted(true);
    input.onOpenInquiry?.(result.inquiryId);
  }, [token, recordId, busy, input]);
  const onBookInquiry = useCallback(
    (inquiryId: string) => {
      if (inquiryId !== input.inquiryId) {
        input.onOpenInquiry?.(inquiryId);
        return;
      }
      void run();
    },
    [input, run],
  );
  return {
    cardModel,
    now,
    /** Props for the next-step block above the composer. */
    nextStepProps: {
      v5: input.v5,
      model: cardModel,
      threadStatus: input.threadStatus,
      businessName,
      locale,
      now,
      t: input.t,
      C: input.C,
      accent: input.accent,
      accentInk: input.accentInk,
      bookAgainNotice: bookAgainStarted,
      messageKinds: input.rows.map((m) => m.kind),
    },
    /** Props for the Items shelf inside the Lineup view. */
    lineupItemsProps: { items: input.v5?.items ?? null, businessName, locale, representsPeople: input.brand.dockRepresentsPeople !== false, now },
    /** Props for the catalog (browse + add) at the top of the Items tab. */
    catalogProps: (c: {
      tenantSlug: string;
      inquiryId: string | null;
      sourcePage: string;
      onEnsureInquiry: (() => Promise<string | null>) | null;
      onAsk: (text: string) => void;
    }): GuestDockCatalogProps => ({
      serviceMenu: input.brand.dockServiceMenu,
      tenantSlug: c.tenantSlug,
      businessName,
      locale,
      t: input.t,
      C: input.C,
      accent: input.accent,
      accentInk: input.accentInk,
      inquiryId: c.inquiryId,
      threadToken: input.v5?.threadToken ?? null,
      sourcePage: c.sourcePage,
      onEnsureInquiry: c.onEnsureInquiry,
      onRefresh: input.refresh ?? (() => undefined),
      onAsk: c.onAsk,
    }),
    detailsProps: {
      detailsName: input.contactName ?? "",
      detailsEmail: input.contactEmail ?? null,
      detailsPhone: input.contactPhone ?? null,
      detailsToken: input.v5?.threadToken ?? null,
      onDetailsSaved: input.onRenameSaved,
    },
    bookAgainHome: {
      bookAgainRecordId: recordId,
      bookAgainEnabled: Boolean(token && recordId),
      bookAgainBusy: busy,
      bookAgainRefusal: refusal,
      onBookAgain: run,
    },
    onBookAgainInquiry: onBookInquiry,
  };
}
