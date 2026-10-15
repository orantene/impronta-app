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

import { useState } from "react";
import { pinNextConversation } from "@/components/admin/shell/internal/messages/conversation-pending";
import { TalentPageRouteSyncer } from "../../_talent-page-route-syncer";

export function PinAndOpenThread({ conversationId }: { conversationId: string }) {
  // State initialiser: runs once, synchronously, before any effect, so the
  // Messages page that the syncer's effect mounts finds the pinned id.
  useState(() => {
    pinNextConversation(conversationId);
    return null;
  });
  return <TalentPageRouteSyncer page="messages" />;
}
