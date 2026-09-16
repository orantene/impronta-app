/**
 * chat_with_us — the types the island codes against.
 *
 * A floating button → sheet thread on a phone, a docked panel on desktop.
 * The read says whether the workspace takes messages and whether this
 * browser already has a conversation; the act starts one (an inquiry with
 * the first message) and hands back the customer thread link `/c/t/<token>`.
 */

import type { StorefrontRefusal } from "./refusals";

export type ChatWithUsProps = {
  greeting?: string | null;
  /** Authored opening hours sentence; shown as-is (no engine has hours). */
  hours?: string | null;
  channels?: Array<"thread" | "whatsapp">;
  locale?: string | null;
};

export type ChatWithUsData = {
  /** The workspace takes new conversations right now. */
  open: boolean;
  greeting: string | null;
  hours: string | null;
  channels: {
    thread: boolean;
    /** `https://wa.me/<number>` when the workspace published a WhatsApp number. */
    whatsappUrl: string | null;
  };
  /** This browser's latest conversation with the workspace, if any. */
  existing: { inquiryId: string; status: string; threadUrl: string | null; startedAtIso: string } | null;
  prefill: { name: string | null; email: string | null } | null;
};

export type ChatWithUsInput = {
  tenantId: string;
  contact: { name: string; email?: string | null; phone?: string | null };
  message: string;
  sourcePage?: string | null;
  /** Per conversation; a double-tap replays the same thread. */
  clientKey: string;
  locale?: string | null;
};

export type ChatWithUsDone = {
  ok: true;
  inquiryId: string;
  messageId: string | null;
  /** `/c/t/<token>` on this host; null only when the signing secret is absent. */
  threadUrl: string | null;
  threadPath: string | null;
  replayed: boolean;
};

export type ChatWithUsResult = ChatWithUsDone | StorefrontRefusal;
