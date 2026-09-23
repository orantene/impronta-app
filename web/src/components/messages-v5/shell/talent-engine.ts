"use client";

import {
  messagingTalentLoadContextLines,
  messagingTalentLoadEssentials,
  messagingTalentLoadInbox,
  messagingTalentLoadThread,
  messagingTalentMarkRead,
  messagingTalentNote,
  messagingTalentReply,
  messagingTalentThreadLink,
} from "@/lib/server-actions/messaging-talent";
import type { MessagingRefusal } from "@/lib/messaging/types";

import type { ShellEngine } from "./engine";

const refused = (reason: MessagingRefusal = "not_allowed") => Promise.resolve({ ok: false as const, reason });

/**
 * The same shell, with readers and writers that resolve the talent on the
 * server. Actions that are not hers return a refusal code. The buttons stay.
 */
export const talentShellEngine: ShellEngine = {
  loadInbox: (input) => messagingTalentLoadInbox(input),
  loadThread: (input) => messagingTalentLoadThread(input),
  loadEssentials: (input) => messagingTalentLoadEssentials(input),
  loadContextLines: (input) => messagingTalentLoadContextLines(input),
  markRead: (input) => messagingTalentMarkRead({ inquiryId: input.inquiryId }),
  resolve: () => refused(),
  reopen: () => refused(),
  assign: () => refused(),
  handOver: () => refused(),
  handOverTargets: () => refused(),
  rename: () => refused(),
  closeLost: () => refused(),
  threadLink: (input) => messagingTalentThreadLink(input),
  merge: () => refused(),
  history: () => refused(),
  startConversation: () => refused(),
  whatsappConnected: async () => false,
  composer: {
    reply: (input) => messagingTalentReply(input),
    note: () => messagingTalentNote(),
    reopen: () => refused(),
    upload: async () => ({ ok: false, error: "You cannot do that from here." }),
  },
  identity: {
    match: async () => ({ ok: false, reason: "not_allowed" }),
    capture: async () => ({ ok: false, reason: "not_allowed" }),
    createClient: async () => ({ ok: false, reason: "not_allowed" }),
  },
};
