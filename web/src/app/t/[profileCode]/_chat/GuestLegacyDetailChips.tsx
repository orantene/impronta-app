"use client";

/**
 * GuestLegacyDetailChips: the LEGACY detail chip block (no unified inquiry),
 * extracted verbatim from MiniChatPanelColumn to keep that file under the
 * 800-line cap. Same props in, same JSX out; the unified path uses
 * GuestDetailChipRow instead and never renders this.
 */

import type {
  CaptureGuestChipCallback,
  GuestChipInput,
  GuestChipKind,
  GuestChipValue,
  GuestIdentityTier,
} from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";

import { GuestDetailChips } from "./GuestDetailChips";
import type { SurfaceMode } from "./mini-chat-styles";
import type { UnifiedSyncState } from "./use-unified-inquiry";

export function GuestLegacyDetailChips({
  inquiryId,
  identity,
  tenantSlug,
  talentProfileId,
  accent,
  accentInk,
  t,
  surfaceMode,
  capturedChipKinds,
  capturedChipValues,
  chipFieldState,
  chipRemoteFlashKinds,
  onPatchChip,
  onCaptureChip,
  onCapturedChipKind,
}: {
  inquiryId: string | null;
  identity: GuestIdentityTier;
  tenantSlug: string;
  talentProfileId: string;
  accent: string;
  accentInk: string;
  t: Translator;
  surfaceMode: SurfaceMode;
  capturedChipKinds: GuestChipKind[];
  capturedChipValues: Partial<Record<GuestChipKind, GuestChipValue>>;
  chipFieldState: Record<string, UnifiedSyncState>;
  chipRemoteFlashKinds: GuestChipKind[];
  onPatchChip: ((kind: GuestChipKind, value: GuestChipValue) => Promise<void>) | null;
  onCaptureChip: CaptureGuestChipCallback | null;
  onCapturedChipKind: (kind: GuestChipKind) => void;
}) {
  if (!(onPatchChip || (inquiryId && onCaptureChip))) return null;
  return (
    <GuestDetailChips
      inquiryId={inquiryId}
      alwaysShow={Boolean(onPatchChip)}
      accent={accent}
      accentInk={accentInk}
      t={t}
      surfaceMode={surfaceMode}
      capturedKinds={capturedChipKinds}
      capturedValues={capturedChipValues}
      fieldState={chipFieldState}
      remoteFlashKinds={chipRemoteFlashKinds}
      onPatch={onPatchChip ?? undefined}
      onCapture={async (input: GuestChipInput) => {
        // Legacy direct-capture fallback (only reached when onPatchChip is
        // absent). The unified path uses onPatch above.
        if (!onCaptureChip) {
          return { ok: false as const, code: "engine_error" as const, message: "" };
        }
        const r = await onCaptureChip(input);
        if (r.ok) onCapturedChipKind(input.kind);
        return r;
      }}
      onAddMoreDetails={
        // #683: /client/messages requires an authenticated client, so a guest
        // would 404 there; hide the escalation for guests. The legacy block
        // only renders when extras are off, so only the non-guest path keeps
        // the deep-link to the full form.
        identity === "guest"
          ? undefined
          : () => {
              window.open(`/${tenantSlug}/client/messages?new=1&talent=${talentProfileId}`, "_blank");
            }
      }
    />
  );
}
