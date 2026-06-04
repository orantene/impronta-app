/**
 * DisciplineChips — talent type chips (primary emphasized, secondaries muted).
 */

type DisciplineChipsProps = {
  primaryType: string | null;
  /** All type labels from taxonomy (primary first by convention). */
  allTypes: string[];
};

export function DisciplineChips({ primaryType, allTypes }: DisciplineChipsProps) {
  if (!primaryType && allTypes.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {allTypes.map((type) => {
        const isPrimary = type === primaryType;
        return (
          <span
            key={type}
            className={[
              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em]",
              isPrimary
                ? "bg-[#1A1A1A] text-white"
                : "border border-[#ECECEC] bg-transparent text-[#6B6B6B]",
            ].join(" ")}
          >
            {type}
          </span>
        );
      })}
    </div>
  );
}
