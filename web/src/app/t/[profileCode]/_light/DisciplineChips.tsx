/**
 * DisciplineChips — talent type chips (primary in forest, secondaries muted).
 * --plt tokens only.
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
            className="inline-flex items-center rounded-full px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em]"
            style={
              isPrimary
                ? { background: "var(--plt-forest)", color: "var(--plt-forest-on)" }
                : {
                    border: "1px solid var(--plt-hairline-strong)",
                    background: "var(--plt-bg-raised)",
                    color: "var(--plt-ink-soft)",
                  }
            }
          >
            {type}
          </span>
        );
      })}
    </div>
  );
}
