/**
 * ProfileHeader — avatar · name (serif) · discipline chips · experience line
 * · location · languages · availability pill · CTAs.
 *
 * Overlaps the cover section (negative margin when cover is present).
 * Server component — CTAs are passed as RSC slots.
 */

import Image from "next/image";
import { MapPin } from "lucide-react";
import { DisciplineChips } from "./DisciplineChips";
import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";

type ProfileHeaderProps = {
  name: string;
  profileImageUrl: string | null;
  allTalentTypes: string[];
  primaryType: string | null;
  /** Primary skill (primary_role, first by display_order) for experience line. */
  primarySkill: ResolvedSkill | null;
  livesIn: string | null;
  originallyFrom: string | null;
  languages: string[];
  hasCover: boolean;
  profileCode: string;
  /** Slot: TalentProfileInquireButton (passed from page) */
  inquireButton: React.ReactNode;
  /** Slot: ShareProfileMenu (passed from page) */
  shareMenu: React.ReactNode;
  /** Slot: ProfileDiscoveryCta (passed from page) */
  discoveryCta: React.ReactNode;
  isFeatured: boolean;
};

function experienceLine(skill: ResolvedSkill): string | null {
  const parts: string[] = [];
  if (skill.years_experience !== null && skill.years_experience > 0) {
    parts.push(`${skill.years_experience} yr${skill.years_experience === 1 ? "" : "s"}`);
  }
  if (skill.proficiency_level) {
    const LABELS: Record<string, string> = {
      beginner: "Beginner",
      intermediate: "Intermediate",
      advanced: "Advanced",
      expert: "Expert",
      master: "Master",
    };
    parts.push(LABELS[skill.proficiency_level] ?? skill.proficiency_level);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function ProfileHeader({
  name,
  profileImageUrl,
  allTalentTypes,
  primaryType,
  primarySkill,
  livesIn,
  originallyFrom,
  languages,
  hasCover,
  profileCode,
  inquireButton,
  shareMenu,
  discoveryCta,
  isFeatured,
}: ProfileHeaderProps) {
  const expLine = primarySkill ? experienceLine(primarySkill) : null;
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase() || "·";
  const compactLangLine =
    languages.length > 0
      ? languages
          .slice(0, 3)
          .map((l) => {
            // Shorten "English (native)" → "English"
            const paren = l.indexOf("(");
            return paren > 0 ? l.slice(0, paren).trim() : l;
          })
          .join(" · ") + (languages.length > 3 ? ` +${languages.length - 3}` : "")
      : null;

  return (
    <div
      className={[
        "relative z-10 px-4 sm:px-6 lg:px-8",
        hasCover ? "-mt-12 sm:-mt-16" : "pt-10",
      ].join(" ")}
      data-profile-hero
    >
      <div className="mx-auto max-w-5xl">
        {/* Avatar + info row */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
          {/* Avatar — initials sit behind the photo so a missing/slow image
              never shows as an empty box. */}
          <div
            className={[
              "relative shrink-0 overflow-hidden rounded-2xl shadow-lg",
              hasCover
                ? "h-28 w-20 border-2 border-white sm:h-36 sm:w-28"
                : "h-24 w-16 border border-[#ECECEC] sm:h-32 sm:w-24",
            ].join(" ")}
            data-profile-portrait
          >
            <span
              className="absolute inset-0 flex items-center justify-center bg-[#EFEBE4] font-[family-name:var(--font-cinzel)] text-2xl text-[#B7AE9F] sm:text-3xl"
              aria-hidden="true"
            >
              {initials}
            </span>
            {profileImageUrl ? (
              <Image
                src={profileImageUrl}
                alt={`${name} profile photo`}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 80px, 112px"
              />
            ) : null}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0 space-y-3 pb-1">
            {/* Featured badge (inline when no cover) */}
            {isFeatured && !hasCover ? (
              <span className="inline-flex items-center rounded-full border border-[#ECECEC] bg-[#FAFAF8] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
                Featured
              </span>
            ) : null}

            {/* Name */}
            <h1
              className="font-[family-name:var(--font-cinzel)] text-3xl font-medium leading-tight tracking-wide text-[#1A1A1A] sm:text-4xl lg:text-5xl"
              data-profile-name
            >
              {name}
            </h1>

            {/* Discipline chips */}
            <DisciplineChips primaryType={primaryType} allTypes={allTalentTypes} />

            {/* Experience line */}
            {expLine ? (
              <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#6B6B6B]">
                {expLine}
              </p>
            ) : null}

            {/* Location + languages */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[#6B6B6B]">
              {livesIn ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0 text-[#9CA3AF]" />
                  <span>{livesIn}</span>
                  {originallyFrom ? (
                    <span className="text-[#9CA3AF]">
                      · from {originallyFrom}
                    </span>
                  ) : null}
                </span>
              ) : null}
              {compactLangLine ? (
                <span className="text-[12px] uppercase tracking-[0.1em] text-[#9CA3AF]">
                  {compactLangLine}
                </span>
              ) : null}
              {/* Ref code */}
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#C4C4C4]">
                {profileCode}
              </span>
            </div>
          </div>

          {/* CTA block (top-right on desktop) */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:pb-1">
            {inquireButton}
            {discoveryCta}
          </div>
        </div>

        {/* Share menu row */}
        <div className="mt-4 flex items-center gap-3">
          {shareMenu}
        </div>

        {/* Hairline divider */}
        <div className="mt-8 border-t border-[#ECECEC]" />
      </div>
    </div>
  );
}
