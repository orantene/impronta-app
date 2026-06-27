/**
 * launcher-lifecycle-inputs.ts — SERVER-SIDE seam that resolves the lifecycle
 * inputs for the chat launcher's resolver-driven pill label (Phase 3).
 *
 * The pure resolver (inquiry-context-resolver.ts) needs the active inquiry's
 * phase / coordinator / last-message-role plus the viewer's other open
 * inquiries. None of that is available client-side on the public surfaces, so
 * this helper assembles it on the server (from the SAME guest actions the
 * launcher already injects) and the Mount passes it down as plain props. This
 * keeps the client bundle backend-free, mirroring the action-injection pattern.
 *
 * It NEVER throws: any failure degrades to empty inputs so the launcher falls
 * back to the lineup-only label states ("Message {agency}" / "Your lineup (N)").
 *
 * NO migration, pure read.
 */

import {
  getGuestThreadMessages,
} from "@/app/t/[profileCode]/_actions/guest-chat-actions";
import { listGuestInquiries } from "@/app/t/[profileCode]/_actions/guest-inquiries-actions";
import type {
  GuestMessageAuthorRole,
  GuestThreadStatus,
} from "@/lib/inquiry/guest-chat-contract";
import type {
  LastMessageRole,
  OtherOpenInquiry,
} from "@/lib/inquiry/inquiry-context-resolver";
import type { InquiryWorkflowPhase } from "@/lib/inquiry/inquiry-lifecycle";

export type LauncherLifecycleInputs = {
  activePhase: InquiryWorkflowPhase | null;
  activeStatus: string | null;
  coordinatorId: string | null;
  lastMessageRole: LastMessageRole;
  lastActivityAt: string | null;
  hasActiveDraft: boolean;
  draftInquiryId: string | null;
  otherOpenInquiries: OtherOpenInquiry[];
  /**
   * Phase 8 returning-visitor nudge — REPLIED pulse signal. True when the active
   * inquiry is a SENT thread whose most recent message is from the coordinator
   * (lastMessageRole === "coordinator"), i.e. an unread reply is waiting for a
   * returning visitor. Derived here from the SAME thread read the resolver
   * inputs come from (no extra fetch); the launcher forwards it to
   * NewMessagePulse so the pill shows the pulse alongside "{agency} replied".
   */
  unreadCoordinatorReply: boolean;
};

const EMPTY: LauncherLifecycleInputs = {
  activePhase: null,
  activeStatus: null,
  coordinatorId: null,
  lastMessageRole: null,
  lastActivityAt: null,
  hasActiveDraft: false,
  draftInquiryId: null,
  otherOpenInquiries: [],
  unreadCoordinatorReply: false,
};

/**
 * Map the coarse guest thread status to a workflow phase. This is intentionally
 * conservative: the guest contract only exposes a 5-value coarse status, so the
 * mapping picks the canonical phase the resolver keys its precedence on.
 */
function threadStatusToPhase(status: GuestThreadStatus): InquiryWorkflowPhase {
  switch (status) {
    case "offer_pending":
      return "offer_pending";
    case "approved":
      return "approved";
    case "booked":
      return "booked";
    case "closed":
      return "archived";
    case "open":
    default:
      // An open thread that the guest already started is in coordination from
      // the resolver's point of view (a SENT/live phase), not a draft.
      return "coordination";
  }
}

/**
 * Map a guest message author role to the resolver's LastMessageRole vocabulary.
 *   staff  -> coordinator   talent -> talent   system -> system
 *   guest  -> "you" (the viewer's own last send)
 */
function authorRoleToLastMessageRole(
  role: GuestMessageAuthorRole | null,
): LastMessageRole {
  switch (role) {
    case "staff":
      return "coordinator";
    case "talent":
      return "talent";
    case "system":
      return "system";
    case "guest":
      return "you";
    case "other":
    case null:
    default:
      return null;
  }
}

/**
 * Resolve the launcher lifecycle inputs for a guest viewer on a tenant.
 *
 * `tenantSlug` scopes the other-open list. `activeInquiryId` is the focused
 * thread (the resume anchor from getActiveGuestInquiry); when null we still
 * surface other-open inquiries so the label can read the lineup correctly.
 */
