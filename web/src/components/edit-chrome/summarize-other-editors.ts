/**
 * Collapse presence peers into "other people" vs "my other tabs".
 *
 * Grouping is by auth userId. Display-name matching is intentionally NOT used
 * once this tab's auth has resolved — a peer can legitimately publish
 * `userId: null` + default name "You" before their async getUser() completes,
 * and hiding them would conceal a real co-editor.
 *
 * While THIS tab is still unresolved (`myUserId` null), null-ID peers named
 * "You" are treated as our own pre-auth tracks (the alone-on-page ghost that
 * produced "You is also editing this page"). PresenceProvider re-tracks once
 * auth resolves so other tabs of ours pick up a real userId shortly after.
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
  const peopleById = new Map<string, string>();
  let myOtherTabs = 0;
  for (const o of others) {
    if (o.userId && myUserId && o.userId === myUserId) {
      myOtherTabs += 1;
      continue;
    }
    // Pre-auth race only: both sides unresolved + default self label.
    if (!o.userId && !myUserId && o.name === "You") {
      myOtherTabs += 1;
      continue;
    }
    peopleById.set(o.userId ?? o.id, o.name);
  }
  return { peopleNames: [...peopleById.values()], myOtherTabs };
}
