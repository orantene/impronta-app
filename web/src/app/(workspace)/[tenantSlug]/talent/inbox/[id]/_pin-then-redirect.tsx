"use client";

/**
 * Thread deep link: `/talent/inbox/<id>` opens that conversation IN PLACE.
 *
 * TUL-391 / TUL-959 / TUL-956: this used to pin the id and then
 * redirect to the bare inbox. The redirect was a second dynamic route
 * load (5-10 s on a loading banner with 0 conversations) and it cut
 * the id out of the URL, so a bell click never landed on its own address.
 * Now the id is pinned during the first render (before the lazy Messages page
 * mounts and peeks it) and the shell is told to show Messages without
 * navigating. The URL stays `/talent/inbox/<id>`.
 */

import { useEffect, useState } from "react";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { pinNextConversation } from "@/components/admin/shell/internal/messages/conversation-pending";
import { THREAD_OPENED_EVENT } from "@/components/admin/shell/internal/talent/pages/messages/focus-thread-heading";
import { TalentPageRouteSyncer } from "../../_talent-page-route-syncer";

export function PinAndOpenThread({ conversationId }: { conversationId: string }) {
  // State initialiser: runs once, synchronously, before any effect, so the
  // Messages page that the syncer's effect mounts finds the pinned id.
  useState(() => {
    pinNextConversation(conversationId);
    return null;
  });
  // The old full-page banner is gone, so say it to screen readers instead:
  // a polite live status that announces once and then clears. Focus moves to
  // the open thread's heading (MessagesPage), not to this node.
  const es = useDashboardLocale().toLowerCase().startsWith("es");
  const [status, setStatus] = useState(es ? "Abriendo la conversación…" : "Opening conversation…");
  useEffect(() => {
    const t = window.setTimeout(() => setStatus(""), 4000);
    // TUL-1170: clear as soon as the thread is open and focused, not only on the timer.
    const clear = () => setStatus("");
    window.addEventListener(THREAD_OPENED_EVENT, clear);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(THREAD_OPENED_EVENT, clear);
    };
  }, []);
  return (
    <>
      <span role="status" aria-live="polite" className="sr-only" data-testid="thread-opening-status">
        {status}
      </span>
      <TalentPageRouteSyncer page="messages" />
    </>
  );
}
