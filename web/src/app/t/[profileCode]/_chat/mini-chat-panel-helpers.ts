"use client";

/**
 * mini-chat-panel-helpers — small pure helpers extracted from MiniChatPanel to
 * keep that orchestrator under its line cap. No React, no backend import.
 */

import type { Translator } from "@/i18n/interpolate";
import type { GuestChipKind } from "@/lib/inquiry/guest-chat-contract";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import type { StreamRow } from "./MiniChatMessageBubble";

/**
 * Build the optimistic pending guest StreamRow shown the instant a send starts
 * (before the server round-trip). Shared by every send handler so the row shape
 * lives in ONE place.
 */
export function makePendingRow(tmpId: string, inquiryId: string, body: string): StreamRow {
  return {
    id: tmpId,
    inquiryId,
    authorRole: "guest",
    authorLabel: null,
    authorAvatarUrl: null,
    body,
    kind: "text",
    cardPayload: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    isDeleted: false,
    replyToMessageId: null,
    pending: true,
  };
}

/** Mark the optimistic row (by tmp id) as failed in a rows list (immutable). */
export function markRowFailed(rows: StreamRow[], tmpId: string): StreamRow[] {
  return rows.map((r) => (r.id === tmpId ? { ...r, pending: false, failed: true } : r));
}

/**
 * Derive the Phase 3 empty-state lead + Talent-section deep-link (plan §B.1/§B.2).
 *
 * talentPickFirst: open the chat with EMPTY cart on the agency/directory surface
 * (no specific talentProfileId), no talent selected, no live thread → lead with
 * the talent-pick step (greeting + auto-opened Talent section). On a talent's own
 * profile the page already names the talent, so the normal opener stays.
 *
 * railOpenToSection: the +N chip / a rail avatar deep-links to Talent; the empty
 * lead also auto-opens Talent. Returns "talent" | null.
 */
export function deriveTalentPickState(args: {
  enabled: boolean;
  talentProfileId: string;
  stage: "intro" | "gate" | "thread";
  inquiryId: string | null;
  cartTalentIds?: readonly string[];
  intent: InquiryIntent;
  openToTalentSection: boolean;
}): { talentPickFirst: boolean; railOpenToSection: "talent" | null } {
  const selectedCount = args.intent.talent?.selected_ids?.length ?? 0;
  const cartIsEmpty = (args.cartTalentIds?.length ?? 0) === 0;
  const recommendChosen = args.intent.talent?.selection_mode === "agency_recommends";
  const talentPickFirst =
    args.enabled &&
    !args.talentProfileId &&
    args.stage !== "thread" &&
    !args.inquiryId &&
    cartIsEmpty &&
    selectedCount === 0 &&
    !recommendChosen;
  const railOpenToSection: "talent" | null =
    args.openToTalentSection || talentPickFirst ? "talent" : null;
  return { talentPickFirst, railOpenToSection };
}

/**
 * Stable no-op fallbacks for the unified hook when the early-create / capture
 * actions are not injected (keeps the patch() path inert without per-render refs).
 */
export const NOOP_ENSURE_INQUIRY = async () =>
  ({ ok: false as const, code: "engine_error" as const, message: "" });
export const NOOP_CAPTURE_CHIP = async () =>
  ({ ok: false as const, code: "engine_error" as const, message: "" });

/**
 * Remove from the launcher cart any talent that was dropped from the in-chat
 * selection, so the pill rail (driven by the cart) never shows a stale avatar.
 * Adds made in-chat are not auto-carted (the directory card is the add surface).
 */
export function reconcileCartRemovals(
  selectedIds: string[],
  cartTalentIds: readonly string[] | undefined,
  onRemoveCartTalent: ((id: string) => void) | undefined,
): void {
  if (!onRemoveCartTalent || !cartTalentIds) return;
  const stillSelected = new Set(selectedIds);
  for (const id of cartTalentIds) {
    if (!stillSelected.has(id)) onRemoveCartTalent(id);
  }
}

/**
 * Who made the detected change, when it can be attributed. The owned-row
 * reconcile diff cannot prove agency authorship for a talent change — the
 * inquiry owner's OWN out-of-band add (favorites → inquire bridge, client
 * lineup picker) lands on the same row — so that call site attributes talent
 * changes to the "owner" to avoid the "the agency updated the talent" mislabel.
 */
export type RemoteNoteActor = "agency" | "owner";

/**
 * Build the centered system-note rows for a batch of detected changes — one per
 * changed kind. Pure; the panel appends the result to its rows list. `talentActor`
 * controls the voice of the talent note (defaults to the agency wording).
 */
export function makeRemoteNoteRows(
  kinds: GuestChipKind[],
  inquiryId: string | null,
  t: Translator,
  talentActor: RemoteNoteActor = "agency",
): StreamRow[] {
  const nowIso = new Date().toISOString();
  return kinds.map((k, i) => ({
    id: `remote-${k}-${nowIso}-${i}`,
    inquiryId: inquiryId ?? "",
    authorRole: "system" as const,
    authorLabel: null,
    authorAvatarUrl: null,
    body: remoteNoteFor(k, t, talentActor),
    kind: "text" as const,
    cardPayload: null,
    createdAt: nowIso,
    editedAt: null,
    isDeleted: false,
    replyToMessageId: null,
  }));
}

/**
 * Localized client-facing change-note copy (B.7). This is the LIVE
 * client-rendered note (distinct from any server-stored note body). Pass a
 * `createTranslator(locale)` instance so the note follows the guest locale.
 * `talentActor` picks the talent-note voice: "owner" reads "You updated the
 * talent…" (the inquiry owner's own out-of-band add), "agency" keeps the
 * agency wording for changes a coordinator actually made. No "buyer", no em
 * dashes.
 */
export function remoteNoteFor(
  kind: GuestChipKind,
  t: Translator,
  talentActor: RemoteNoteActor = "agency",
): string {
  switch (kind) {
    case "date":
      return t("public.guestChat.remoteNoteDate");
    case "location":
      return t("public.guestChat.remoteNoteLocation");
    case "headcount":
      return t("public.guestChat.remoteNoteHeadcount");
    case "event_type":
      return t("public.guestChat.remoteNoteEventType");
    case "budget":
      return t("public.guestChat.remoteNoteBudget");
    case "talent":
      return talentActor === "owner"
        ? t("public.guestChat.remoteNoteTalentOwner")
        : t("public.guestChat.remoteNoteTalent");
    case "brief":
      return t("public.guestChat.remoteNoteBrief");
    case "contact":
      return t("public.guestChat.remoteNoteContact");
    default:
      return t("public.guestChat.remoteNoteGeneric");
  }
}
