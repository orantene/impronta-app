/**
 * TUL-1887: who a reply on the client's thread is from. The token thread drew every reply as the
 * business ("Tulala Hub" on the platform hub). A reply written by a talent on the inquiry carries
 * that talent's own display name; a reply from the hub/system (no sender, or a staff account)
 * keeps the business label. Pure.
 */
import { threadSenderLabel } from "@/lib/inquiry/thread-sender-label";

export type TalentSender = { readonly userId: string; readonly displayName: string };

/** userId -> talent display name, from talent profiles keyed by user and the inquiry's talent participants. */
export function talentNamesByUser(sources: ReadonlyArray<ReadonlyArray<{ user_id: string | null; display_name: string | null }>>): Map<string, string> {
  const map = new Map<string, string>();
  for (const rows of sources) {
    for (const r of rows) {
      const name = r.display_name?.trim();
      if (r.user_id && name && !map.has(r.user_id)) map.set(r.user_id, name);
    }
  }
  return map;
}

/** The label for one message, or null when the generic business label applies. */
export function senderLabelFor(
  senderUserId: string | null,
  talentNames: ReadonlyMap<string, string>,
  accountNames: ReadonlyMap<string, string>,
): string | null {
  if (!senderUserId) return null;
  const talent = talentNames.get(senderUserId);
  if (!talent) return null;
  return threadSenderLabel({ accountName: accountNames.get(senderUserId) ?? null, talentDisplayName: talent, fallback: talent });
}
