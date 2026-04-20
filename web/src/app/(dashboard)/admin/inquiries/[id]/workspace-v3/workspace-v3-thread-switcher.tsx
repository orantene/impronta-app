"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  InquiryMessageThread,
} from "@/components/inquiry/inquiry-message-thread";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import type { InquiryWorkspaceMessage } from "@/lib/inquiry/inquiry-workspace-types";

type ThreadKey = "client" | "group";

type ThreadMessage = {
  id: string;
  body: string;
  created_at: string;
  sender_user_id: string | null;
  sender_name: string | null;
  sender_avatar_url: string | null;
  metadata: Record<string, unknown>;
};

function toThreadMessages(msgs: InquiryWorkspaceMessage[]): ThreadMessage[] {
  return msgs.map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    sender_user_id: m.sender_user_id,
    sender_name: m.sender_name,
    sender_avatar_url: m.sender_avatar_url,
    metadata: m.metadata,
  }));
}

/**
 * Admin Workspace V3 — center-column thread switcher (M3.4).
 *
 * Spec §5.5: "Messaging is always visible." The switcher replaces the V2 tab
 * nav for messages — client vs. group — and preserves state across reloads
 * via `?thread=client|group`. Per-thread scroll position is preserved in
 * component state while switching (so reopening a thread lands where you
 * left it).
 *
 * Reuses `InquiryMessageThread` verbatim — no rewrite. The V2 thread types
 * ("private" | "group") map 1:1 to ("client" | "group") here (the V2 DB
 * naming is `thread_type='private'|'group'`; §4 of the spec renames "private"
 * to "Client Thread" for UX clarity — we surface the spec wording but keep
 * the DB write-path identical by mapping `client → private` when dispatching
 * to the existing send action).
 */
export function WorkspaceV3ThreadSwitcher({
  inquiryId,
  messagesPrivate,
  messagesGroup,
  sendAction,
  allowCompose,
  unreadPrivate,
  unreadGroup,
  initialThread,
  messagesPrivateHasOlder,
  messagesGroupHasOlder,
  loadOlderAction,
}: {
  inquiryId: string;
  messagesPrivate: InquiryWorkspaceMessage[];
  messagesGroup: InquiryWorkspaceMessage[];
  sendAction: (formData: FormData) => Promise<ActionResult>;
  allowCompose: boolean;
  unreadPrivate: boolean;
  unreadGroup: boolean;
  initialThread: ThreadKey;
  messagesPrivateHasOlder: boolean;
  messagesGroupHasOlder: boolean;
  loadOlderAction?: (formData: FormData) => Promise<ActionResult<{ messages: ThreadMessage[] }>>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [thread, setThread] = useState<ThreadKey>(initialThread);

  // Per-thread scroll position. Keyed by thread — reset on inquiry change
  // (unmount/remount). The actual scroll host is this component's root.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollByThread = useRef<Record<ThreadKey, number>>({ client: 0, group: 0 });

  // Save scroll of current thread before swapping.
  const switchTo = useCallback(
    (next: ThreadKey) => {
      if (next === thread) return;
      if (scrollRef.current) {
        scrollByThread.current[thread] = scrollRef.current.scrollTop;
      }
      setThread(next);
      // Reflect in URL without a full navigation.
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("thread", next);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [thread, router, searchParams],
  );

  // Restore scroll after swap.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollByThread.current[thread] ?? 0;
    }
  }, [thread]);

  const privateTM = toThreadMessages(messagesPrivate);
  const groupTM = toThreadMessages(messagesGroup);
  const activeMsgs = thread === "client" ? privateTM : groupTM;
  const hasOlder = thread === "client" ? messagesPrivateHasOlder : messagesGroupHasOlder;
  const oldestCreatedAt = activeMsgs[0]?.created_at ?? null;
  // V3 uses spec wording ("Client Thread" / "Group Thread") but the DB and
  // server action understand the legacy enum ("private" | "group"). Translate
  // before calling.
  const threadTypeForAction: "private" | "group" = thread === "client" ? "private" : "group";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Message thread" className="flex flex-wrap gap-2 pb-3">
        <ThreadTab
          active={thread === "client"}
          onClick={() => switchTo("client")}
          label="Client Thread"
          hint="You + client"
          unread={unreadPrivate}
        />
        <ThreadTab
          active={thread === "group"}
          onClick={() => switchTo("group")}
          label="Group Thread"
          hint="Agency + all talent · client cannot see"
          unread={unreadGroup}
        />
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <InquiryMessageThread
          key={thread}
          inquiryId={inquiryId}
          threadType={threadTypeForAction}
          initialMessages={activeMsgs}
          sendAction={sendAction}
          allowCompose={allowCompose}
          emptyHint={
            allowCompose ? undefined : "Messaging is read-only for this inquiry."
          }
          olderHistory={{ hasOlder, oldestCreatedAt }}
          loadOlderAction={loadOlderAction}
        />
      </div>
    </div>
  );
}

function ThreadTab({
  active,
  onClick,
  label,
  hint,
  unread,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  unread: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors",
        active
          ? "border-foreground/20 bg-foreground/5 text-foreground"
          : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-[11px] opacity-70">{hint}</span>
      {unread ? (
        <span
          aria-label="Unread messages"
          className="absolute right-2 top-2 inline-block size-2 rounded-full bg-[var(--impronta-gold,#c9a24b)]"
        />
      ) : null}
    </button>
  );
}
