/**
 * Which inquiry id the dock panel should keep after the unified hook reports one.
 *
 * The hook lazily creates the first row, and the panel adopts that id while it
 * has none. Once the panel has an id (including a Book again switch), the hook
 * follows the panel. Copying the hook's previous id back onto the panel undoes
 * the switch before the list refetch (D-MSG-307).
 */
export function inquiryIdAfterUnifiedSync(panelId: string | null, unifiedId: string | null): string | null {
  if (panelId) return panelId;
  return unifiedId;
}
