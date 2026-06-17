/**
 * ProfileHeader — avatar · name (plt-display) · discipline chips · experience
 * line · location · languages · CTAs · hubs indicator.
 *
 * Overlaps the cover section (negative margin when cover is present).
 * Server component — CTAs/hubs are passed as RSC slots. --plt tokens only.
 */

import Image from "next/image";
import Link from "next/link";
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
  /** Slot: ProfileHubsIndicator — "Also represented on" (passed from page) */
  hubsIndicator: React.ReactNode;
  isFeatured: boolean;
  /**
   * Max site URL. Non-null ONLY when the talent is on the Max plan AND has a
   * published site. When set, renders the "Max" VIP badge + "Visit my site" CTA.
   */
  maxSiteUrl?: string | null;
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
  hubsIndicator,
  isFeatured,
  maxSiteUrl,
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
            className="relative shrink-0 overflow-hidden rounded-[var(--plt-radius-lg)]"
            style={{
              boxShadow: "var(--plt-shadow-lg)",
              border: hasCover
                ? "2px solid var(--plt-bg)"
                : "1px solid var(--plt-hairline-strong)",
            }}
            data-profile-portrait
          >
            <div className={hasCover ? "h-28 w-20 sm:h-36 sm:w-28" : "h-24 w-16 sm:h-32 sm:w-24"}>
              <span
                className="plt-display absolute inset-0 flex items-center justify-center text-2xl font-semibold sm:text-3xl"
                style={{
                  background: "var(--plt-bg-deep)",
                  color: "color-mix(in srgb, var(--plt-forest) 32%, var(--plt-muted-soft))",
                }}
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
          </div>

          {/* Name + meta */}
          <div className="min-w-0 flex-1 space-y-3 pb-1">
            {/* Featured badge (inline when no cover) */}
            {isFeatured && !hasCover ? (
              <span
                className="plt-mono inline-flex items-center rounded-full border px-3 py-1 text-[0.625rem] font-medium uppercase tracking-[0.18em]"
                style={{
                  borderColor: "var(--plt-hairline-strong)",
                  background: "var(--plt-bg-raised)",
                  color: "var(--plt-ink-soft)",
                }}
              >
                Featured
              </span>
            ) : null}

            {/* Name */}
            <h1
              className="plt-display text-3xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-4xl lg:text-5xl"
              style={{ color: "var(--plt-ink-strong)" }}
              data-profile-name
            >
              {name}
            </h1>

            {/* Discipline chips */}
            <DisciplineChips primaryType={primaryType} allTypes={allTalentTypes} />

            {/* Max VIP badge + "Visit my site" CTA — only when Max + published */}
            {maxSiteUrl ? (
              <div className="flex flex-wrap items-center gap-2">
                {/* "Max" VIP pill */}
                <span
                  className="plt-mono inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.18em]"
                  style={{
                    borderColor: "var(--plt-forest)",
                    background:
                      "color-mix(in srgb, var(--plt-forest) 8%, transparent)",
                    color: "var(--plt-forest)",
                  }}
                >
                  ✦ Max
                </span>
                {/* "Visit my site" link */}
                <Link
                  href={maxSiteUrl}
                  className="plt-mono inline-flex items-center gap-1 text-[0.75rem] font-medium underline-offset-2 hover:underline"
                  style={{ color: "var(--plt-forest)" }}
                  target={maxSiteUrl.startsWith("http") ? "_blank" : undefined}
                  rel={
                    maxSiteUrl.startsWith("http")
                      ? "noopener noreferrer"
                      : undefined
                  }
                >
                  Visit my site →
                </Link>
              </div>
            ) : null}

            {/* Experience line */}
            {expLine ? (
              <p
                className="plt-mono text-[0.75rem] font-medium uppercase tracking-[0.16em]"
                style={{ color: "var(--plt-ink-soft)" }}
              >
                {expLine}
              </p>
            ) : null}

            {/* Location + languages */}
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm"
              style={{ color: "var(--plt-muted)" }}
            >
              {livesIn ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" style={{ color: "var(--plt-forest)" }} />
                  <span style={{ color: "var(--plt-ink-soft)" }}>{livesIn}</span>
                  {originallyFrom ? <span>· from {originallyFrom}</span> : null}
                </span>
              ) : null}
              {compactLangLine ? (
                <span className="plt-mono text-[0.75rem] uppercase tracking-[0.1em]">
                  {compactLangLine}
                </span>
              ) : null}
              {/* Ref code */}
              <span
                className="plt-mono text-[0.625rem] uppercase tracking-[0.18em]"
                style={{ color: "var(--plt-muted-soft)" }}
              >
                {profileCode}
              </span>
            </div>

            {/* Multi-workspace hubs — "Also represented on" */}
            {hubsIndicator ? <div className="pt-1">{hubsIndicator}</div> : null}
          </div>

          {/* CTA block (top-right on desktop) */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:pb-1">
            {inquireButton}
            {discoveryCta}
          </div>
        </div>

        {/* Share row */}
        <div className="mt-5 flex items-center gap-3">{shareMenu}</div>

        {/* Hairline divider */}
        <div className="mt-8 border-t" style={{ borderColor: "var(--plt-hairline)" }} />
      </div>
    </div>
  );
}
