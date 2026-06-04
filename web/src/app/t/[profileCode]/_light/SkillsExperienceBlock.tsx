/**
 * SkillsExperienceBlock — taxonomy chip groups + per-skill experience.
 * Renders on the left column (main body). Combines:
 *   - Taxonomy chips: fit_labels / skills / industries / event_types / tags
 *   - talent_skills rows with proficiency + years for the primary skill section.
 * --plt tokens only.
 */

import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";
import { LightSectionLabel } from "./section-label";

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
              locale === "es" && s.skill_name_es ? s.skill_name_es : s.skill_name_en;
            const profLabel = s.proficiency_level
              ? PROF_LABELS[s.proficiency_level] ?? s.proficiency_level
              : null;
            const yrs =
              s.years_experience !== null && s.years_experience > 0
                ? `${s.years_experience} yr${s.years_experience === 1 ? "" : "s"}`
                : null;

            return (
              <div
                key={s.skill_term_id}
                className="flex items-center justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"
                style={{ borderColor: "var(--plt-hairline)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      background:
                        s.relationship_type === "primary_role"
                          ? "var(--plt-forest)"
                          : "var(--plt-hairline-strong)",
                    }}
                  />
                  <span className="text-sm font-medium" style={{ color: "var(--plt-ink)" }}>
                    {label}
                  </span>
                  {s.is_verified ? (
                    <span
                      className="text-[0.625rem]"
                      style={{ color: "var(--plt-forest)" }}
                      aria-label="Verified skill"
                    >
                      ✓
                    </span>
                  ) : null}
                </div>
                {yrs || profLabel ? (
                  <span
                    className="plt-mono shrink-0 text-[0.6875rem] uppercase tracking-[0.12em]"
                    style={{ color: "var(--plt-muted)" }}
                  >
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
          {showTags && tags.length > 0 ? <ChipGroup label="Tags" chips={tags} /> : null}
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
      <p
        className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.18em]"
        style={{ color: "var(--plt-muted-soft)" }}
      >
        {label}
      </p>
      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li key={chip}>
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs"
              style={
                variant === "accent"
                  ? {
                      border: "1px solid color-mix(in srgb, var(--plt-forest) 22%, transparent)",
                      background: "var(--plt-forest-soft)",
                      color: "var(--plt-forest-deep)",
                      fontWeight: 500,
                    }
                  : {
                      border: "1px solid var(--plt-hairline-strong)",
                      background: "var(--plt-bg-raised)",
                      color: "var(--plt-ink-soft)",
                    }
              }
            >
              {chip}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
