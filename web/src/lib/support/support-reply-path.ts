import { guestResumePath } from "./guest-resume-token";

/**
 * Where a requester-facing support email should send the reader.
 * Guest tickets must NEVER fall through to /talent?support=.
 */
export function supportRequesterReplyPath(
  surface: string | null | undefined,
  ticketId: string,
): string {
  if (surface === "guest") return guestResumePath(ticketId);
  if (surface === "client") return `/client?support=${ticketId}`;
  if (surface === "workspace") return `/admin?support=${ticketId}`;
  return `/talent?support=${ticketId}`;
}
