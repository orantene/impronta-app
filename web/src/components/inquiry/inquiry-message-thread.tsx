"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ThreadMessage = {
  id: string;
  body: string;
  created_at: string;
  sender_user_id: string | null;
  metadata: Record<string, unknown>;
};

/**
 * Inquiry message thread shell — wire `sendMessage` server action from parent route.
 */
export function InquiryMessageThread({
  inquiryId,
  threadType,
  initialMessages,
  sendAction,
}: {
  inquiryId: string;
  threadType: "private" | "group";
  initialMessages: ThreadMessage[];
  sendAction: (formData: FormData) => Promise<void>;
}) {
  const [messages] = useState(initialMessages);

  return (
    <div className="space-y-4">
      <ul className="max-h-96 space-y-2 overflow-y-auto rounded-2xl border border-border/50 bg-muted/10 p-3">
        {messages.map((m) => {
          const isSystem = !m.sender_user_id;
          const meta = m.metadata as { system_event_type?: string };
          return (
            <li
              key={m.id}
              className="rounded-xl px-3 py-2 text-sm text-foreground"
              style={
                isSystem
                  ? { fontStyle: "italic", color: "var(--muted-foreground)" }
                  : undefined
              }
            >
              {meta?.system_event_type ? `[${meta.system_event_type}] ` : null}
              {m.body}
            </li>
          );
        })}
      </ul>
      <form action={sendAction} className="flex gap-2">
        <input type="hidden" name="inquiry_id" value={inquiryId} />
        <input type="hidden" name="thread_type" value={threadType} />
        <Input name="body" placeholder="Type a message…" required />
        <Button type="submit" size="sm">
          Send
        </Button>
      </form>
    </div>
  );
}