export async function resolveLauncherLifecycleInputs(args: {
  tenantSlug: string;
  activeInquiryId: string | null;
  /**
   * When true and no explicit `activeInquiryId` is given, anchor on the guest's
   * most-recent live inquiry on this tenant. Used by the talent-less agency
   * launcher (directory/home) so a guest who already sent an agency inquiry sees
   * "Inquiry sent" / "{agency} replied" instead of only the lineup label.
   */
  autoAnchorLatest?: boolean;
}): Promise<LauncherLifecycleInputs> {
  const { tenantSlug, autoAnchorLatest = false } = args;
  if (!tenantSlug) return EMPTY;

  try {
    // listGuestInquiries returns newest-first; when auto-anchoring, the head is
    // the inquiry to read thread state for.
    const listRes = await listGuestInquiries({ tenantSlug });
    const explicitAnchor = args.activeInquiryId;
    const anchoredInquiryId =
      explicitAnchor ??
      (autoAnchorLatest && listRes.ok && listRes.inquiries.length > 0
        ? listRes.inquiries[0].inquiryId
        : null);
    const threadRes = anchoredInquiryId
      ? await getGuestThreadMessages({ inquiryId: anchoredInquiryId })
      : null;

    let activePhase: InquiryWorkflowPhase | null = null;
    let activeStatus: string | null = null;
    let coordinatorId: string | null = null;
    let lastMessageRole: LastMessageRole = null;
    let lastActivityAt: string | null = null;
    let hasActiveDraft = false;
    let draftInquiryId: string | null = null;
    let unreadCoordinatorReply = false;

    if (threadRes && threadRes.ok) {
      activePhase = threadStatusToPhase(threadRes.threadStatus);
      // The resolver also reads activeStatus for terminal detection; the phase
      // name is a valid status string there, so reuse it (no raw status leaks
      // through the guest contract).
      activeStatus = activePhase;
      const lastMsg =
        threadRes.messages.length > 0
          ? threadRes.messages[threadRes.messages.length - 1]
          : null;
      lastMessageRole = authorRoleToLastMessageRole(lastMsg?.authorRole ?? null);
      lastActivityAt = lastMsg?.createdAt ?? null;
      // The resolver only needs to know WHETHER a coordinator is seated (to pick
      // live_conversation over sent_awaiting), not their id. The guest receipt
      // exposes the coordinator presence (displayName) but NOT a raw id (no PII
      // leak), so we pass a non-PII "assigned" sentinel — the launcher label
      // never renders the value, only branches on its presence.
      coordinatorId = threadRes.receipt?.coordinator ? "assigned" : null;

      // ── Phase 8 (1): cross-session RESUME draft signal ──────────────────────
      // A thread that the guest has NOT yet truly sent reads as a resumable
      // draft. The guest contract collapses the raw status to a coarse 5-value
      // status, so "draft" surfaces as the `open` thread status (-> coordination
      // phase here). We treat the anchored thread as a resumable draft when it is
      // still pre-send: the receipt is null (an inquiry only mints a SENT->
      // RECEIVED receipt once genuinely sent) AND no coordinator is seated. The
      // resolver's own STALE_DRAFT_MS gate (driven by lastActivityAt) then
      // decides whether it yields resume_draft; when the timestamp is missing the
      // resolver keeps the lineup/empty label, so this never over-fires.
      const isPreSend = !threadRes.receipt && coordinatorId === null;
      if (isPreSend && anchoredInquiryId) {
        hasActiveDraft = true;
        draftInquiryId = anchoredInquiryId;
      }

      // ── Phase 8 (2): REPLIED pulse signal ───────────────────────────────────
      // The pulse fires for a returning visitor whose SENT inquiry has an unread
      // coordinator reply as the latest message. Reuse the SAME last-message read
      // (no refetch) and gate on a seated coordinator so a system/talent line
      // never spuriously pulses. The resolver independently maps this to the
      // live_conversation kind ("{agency} replied"); the pulse rides alongside.
      unreadCoordinatorReply =
        coordinatorId != null && lastMessageRole === "coordinator";
    }

    const otherOpenInquiries: OtherOpenInquiry[] =
      listRes.ok
        ? listRes.inquiries
            .filter((inq) => inq.inquiryId !== anchoredInquiryId)
            .map((inq) => ({
              id: inq.inquiryId,
              phase: threadStatusToPhase(inq.threadStatus),
              label: inq.talentName,
            }))
        : [];

    return {
      activePhase,
      activeStatus,
      coordinatorId,
      lastMessageRole,
      lastActivityAt,
      hasActiveDraft,
      draftInquiryId,
      otherOpenInquiries,
      unreadCoordinatorReply,
    };
  } catch {
    return EMPTY;
  }
}
