/**
 * A ShellEngine over `lib/messaging/fixture.ts` for the dev preview
 * (`/c/t/preview?screen=shell`) and the shell tests. Writes mutate the
 * in-memory rows so the screen reacts (a reply appends a bubble, Resolve
 * flips the state) without touching any tenant. Labelled example data.
 */

import { fixtureEssentials, fixtureInbox, fixtureThread } from "@/lib/messaging/fixture";
import type { ActionResult, InboxRow, ThreadMessage } from "@/lib/messaging/types";

import type { ShellEngine } from "./engine";

const ok = <T extends Record<string, unknown>>(extra: T): ActionResult<T> => ({ ok: true, ...extra });

export function fixtureShellEngine(): ShellEngine {
  const rows: InboxRow[] = fixtureInbox();
  const threads = new Map<string, ThreadMessage[]>();
  const thread = (id: string) => {
    let list = threads.get(id);
    if (!list) {
      list = fixtureThread(id);
      threads.set(id, list);
    }
    return list;
  };
  const rowOf = (id: string) => rows.find((r) => r.id === id) ?? null;
  const bump = (id: string, patch: Partial<InboxRow>) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i === -1) return null;
    rows[i] = { ...rows[i], ...patch, version: rows[i].version + 1, updatedAt: new Date().toISOString() };
    return rows[i].version;
  };
  const versioned = (id: string, expected: number) => {
    const row = rowOf(id);
    if (!row) return "not_found" as const;
    if (row.version !== expected) return "conflict" as const;
    return null;
  };

  return {
    loadInbox: async ({ filter }) => {
      const listed = filter === "all" ? rows : rows.filter((r) => r.conversationState === filter);
      return ok({ rows: listed.map((r) => ({ ...r })), unreadCount: rows.reduce((n, r) => n + r.unreadCount, 0) });
    },
    loadThread: async ({ inquiryId }) => (rowOf(inquiryId) ? ok({ messages: thread(inquiryId).map((m) => ({ ...m })) }) : { ok: false, reason: "not_found" }),
    loadEssentials: async ({ inquiryId }) => (rowOf(inquiryId) ? ok({ essentials: fixtureEssentials(inquiryId) }) : { ok: false, reason: "not_found" }),
    markRead: async ({ inquiryId }) => {
      const i = rows.findIndex((r) => r.id === inquiryId);
      if (i !== -1) rows[i] = { ...rows[i], unread: false, unreadCount: 0 };
    },
    resolve: async ({ inquiryId, expectedVersion }) => {
      const bad = versioned(inquiryId, expectedVersion);
      if (bad) return { ok: false, reason: bad };
      return ok({ version: bump(inquiryId, { conversationState: "resolved" }) ?? expectedVersion });
    },
    reopen: async ({ inquiryId, expectedVersion }) => {
      const bad = versioned(inquiryId, expectedVersion);
      if (bad) return { ok: false, reason: bad };
      return ok({ version: bump(inquiryId, { conversationState: "needs_reply" }) ?? expectedVersion });
    },
    assign: async ({ inquiryId, expectedVersion, ownerUserId }) => {
      const bad = versioned(inquiryId, expectedVersion);
      if (bad) return { ok: false, reason: bad };
      return ok({ version: bump(inquiryId, { ownerUserId, ownerLabel: ownerUserId === "user-ana" ? "Ana" : ownerUserId === "user-luis" ? "Luis" : null }) ?? expectedVersion });
    },
    handOver: async ({ inquiryId, expectedVersion, ownerUserId }) => {
      const bad = versioned(inquiryId, expectedVersion);
      if (bad) return { ok: false, reason: bad };
      bump(inquiryId, { ownerUserId, ownerLabel: ownerUserId === "user-ana" ? "Ana" : "Luis" });
      return { ok: true };
    },
    handOverTargets: async () => ok({ targets: [{ userId: "user-ana", name: "Ana", role: "manager" }, { userId: "user-luis", name: "Luis", role: "staff" }] }),
    rename: async ({ inquiryId, expectedVersion, name }) => {
      const bad = versioned(inquiryId, expectedVersion);
      if (bad) return { ok: false, reason: bad };
      return ok({ version: bump(inquiryId, { subject: name }) ?? expectedVersion });
    },
    closeLost: async ({ inquiryId, expectedVersion }) => {
      const bad = versioned(inquiryId, expectedVersion);
      if (bad) return { ok: false, reason: bad };
      return ok({ version: bump(inquiryId, { conversationState: "resolved", opportunityState: "lost" }) ?? expectedVersion });
    },
    threadLink: async ({ inquiryId }) => ok({ token: `fixture-${inquiryId}` }),
    history: async () => ({ ok: true, entries: [{ at: "2026-09-10T18:10:00Z", actorLabel: "Ana", kind: "assignment", text: "Ana took this conversation" }] }),
    startConversation: async ({ name, channel, email, phone }) => {
      const id = `inq-new-${rows.length + 1}`;
      rows.unshift({
        id,
        tenantId: rows[0]?.tenantId ?? "fixture",
        locationSlug: "default",
        contactName: name,
        contactPhone: phone,
        contactEmail: email,
        conversationState: "awaiting_customer",
        opportunityState: null,
        channel,
        ownerUserId: null,
        ownerLabel: null,
        unread: false,
        unreadCount: 0,
        subject: name,
        lastMessagePreview: "",
        nextAction: null,
        lastCustomerMessageAt: null,
        lastStaffMessageAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        recordChips: [],
      });
      threads.set(id, []);
      return ok({ inquiryId: id, token: `fixture-${id}` });
    },
    whatsappConnected: async () => false,
    composer: {
      reply: async ({ inquiryId, body, expectedVersion }) => {
        const bad = versioned(inquiryId, expectedVersion);
        if (bad) return { ok: false, reason: bad };
        const row = rowOf(inquiryId);
        if (row?.conversationState === "resolved") return { ok: false, reason: "already_resolved" };
        const id = `m-${Date.now()}`;
        thread(inquiryId).push({ id, inquiryId, kind: "text", body, payload: null, senderUserId: "user-ana", guestSessionId: null, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, thread: "private", internal: false, delivery: { channel: "web_chat", state: "sent" } });
        bump(inquiryId, { conversationState: "awaiting_customer", lastMessagePreview: `You: ${body}` });
        return ok({ messageId: id });
      },
      note: async ({ inquiryId, body }) => {
        const id = `n-${Date.now()}`;
        thread(inquiryId).push({ id, inquiryId, kind: "internal_note", body, payload: null, senderUserId: "user-ana", guestSessionId: null, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, thread: "private", internal: true, delivery: null });
        return ok({ messageId: id });
      },
      reopen: async ({ inquiryId, expectedVersion }) => {
        const bad = versioned(inquiryId, expectedVersion);
        if (bad) return { ok: false, reason: bad };
        return ok({ version: bump(inquiryId, { conversationState: "needs_reply" }) ?? expectedVersion });
      },
      upload: async () => ({ ok: true }),
    },
    identity: {
      match: async ({ phone }) => ok({ matches: phone.trim() ? [{ customerId: "cus-1", level: "phone", displayName: "Marco Ruiz", email: null, phoneE164: "+52998", score: 1 }] : [] }),
      capture: async ({ inquiryId, expectedVersion }) => {
        const bad = versioned(inquiryId, expectedVersion);
        if (bad) return { ok: false, reason: bad };
        return ok({ version: bump(inquiryId, { contactName: "Marco Ruiz" }) ?? expectedVersion });
      },
    },
  };
}
