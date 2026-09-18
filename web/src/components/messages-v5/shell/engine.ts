"use client";

/**
 * The shell's engine surface: every server action the shell calls, behind
 * one object so the dev preview (`fixture-engine.ts`) and the tests can run
 * the same shell on fixture data. Principle 0: these are the POS engine's
 * own readers and writers, nothing is inserted from here.
 */

import { markThreadRead } from "@/app/(workspace)/[tenantSlug]/admin/messages/actions";
import { loadWhatsAppConnection } from "@/lib/channels/pairing-actions";
import type { HandOverTarget } from "@/lib/messaging/sheets";
import type { ActionResult, ConversationHistoryEntry, Essentials, InboxFilter, InboxRow, MessagingChannel, MessagingRefusal, ThreadMessage } from "@/lib/messaging/types";
import {
  loadConversationHistory,
  messagingAssignOwner,
  messagingCloseLost,
  messagingHandOver,
  messagingMerge,
  messagingLoadEssentials,
  messagingLoadInbox,
  messagingLoadThread,
  messagingRename,
  messagingReopen,
  messagingResolve,
} from "@/lib/server-actions/messaging-engine";
import { messagingStartConversation } from "@/lib/server-actions/messaging-start";
import { messagingLoadContextLines, messagingLoadHandOverTargets, messagingThreadLink } from "@/lib/server-actions/messaging-sheets";

import type { ComposerActions } from "../screens/ComposerWire";
import { engineComposerActions } from "../screens/ComposerWire";
import type { IdentityActions } from "../screens/IdentityCaptureWire";
import { engineIdentityActions } from "../screens/IdentityCaptureWire";

type Versioned = { inquiryId: string; expectedVersion: number };
/** `ActionResult`'s default payload is `Record<string, never>`, which a bare `{ ok: true }` does not satisfy. */
export type PlainResult = { ok: true } | { ok: false; reason: MessagingRefusal };

export type ShellEngine = {
  readonly loadInbox: (input: { locationSlug: string; filter: InboxFilter }) => Promise<ActionResult<{ rows: InboxRow[]; unreadCount: number }>>;
  readonly loadThread: (input: { inquiryId: string }) => Promise<ActionResult<{ messages: ThreadMessage[] }>>;
  readonly loadEssentials: (input: { inquiryId: string }) => Promise<ActionResult<{ essentials: Essentials }>>;
  /** Context panel Items + Money from the conversation's shared draft (D-MSG-111). Optional: an engine without it leaves the sections empty. */
  readonly loadContextLines?: (input: { inquiryId: string }) => Promise<ActionResult<{ lines: ContextLine[] | null; money: ContextMoneyCents | null }>>;
  readonly markRead: (input: { tenantSlug: string; inquiryId: string }) => Promise<void>;
  readonly resolve: (input: Versioned) => Promise<ActionResult<{ version?: number }>>;
  readonly reopen: (input: Versioned) => Promise<ActionResult<{ version?: number }>>;
  readonly assign: (input: Versioned & { ownerUserId: string | null }) => Promise<ActionResult<{ version?: number }>>;
  readonly handOver: (input: Versioned & { ownerUserId: string }) => Promise<PlainResult>;
  readonly handOverTargets: () => Promise<ActionResult<{ targets: HandOverTarget[] }>>;
  readonly rename: (input: Versioned & { name: string }) => Promise<ActionResult<{ version?: number }>>;
  readonly closeLost: (input: Versioned & { reason: string }) => Promise<ActionResult<{ version?: number }>>;
  readonly threadLink: (input: { inquiryId: string }) => Promise<ActionResult<{ token: string }>>;
  /** D14: merges `duplicateInquiryId` into `intoInquiryId`; `expectedVersion` is the DUPLICATE's lock (`lib/messaging/merge.ts`). */
  readonly merge: (input: { duplicateInquiryId: string; intoInquiryId: string; expectedVersion: number }) => Promise<{ ok: true } | { ok: false; reason: MessagingRefusal }>;
  readonly history: (input: { inquiryId: string }) => Promise<{ ok: true; entries: ConversationHistoryEntry[] } | { ok: false; reason: string }>;
  readonly startConversation: (input: { name: string; email: string | null; phone: string | null; channel: MessagingChannel; firstMessage: string | null }) => Promise<ActionResult<{ inquiryId: string; token: string | null }>>;
  readonly whatsappConnected: () => Promise<boolean>;
  readonly composer: ComposerActions;
  readonly identity: IdentityActions;
};

export type ContextLine = { id: string; label: string; units: number; unitCents: number; proposedBy: "client" | "staff" | null; confirmed: boolean };
export type ContextMoneyCents = { totalCents: number; paidCents: number; balanceCents: number; currency: string };

export const liveShellEngine: ShellEngine = {
  loadInbox: (input) => messagingLoadInbox(input),
  loadThread: (input) => messagingLoadThread(input),
  loadEssentials: (input) => messagingLoadEssentials(input),
  loadContextLines: (input) => messagingLoadContextLines(input),
  markRead: (input) => markThreadRead(input.tenantSlug, input.inquiryId, "private"),
  resolve: (input) => messagingResolve(input),
  reopen: (input) => messagingReopen(input),
  assign: (input) => messagingAssignOwner(input),
  handOver: (input) => messagingHandOver(input),
  handOverTargets: () => messagingLoadHandOverTargets(),
  rename: (input) => messagingRename(input),
  closeLost: (input) => messagingCloseLost(input),
  threadLink: (input) => messagingThreadLink(input),
  merge: (input) => messagingMerge(input),
  history: (input) => loadConversationHistory(input),
  startConversation: (input) => messagingStartConversation(input),
  whatsappConnected: async () => {
    const result = await loadWhatsAppConnection();
    return result.ok && result.enabled && result.connection.state === "connected";
  },
  composer: engineComposerActions,
  identity: engineIdentityActions,
};
