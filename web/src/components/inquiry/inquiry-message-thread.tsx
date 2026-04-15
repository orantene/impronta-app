"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { handleActionResult, type ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { UserAvatar } from "@/components/ui/user-avatar";

type ThreadMessage = {
  id: string;
  body: string;
  created_at: string;
  sender_user_id: string | null;
  sender_name: string | null;
  sender_avatar_url: string | null;
  metadata: Record<string, unknown>;
};

/**
 * Inquiry message thread — `sendAction` returns {@link ActionResult} for consistent UI handling.
 */
export function InquiryMessageThread({
  inquiryId,
  threadType,
  initialMessages,
  sendAction,
  allowCompose = true,
  emptyHint,
  olderHistory,
  loadOlderAction,
}: {
  inquiryId: string;
  threadType: "private" | "group";
  initialMessages: ThreadMessage[];
  sendAction: (formData: FormData) => Promise<ActionResult>;
  allowCompose?: boolean;
  emptyHint?: string;
  /** When the server returned a full first page, offer "load older" using `before_created_at` of the oldest row. */
  olderHistory?: { hasOlder: boolean; oldestCreatedAt: string | null };
  loadOlderAction?: (formData: FormData) => Promise<ActionResult<{ messages: ThreadMessage[] }>>;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [hasOlder, setHasOlder] = useState(Boolean(olderHistory?.hasOlder));
  const [olderPending, startOlderTransition] = useTransition();

  useEffect(() => {
    setMessages(initialMessages);
    setHasOlder(Boolean(olderHistory?.hasOlder));
  }, [initialMessages, olderHistory?.hasOlder]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    void (async () => {
      const result = await sendAction(fd);
      handleActionResult(result, {
        onToast: (m) => toast.message(m),
        onRefresh: () => {
          form.reset();
          router.refresh();
        },
        onInlineError: (m) => toast.error(m),
        onBlockerBanner: (m) => toast.error(m),
      });
    })();
  };

  const oldest = messages[0]?.created_at ?? olderHistory?.oldestCreatedAt ?? null;
  const showLoadOlder =
    Boolean(loadOlderAction && hasOlder && oldest && messages.length > 0);

  const loadOlder = () => {
    if (!loadOlderAction || !oldest) return;
    const fd = new FormData();
    fd.set("inquiry_id", inquiryId);
    fd.set("thread_type", threadType);
    fd.set("before_created_at", oldest);
    fd.set("limit", "50");
    startOlderTransition(() => {
      void loadOlderAction(fd).then((result) => {
        if (!result.ok) {
          handleActionResult(result, {
            onInlineError: (m) => toast.error(m),
            onBlockerBanner: (m) => toast.error(m),
            onToast: (m) => toast.message(m),
            onRefresh: () => router.refresh(),
          });
          return;
        }
        const batch = result.data?.messages ?? [];
        if (batch.length === 0) {
          setHasOlder(false);
          return;
        }
        setMessages((prev) => [...batch, ...prev]);
        if (batch.length < 50) setHasOlder(false);
      });
    });
  };

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <p className="rounded-2xl border border-border/50 bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
          {emptyHint ?? "No messages yet. Send the first message to start the conversation."}
        </p>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto rounded-2xl border border-border/50 bg-muted/10 p-3">
          {showLoadOlder ? (
            <li className="pb-2">
              <Button type="button" size="sm" variant="outline" disabled={olderPending} onClick={loadOlder}>
                {olderPending ? "Loading…" : "Load older messages"}
              </Button>
            </li>
          ) : null}
          {messages.map((m) => {
            const isSystem = !m.sender_user_id;
            const meta = m.metadata as { system_event_type?: string };
            return (
              <li
                key={m.id}
                className="rounded-xl px-3 py-2 text-sm"
                style={
                  isSystem
                    ? { fontStyle: "italic", color: "var(--muted-foreground)" }
                    : undefined
                }
              >
                {!isSystem && (
                  <div className="mb-1 flex items-center gap-1.5">
                    <UserAvatar
                      src={m.sender_avatar_url}
                      name={m.sender_name}
                      size="xs"
                    />
                    <span className="text-xs font-medium text-muted-foreground">
                      {m.sender_name ?? "Unknown"}
                    </span>
                  </div>
                )}
                <span className="text-foreground">
                  {meta?.system_event_type ? `[${meta.system_event_type}] ` : null}
                  {m.body}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {allowCompose ? (
        <form onSubmit={onSubmit} className="flex gap-2">
          <input type="hidden" name="inquiry_id" value={inquiryId} />
          <input type="hidden" name="thread_type" value={threadType} />
          <Input name="body" placeholder="Type a message…" required />
          <Button type="submit" size="sm">
            Send
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Messaging is read-only for this inquiry.</p>
      )}
    </div>
  );
}
