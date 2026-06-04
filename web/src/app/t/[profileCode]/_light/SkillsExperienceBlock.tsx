/**
 * SkillsExperienceBlock — taxonomy chip groups + per-skill experience.
 * Renders on the left column (main body). Combines:
 *   - Taxonomy chips: fit_labels / skills / industries / event_types / tags
 *   - talent_skills rows with proficiency + years for the primary skill section.
 */

import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";

type SkillsExperienceBlockProps = {
  resolvedSkills: ResolvedSkill[];
  fitLabels: string[];
  skills: string[];
  industries: string[];
  eventTypes: string[];
  tags: string[];
  locale: string;
  showFitLabels: boolean;
  showSkills: boolean;
  showIndustries: boolean;
  showEventTypes: boolean;
  showTags: boolean;
  headingLabel: string;
};

const PROF_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
  master: "Master",
};

export function SkillsExperienceBlock({
  resolvedSkills,
  fitLabels,
  skills,
  industries,
  eventTypes,
  tags,
  showFitLabels,
  showSkills,
  showIndustries,
  showEventTypes,
  showTags,
  headingLabel,
  locale,
}: SkillsExperienceBlockProps) {
  const hasResolvedSkills = resolvedSkills.length > 0;
  const hasAnyTaxonomy =
    (showFitLabels && fitLabels.length > 0) ||
    (showSkills && skills.length > 0) ||
    (showIndustries && industries.length > 0) ||
    (showEventTypes && eventTypes.length > 0) ||
    (showTags && tags.length > 0);

  if (!hasResolvedSkills && !hasAnyTaxonomy) return null;

  return (
    <section aria-labelledby="skills-exp-heading" data-profile-section="skills">
      <LightSectionLabel id="skills-exp-heading">{headingLabel}</LightSectionLabel>

      {/* Resolved skills with experience */}
      {hasResolvedSkills ? (
        <div className="mt-5 space-y-3">
          {resolvedSkills.map((s) => {
            const label =
              locale === "es" && s.skill_name_es
                ? s.skill_name_es
                : s.skill_name_en;
            const profLabel = s.proficiency_level
              ? (PROF_LABELS[s.proficiency_level] ?? s.proficiency_level)
              : null;
            const yrs =
              s.years_experience !== null && s.years_experience > 0
                ? `${s.years_experience} yr${s.years_experience === 1 ? "" : "s"}`
                : null;

            return (
              <div
                key={s.skill_term_id}
                className="flex items-center justify-between gap-4 border-b border-[#F0F0EE] pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      "size-2 shrink-0 rounded-full",
                      s.relationship_type === "primary_role"
                        ? "bg-[#1A1A1A]"
                        : "bg-[#D1D5DB]",
                    ].join(" ")}
                  />
                  <span className="text-sm font-medium text-[#1A1A1A]">
                    {label}
                  </span>
                  {s.is_verified ? (
                    <span className="text-[10px] text-[#9CA3AF]" aria-label="Verified skill">
                      ✓
                    </span>
                  ) : null}
                </div>
                {(yrs || profLabel) ? (
                  <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-[#9CA3AF]">
                    {[yrs, profLabel].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Taxonomy chip groups */}
      {hasAnyTaxonomy ? (
        <div className="mt-5 space-y-4">
          {showFitLabels && fitLabels.length > 0 ? (
            <ChipGroup label="Best for" chips={fitLabels} variant="accent" />
          ) : null}
          {showSkills && skills.length > 0 ? (
            <ChipGroup label="Skills" chips={skills} />
          ) : null}
          {showIndustries && industries.length > 0 ? (
            <ChipGroup label="Industries" chips={industries} />
          ) : null}
          {showEventTypes && eventTypes.length > 0 ? (
            <ChipGroup label="Events" chips={eventTypes} />
          ) : null}
          {showTags && tags.length > 0 ? (
            <ChipGroup label="Tags" chips={tags} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ChipGroup({
  label,
  chips,
  variant = "default",
}: {
  label: string;
  chips: string[];
  variant?: "default" | "accent";
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C4C4C4]">
        {label}
      </p>
      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li key={chip}>
            <span
              className={[
                "inline-flex items-center rounded-full px-3 py-1 text-xs",
                variant === "accent"
                  ? "border border-[#1A1A1A]/12 bg-[#1A1A1A]/6 font-medium text-[#1A1A1A]"
                  : "border border-[#ECECEC] bg-white text-[#6B6B6B]",
              ].join(" ")}
            >
              {chip}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LightSectionLabel({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9CA3AF]"
    >
      {children}
    </h2>
  );
}
