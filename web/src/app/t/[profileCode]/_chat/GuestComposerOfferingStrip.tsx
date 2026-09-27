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
  type ChatOffering,
} from "./OfferingQuickPicker";
import { clearPendingOffering, peekPendingOffering } from "./pending-offering-store";
import type { SurfaceMode } from "./mini-chat-styles";

export function GuestComposerOfferingStrip({
  showGate,
  offerPreview,
  threadStatus,
  offerings,
  onPickOffering,
  onDraftChange,
  locale,
  t,
  accent,
  surfaceMode,
  v5,
}: {
  showGate: boolean;
  offerPreview: boolean;
  threadStatus: GuestThreadStatus;
  offerings: ChatOffering[];
  onPickOffering?: (o: ChatOffering) => void;
  onDraftChange: (value: string) => void;
  locale: string;
  t: Translator;
  accent: string;
  surfaceMode?: SurfaceMode;
  v5?: GuestThreadV5Extras | null;
}) {
  if (showGate) return null;

  const pending = peekPendingOffering();
  const lineLabel =
    v5?.items?.lines?.find((l) => l.kind === "service" || Boolean(l.label))?.label ?? null;
  const stickyTitle = offerPreview ? "Lifting" : pending?.title || lineLabel;
  const offerPosture =
    offerPreview ||
    threadStatus === "offer_pending" ||
    threadStatus === "approved" ||
    threadStatus === "booked";

  if (stickyTitle && (offerPosture || pending)) {
    return (
      <StickyOfferingChip
        title={stickyTitle}
        accent={accent}
        surfaceMode={surfaceMode}
        onClear={
          pending && !offerPreview
            ? () => {
                clearPendingOffering();
                onDraftChange("");
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
