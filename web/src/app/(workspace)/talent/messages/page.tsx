import { redirect } from "next/navigation";

/**
 * /talent/messages — URL-compat alias for the chat-first inquiry surface.
 *
 * The nav labels this surface "Messages" and the shell's segment map accepts
 * the `messages` segment, but the real route is /talent/inbox — so a typed or
 * shared /talent/messages link 404'd. Permanent redirect keeps one canonical
 * URL while making the obvious address work.
 */
export default function TalentMessagesAlias() {
  redirect("/talent/inbox");
}
