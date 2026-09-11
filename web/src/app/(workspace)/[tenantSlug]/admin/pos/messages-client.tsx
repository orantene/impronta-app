"use client";

import { MessagesShell, type MessagesClientProps } from "@/components/admin/pos/messages/MessagesShell";

export type { MessagesClientProps };

/** Mount point the integrator renders inside PosFrame when ?view=messages. */
export function MessagesClient(props: MessagesClientProps) {
  return <MessagesShell {...props} />;
}
