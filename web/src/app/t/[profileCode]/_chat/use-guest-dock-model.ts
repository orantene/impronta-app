"use client";

/**
 * L13 · the per-thread card model + clock the column shares between the
 * stream's card rows and the next-step block. A held time shows a countdown;
 * the clock ticks once a second while any card is held (same rule as the
 * secure link). Split out of MiniChatPanelColumn to keep it under the
 * file-size cap.
 */

import { useEffect, useState } from "react";

import type { Translator } from "@/i18n/interpolate";
import type { GuestThreadMessage, GuestThreadV5Extras, MiniChatBrand } from "@/lib/inquiry/guest-chat-contract";
import type { GuestDockCatalogProps } from "./GuestDockCatalog";

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
}) {
  const locale = input.brand.locale ?? "en";
  const businessName = input.brand.agencyName;
  const [now, setNow] = useState(() => new Date());
  const anyHold = input.rows.some(
    (m) => m.kind === "professional_times" && typeof (m.cardPayload as { holdExpiresAt?: unknown } | null)?.holdExpiresAt === "string",
  );
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
  });
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
    },
    /** Props for the Items shelf inside the Lineup view. */
    lineupItemsProps: { items: input.v5?.items ?? null, businessName, locale, representsPeople: input.brand.dockRepresentsPeople !== false },
    /** Props for the catalog (browse + add) at the top of the Items tab. */
    catalogProps: (c: {
      tenantSlug: string;
      inquiryId: string | null;
      sourcePage: string;
      onEnsureInquiry: (() => Promise<string | null>) | null;
      onAsk: (text: string) => void;
    }): GuestDockCatalogProps => ({
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
  };
}
