/**
 * F38: which Messages writes a talent owns. Pure. On her own hub sale she
 * is the seller and runs her thread (notes, resolve, reopen). On an agency
 * sale the agency owns the thread and her engine refuses.
 */
export function talentWriteRefusal(isSeller: boolean): "not_her_sale" | null {
  return isSeller ? null : "not_her_sale";
}

/**
 * The talent engine's refusing verbs: staff-only, because a solo talent has
 * no team to assign, hand over, merge or audit. Seller mode renders no
 * control for them (guarded by talent-engine.static.test.ts).
 */
export const TALENT_ENGINE_STAFF_ONLY = ["assign", "handOver", "handOverTargets", "rename", "closeLost", "merge", "history"] as const;
