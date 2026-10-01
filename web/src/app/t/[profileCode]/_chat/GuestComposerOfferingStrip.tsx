"use client";

/**
 * GuestComposerOfferingStrip — DoR Hablar composer attachment:
 *   empty → browse OfferingQuickPicker ("PREGUNTA POR UN SERVICIO")
 *   pinned / offer posture → StickyOfferingChip (brief Offer screen)
 */

import type { GuestThreadStatus, GuestThreadV5Extras } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";

import {
  OfferingQuickPicker,
  StickyOfferingChip,
  offeringDraftPrefix,
  type ChatOffering,
} from "./OfferingQuickPicker";
import { clearPendingOffering, peekPendingOffering } from "./pending-offering-store";
import type { SurfaceMode } from "./mini-chat-styles";
import { GuestAskAboutCard } from "./GuestAskAboutCard";
import { catalogBookingDraftPrefix } from "@/components/public-booking/catalog-booking-chat";

const DECLINED = new Set(["rejected", "declined", "invalidated", "expired", "superseded"]);

/** Prefer client-visible offer line labels; draft POS items are a fallback only. */
export function stickyTitleFromThread(
  v5: GuestThreadV5Extras | null | undefined,
  pendingTitle: string | null,
  offerPreview: boolean,
): string | null {
  if (offerPreview) return "Lifting";
  if (pendingTitle) return pendingTitle;
  const offers = v5?.offers ?? [];
  for (let i = offers.length - 1; i >= 0; i--) {
    const offer = offers[i];
    if (DECLINED.has(offer.status)) continue;
    const label = offer.lines?.[0]?.label?.trim();
    if (label) return label;
  }
  return (
    v5?.items?.lines?.find((l) => l.kind === "service" || Boolean(l.label))?.label ?? null
  );
}

export function GuestComposerOfferingStrip({
  showGate,
  offerPreview,
  threadStatus,
  offerings,
  onPickOffering,
  onDraftChange,
  draft,
  locale,
  t,
  accent,
  surfaceMode,
  v5,
  hideAskCard = false,
}: {
  showGate: boolean;
  offerPreview: boolean;
  threadStatus: GuestThreadStatus;
  offerings: ChatOffering[];
  onPickOffering?: (o: ChatOffering) => void;
  onDraftChange: (value: string) => void;
  /** Current composer draft — used so clear keeps guest-authored text. */
  draft: string;
  locale: string;
  t: Translator;
  accent: string;
  surfaceMode?: SurfaceMode;
  v5?: GuestThreadV5Extras | null;
  /** Card skin: the card footer draws the asking-about card, so this strip must not. */
  hideAskCard?: boolean;
}) {
  if (showGate) return null;

  const pending = peekPendingOffering();
  const stickyTitle = stickyTitleFromThread(v5, pending?.title ?? null, offerPreview);
  const offerPosture =
    offerPreview ||
    threadStatus === "offer_pending" ||
    threadStatus === "approved" ||
    threadStatus === "booked";

  // AUD-044 — Ask from the catalog selection dock: context card + quick chips.
  if (pending?.askAbout && pending.askAbout.length > 0 && !offerPosture) {
    if (hideAskCard) return null;
    const prefix = catalogBookingDraftPrefix(pending, pending.selection, locale);
    return (
      <GuestAskAboutCard
        titles={pending.askAbout}
        imageUrl={pending.imageUrl ?? null}
        t={t}
        accent={accent}
        surfaceMode={surfaceMode}
        onPick={(q) => onDraftChange(draft.startsWith(prefix) ? `${prefix}${q}` : q)}
        onClear={() => {
          clearPendingOffering();
          onDraftChange(draft.startsWith(prefix) ? draft.slice(prefix.length) : draft);
        }}
      />
    );
  }

  if (stickyTitle && (offerPosture || pending)) {
    return (
      <StickyOfferingChip
        title={stickyTitle}
        accent={accent}
        surfaceMode={surfaceMode}
        clearLabel={t("public.guestChat.clearService")}
        onClear={
          pending && !offerPreview
            ? () => {
                const prefix = offeringDraftPrefix(
                  {
                    title: pending.title,
                    amountCents: pending.amountCents,
                    currency: pending.currency,
                  },
                  locale,
                );
                clearPendingOffering();
                const rest = draft.startsWith(prefix) ? draft.slice(prefix.length) : draft;
                onDraftChange(rest);
              }
            : undefined
        }
      />
    );
  }

  if (!offerPosture && onPickOffering && offerings.length > 0) {
    return (
      <OfferingQuickPicker
        offerings={offerings}
        locale={locale}
        t={t}
        surfaceMode={surfaceMode}
        onPick={onPickOffering}
      />
    );
  }

  return null;
}
