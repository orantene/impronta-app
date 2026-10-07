"use client";

import {
  messagingTalentLoadContextLines,
  messagingTalentLoadEssentials,
  messagingTalentLoadThread,
  messagingTalentMarkRead,
  messagingTalentReply,
  messagingTalentThreadLink,
} from "@/lib/server-actions/messaging-talent";
import {
  messagingTalentPrivateNote,
  messagingTalentSetState,
  messagingTalentStartConversation,
} from "@/lib/server-actions/messaging-talent-writes";
import type { MessagingRefusal } from "@/lib/messaging/types";

import { engineComposerActions } from "../screens/ComposerWire";
import { fetchTalentInbox } from "./talent-inbox-fetch";

import { engineIdentityActions } from "../screens/IdentityCaptureWire";
import type { ShellEngine } from "./engine";

const refused = (reason: MessagingRefusal = "not_allowed") => Promise.resolve({ ok: false as const, reason });

/**
 * The same shell, with readers and writers that resolve the talent on the
 * server. F38: start a conversation, private notes, resolve / reopen and
 * file upload are hers (mockup msg_d / msg_actions). Assign, hand over,
 * rename, close lost, merge and history are staff chrome: they refuse, and
 * seller mode (`seller.ts`) renders no control for them.
 *
 * Identity uses the shared inquiry-manager writers (match / capture / create
 * client) — stubbing them to `not_allowed` blocked Request payment → Pagado
 * for guest threads the talent already coordinates (Ana, 2026-09-26).
 */
export const talentShellEngine: ShellEngine = {
  // GET, not the server action: a discarded action hung direct loads (route.ts).
  loadInbox: (input) => fetchTalentInbox(input),
  loadThread: (input) => messagingTalentLoadThread(input),
  loadEssentials: (input) => messagingTalentLoadEssentials(input),
  loadContextLines: (input) => messagingTalentLoadContextLines(input),
  markRead: (input) => messagingTalentMarkRead({ inquiryId: input.inquiryId }),
  resolve: (input) => messagingTalentSetState({ ...input, state: "resolved" }),
  reopen: (input) => messagingTalentSetState({ ...input, state: "needs_reply" }),
  assign: () => refused(),
  handOver: () => refused(),
  handOverTargets: () => refused(),
  rename: () => refused(),
  closeLost: () => refused(),
  threadLink: (input) => messagingTalentThreadLink(input),
  merge: () => refused(),
  history: () => refused(),
  startConversation: (input) => messagingTalentStartConversation(input),
  whatsappConnected: async () => false,
  composer: {
    reply: (input) => messagingTalentReply(input),
    note: (input) => messagingTalentPrivateNote(input),
    reopen: (input) => messagingTalentSetState({ ...input, state: "needs_reply" }),
    // The signed attachment pipeline already accepts an active talent participant.
    upload: engineComposerActions.upload,
    seller: true,
  },
  identity: engineIdentityActions,
};
