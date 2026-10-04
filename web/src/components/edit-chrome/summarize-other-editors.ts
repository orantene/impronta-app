/**
 * Collapse presence peers into "other people" vs "my other tabs".
 *
 * Ghost tracks with the default self label ("You") and no userId used to land
 * in peopleNames, producing the LIVE banner "You is also editing this page".
 */

export type PresenceEditorLike = {
  id: string;
  name: string;
  userId?: string | null;
  isSelf?: boolean;
};

export function summarizeOtherEditors(
  editors: readonly PresenceEditorLike[],
  others: readonly PresenceEditorLike[],
): { peopleNames: string[]; myOtherTabs: number } {
  const self = editors.find((e) => e.isSelf) ?? null;
  const myUserId = self?.userId ?? null;
  const selfName = self?.name ?? null;
  const peopleById = new Map<string, string>();
  let myOtherTabs = 0;
  for (const o of others) {
    if (o.userId && myUserId && o.userId === myUserId) {
      myOtherTabs += 1;
      continue;
    }
    // Unresolved / ghost self tracks: name "You" (or our current selfName)
    // with no userId — count as another tab of ours, never as a stranger.
    if (
      !o.userId &&
      (o.name === "You" || (selfName != null && o.name === selfName))
    ) {
      myOtherTabs += 1;
      continue;
    }
    peopleById.set(o.userId ?? o.id, o.name);
  }
  return { peopleNames: [...peopleById.values()], myOtherTabs };
}
