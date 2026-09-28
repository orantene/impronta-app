/**
 * Guest Hablar composer placeholder — front-door brief phrase vs reply.
 *
 * Talent-site / agency front-door offer posture (incl. `hablar_preview=offer`)
 * keeps `composerPhrase` ("Escribe tu mensaje…", AUD-040b) even when an inquiryId exists
 * (preview invents one; live OFERTA has a real id). C13-1 / WO-C13-HABLAR-2.
 */

import type { Translator } from "@/i18n/interpolate";
import type { GuestThreadStatus } from "@/lib/inquiry/guest-chat-contract";

export function guestComposerPlaceholder(
  t: Translator,
  opts: {
    frontDoorChrome: boolean;
    agencyPublicSurface: boolean;
    inquiryId: string | null;
    offerPreview: boolean;
    threadStatus: GuestThreadStatus;
  },
): string {
  const offerPosture =
    opts.offerPreview ||
    opts.threadStatus === "offer_pending" ||
    opts.threadStatus === "approved" ||
    opts.threadStatus === "booked";
  if (opts.frontDoorChrome && (!opts.inquiryId || offerPosture)) {
    return opts.agencyPublicSurface
      ? t("public.guestChat.composerPhraseAgency")
      : t("public.guestChat.composerPhrase");
  }
  if (opts.inquiryId) return t("public.guestChat.composerReply");
  return t("public.guestChat.composerFirst");
}
