/**
 * The canonical directory card moved to the unified, surface-agnostic home
 * `@/components/talent-cards/TalentCard` (P1 — one card for every surface). This
 * file stays as a thin re-export so the section adapters' import path is stable.
 *
 * The new card emits `className="talent-card"` + the full `data-card-*` hook set
 * and reads its colors from the cascade card-token chain, so a tenant's
 * published Card Design repaints it everywhere with no per-card edits.
 */
export { TalentCard as DirectoryCard } from "@/components/talent-cards/TalentCard";
export type { TalentCardProps as DirectoryCardProps } from "@/components/talent-cards/talent-card-shape";
