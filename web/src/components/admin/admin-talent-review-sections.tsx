"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Focus,
  ImageIcon,
  LayoutDashboard,
  Layers,
  ListChecks,
  MapPin,
  MessageSquareText,
  Phone,
  Send,
  Sparkles,
  Star,
  UserCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TalentSectionLabel } from "@/components/talent/talent-dashboard-primitives";
import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/fields/types";
import { isScalarFieldFilled } from "@/lib/profile-completion";
import {
  isTalentOriginComplete,
  isTalentShortBioComplete,
  TALENT_SUBMISSION_THRESHOLD,
  workflowGuidance,
  type TalentChecklistItem,
} from "@/lib/talent-dashboard";
import { cn } from "@/lib/utils";

function pickLabel(en: string, es?: string | null): string {
  return (es?.trim() || en).trim();
}

function checklistItemIcon(key: string): LucideIcon {
  switch (key) {
    case "display_name":
    case "first_name":
    case "last_name":
      return UserCircle;
    case "location":
      return MapPin;
    case "phone":
      return Phone;
    case "taxonomy":
      return Layers;
    case "media":
      return ImageIcon;
    case "fields_required":
    case "fields_recommended":
      return ListChecks;
    default:
      return AlertCircle;
  }
}

function CompletionRing({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative flex size-[4.5rem] shrink-0 items-center justify-center">
      <svg className="size-full -rotate-90" viewBox="0 0 88 88" aria-hidden>
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          className="stroke-muted/35"
          strokeWidth="8"
        />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          className="stroke-emerald-500/85"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums text-foreground">{pct}</span>
    </div>
  );
}

function ReviewSectionRow({
  title,
  subtitle,
  complete,
  fieldCount,
  onClick,
}: {
  title: string;
  subtitle: string;
  complete: boolean;
  fieldCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all duration-200",
        "border-border/40 bg-card/80 shadow-sm",
        "lg:px-5 lg:py-[1.125rem]",
        "hover:border-[var(--impronta-gold)]/45 hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-md",
        "active:scale-[0.99] motion-reduce:active:scale-100",
      )}
    >
      {complete !== undefined ? (
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
            complete
              ? "bg-emerald-500/12 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-400",
          )}
        >
          {complete ? (
            <CheckCircle2 className="size-5" aria-hidden />
          ) : (
            <AlertCircle className="size-5" aria-hidden />
          )}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold tracking-tight text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {fieldCount !== undefined ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {fieldCount} field{fieldCount === 1 ? "" : "s"}
        </span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--impronta-gold)]/80" />
    </button>
  );
}

function AdminMediaNavCard({
  href,
  icon: Icon,
  title,
  subtitle,
  complete,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  complete?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border px-4 py-4 transition-all duration-200",
        "border-border/40 bg-card/80 shadow-sm",
        "lg:px-5 lg:py-[1.125rem]",
        "hover:border-[var(--impronta-gold)]/45 hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-md",
        "active:scale-[0.99] motion-reduce:active:scale-100",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-foreground/90 ring-1 ring-border/40 dark:bg-muted/25">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold tracking-tight text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {complete !== undefined ? (
        complete ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
        ) : (
          <AlertCircle className="size-4 shrink-0 text-amber-500" />
        )
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--impronta-gold)]/80" />
    </Link>
  );
}

type MediaRow = { id: string; variant_kind: string; approval_state: string; sort_order: number };

type FieldValueLite = {
  field_definition_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
};

type FieldCatalog = {
  groups: FieldGroupRow[];
  editableByGroup: Map<string, FieldDefinitionRow[]>;
  hasPrimaryTalentType: boolean;
  taxonomyCount: number;
};

type ProfileLite = {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  bio_en?: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  origin_country_id: string | null;
  origin_city_id: string | null;
  residence_city_id: string | null;
  location_id: string | null;
  workflow_status: string;
  visibility: string;
};

export function AdminTalentReviewSections({
  talentProfileId,
  profile,
  completionScore,
  checklist,
  missingTopIncomplete,
  fieldCatalog,
  fieldValues,
  allTerms,
  assignedIds,
  media,
  previewHref,
  onOpenProfile,
  onOpenTaxonomy,
  onOpenFieldValues,
  onOpenWorkflow,
}: {
  talentProfileId: string;
  profile: ProfileLite;
  completionScore: number;
  checklist: TalentChecklistItem[];
  missingTopIncomplete: TalentChecklistItem[];
  fieldCatalog: FieldCatalog;
  fieldValues: FieldValueLite[];
  allTerms: Array<{ id: string; kind: string; name_en: string; slug: string }>;
  assignedIds: string[];
  media: MediaRow[];
  previewHref: string;
  onOpenProfile: () => void;
  onOpenTaxonomy: () => void;
  onOpenFieldValues: () => void;
  onOpenWorkflow: () => void;
}) {
  const router = useRouter();
  const [roadmapMode, setRoadmapMode] = useState<"full" | "focus">("full");

  const missingItems = useMemo(() => checklist.filter((i) => !i.complete), [checklist]);
  const missingTop = useMemo(() => missingTopIncomplete.slice(0, 4), [missingTopIncomplete]);
  const taxonomyChecklistDone = checklist.find((c) => c.key === "taxonomy")?.complete ?? true;

  const termKindById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of allTerms) map.set(t.id, t.kind);
    return map;
  }, [allTerms]);

  const assignedKinds = useMemo(() => {
    const out = new Set<string>();
    for (const id of assignedIds) {
      const k = termKindById.get(id);
      if (k) out.add(k);
    }
    return out;
  }, [assignedIds, termKindById]);

  const basicInfoGroup = useMemo(
    () => fieldCatalog.groups.find((g) => g.slug === "basic_info"),
    [fieldCatalog.groups],
  );

  const groupsWithFields = useMemo(
    () =>
      fieldCatalog.groups.filter((g) => {
        const defs = fieldCatalog.editableByGroup.get(g.id) ?? [];
        return defs.length > 0;
      }),
    [fieldCatalog.groups, fieldCatalog.editableByGroup],
  );

  const hasDisplayName = !!profile.display_name?.trim();
  const hasLocation = !!(profile.residence_city_id ?? profile.location_id);
  const hasPhone = !!profile.phone?.trim();
  const hasFirstName = !!profile.first_name?.trim();
  const hasLastName = !!profile.last_name?.trim();
  const hasGender = !!profile.gender?.trim();
  const hasDob = !!profile.date_of_birth?.trim();
  const publicIdentityComplete =
    hasDisplayName &&
    hasFirstName &&
    hasLastName &&
    hasPhone &&
    hasGender &&
    hasDob &&
    hasLocation &&
    isTalentShortBioComplete(profile.short_bio, profile.bio_en) &&
    isTalentOriginComplete(profile);

  const hasProfilePhoto = media.some((m) => m.variant_kind === "card");
  const hasCoverPhoto = media.some((m) => m.variant_kind === "banner");
  const galleryCount = media.filter((m) => m.variant_kind === "gallery").length;

  const groupChecklist = useCallback(
    (groupId: string) => {
      const defs = fieldCatalog.editableByGroup.get(groupId) ?? [];
      const scalarDefs = defs.filter((d) =>
        ["text", "textarea", "number", "boolean", "date"].includes(d.value_type),
      );
      const filledCount = scalarDefs.filter((d) => {
        const v = fieldValues.find((fv) => fv.field_definition_id === d.id);
        return isScalarFieldFilled(d, v);
      }).length;
      const scalarComplete = scalarDefs.length === 0 ? null : filledCount === scalarDefs.length;

      const taxonomyDefs = defs.filter(
        (d) => d.value_type === "taxonomy_single" || d.value_type === "taxonomy_multi",
      );
      const requiredTaxonomyKinds = new Set(
        taxonomyDefs.map((d) => d.taxonomy_kind).filter((k): k is string => Boolean(k)),
      );
      const taxonomyComplete =
        requiredTaxonomyKinds.size === 0
          ? null
          : [...requiredTaxonomyKinds].every((k) => assignedKinds.has(k));

      const complete =
        defs.length > 0 && (scalarComplete ?? true) && (taxonomyComplete ?? true);

      const kindsSet = requiredTaxonomyKinds;
      const selectedInGroup =
        kindsSet.size === 0
          ? 0
          : assignedIds.filter((id) => {
              const k = termKindById.get(id);
              return k ? kindsSet.has(k) : false;
            }).length;

      const subtitle =
        scalarDefs.length > 0
          ? `${filledCount} of ${scalarDefs.length} filled`
          : taxonomyDefs.length > 0
            ? selectedInGroup > 0
              ? `${selectedInGroup} selected`
              : "None yet"
            : `${defs.length} field${defs.length === 1 ? "" : "s"}`;

      return { complete, subtitle, defsCount: defs.length };
    },
    [fieldCatalog.editableByGroup, fieldValues, assignedIds, assignedKinds, termKindById],
  );

  const editSectionsAllCompleteInFocus = useMemo(() => {
    if (roadmapMode !== "focus") return false;
    if (!publicIdentityComplete || !taxonomyChecklistDone) return false;
    for (const g of groupsWithFields) {
      const { complete } = groupChecklist(g.id);
      if (!complete) return false;
    }
    return true;
  }, [roadmapMode, publicIdentityComplete, taxonomyChecklistDone, groupsWithFields, groupChecklist]);

  const mediaAllCompleteInFocus = useMemo(
    () =>
      roadmapMode === "focus" && hasProfilePhoto && hasCoverPhoto && galleryCount > 0,
    [roadmapMode, hasProfilePhoto, hasCoverPhoto, galleryCount],
  );

  const publishingComplete =
    profile.workflow_status === "approved" && profile.visibility === "public";

  const draftWorkflowOptimistic = useMemo(
    () =>
      profile.workflow_status === "draft" &&
      completionScore >= TALENT_SUBMISSION_THRESHOLD &&
      missingItems.length === 0,
    [profile.workflow_status, completionScore, missingItems.length],
  );

  const mediaBase = `/admin/talent/${talentProfileId}/media`;

  return (
    <div className="space-y-6">
      <section className="space-y-4 lg:space-y-5">
        <div
          className={cn(
            "overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-[var(--impronta-gold)]/[0.07] via-card to-card",
            "shadow-[0_12px_40px_-18px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.5)]",
            "sm:rounded-2xl lg:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.28)]",
          )}
        >
          <div className="p-4 sm:p-5 lg:p-8">
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_min(100%,17.5rem)] lg:items-start lg:gap-8">
              <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-6">
                <div className="flex justify-center sm:justify-start">
                  <CompletionRing value={completionScore} />
                </div>
                <div className="min-w-0 space-y-1.5 text-center sm:text-left lg:space-y-2">
                  <p className="inline-flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:justify-start">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--impronta-gold)]/12 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/18">
                      <LayoutDashboard className="size-3.5" aria-hidden />
                    </span>
                    Staff review
                  </p>
                  <h2 className="font-display text-lg font-semibold tracking-tight text-foreground lg:text-xl">
                    {missingItems.length > 0
                      ? `${missingItems.length} gap${missingItems.length === 1 ? "" : "s"} for this profile`
                      : "Profile checklist is clear"}
                  </h2>
                  <p className="text-pretty text-sm leading-relaxed text-muted-foreground lg:text-base lg:leading-relaxed">
                    {missingItems.length > 0 ? (
                      <>
                        Same completion model as the talent app — open a section below to fix what
                        still blocks a polished submission.
                      </>
                    ) : (
                      <>
                        Nothing in the talent-facing checklist is blocking. Use workflow when you
                        still need to move state or visibility.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-3 border-t border-border/40 pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <Button
                  variant="outline"
                  asChild
                  className="h-12 w-full gap-2 rounded-2xl border-border/70 bg-background/70 px-4 text-[15px] font-medium backdrop-blur-sm"
                >
                  <Link href={previewHref} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    Preview how it looks
                  </Link>
                </Button>
                <div className="flex flex-col gap-2.5">
                  {missingItems.length > 0 ? (
                    <span className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/[0.09] px-3.5 py-1.5 text-xs font-semibold text-amber-950 sm:w-fit sm:justify-start dark:text-amber-100">
                      <ListChecks className="size-3.5 shrink-0" aria-hidden />
                      {missingItems.length} to improve
                    </span>
                  ) : (
                    <span className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-900 sm:w-fit sm:justify-start dark:text-emerald-100">
                      <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                      Checklist clear
                    </span>
                  )}
                  <p className="text-center text-[13px] leading-snug text-muted-foreground sm:text-left lg:text-sm">
                    <span className="tabular-nums">{completionScore}%</span> complete
                    <span className="text-muted-foreground/60"> · </span>
                    Submit unlocks around <span className="tabular-nums">{TALENT_SUBMISSION_THRESHOLD}%</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3.5 rounded-2xl border border-border/45 bg-gradient-to-br from-muted/50 to-muted/25 px-4 py-3.5 shadow-sm lg:gap-4 lg:px-5 lg:py-4">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 lg:size-11",
              draftWorkflowOptimistic
                ? "bg-emerald-500/12 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400"
                : "bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)] ring-[var(--impronta-gold)]/25",
            )}
          >
            {draftWorkflowOptimistic ? (
              <Sparkles className="size-5" aria-hidden />
            ) : (
              <MessageSquareText className="size-5" aria-hidden />
            )}
          </span>
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground lg:text-base lg:leading-relaxed">
            {workflowGuidance(profile.workflow_status, {
              completionScore,
              missingCount: missingItems.length,
              threshold: TALENT_SUBMISSION_THRESHOLD,
            })}
          </p>
        </div>

        {missingTop.length > 0 ? (
          <div className="space-y-3 lg:space-y-4">
            <div className="flex flex-col gap-1 px-0.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4 lg:items-center">
              <div className="flex items-start gap-3 lg:gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 lg:size-10 dark:text-amber-400">
                  <AlertCircle className="size-[18px] lg:size-5" aria-hidden />
                </span>
                <div className="min-w-0 pt-0.5 lg:pt-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:text-xs">
                    Next steps
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-foreground lg:text-base">
                    <span className="lg:hidden">Tap to open the right editor</span>
                    <span className="hidden lg:inline">Click a card — same panels as Edit on each section</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              {missingTop.map((m) => {
                const ItemIcon = checklistItemIcon(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-card/90 px-3.5 py-3.5 text-left shadow-sm",
                      "lg:min-h-[5.25rem] lg:px-4 lg:py-4",
                      "transition-all duration-150 hover:border-[var(--impronta-gold)]/35 hover:bg-[var(--impronta-gold)]/[0.04] lg:hover:shadow-md",
                      "active:scale-[0.99] motion-reduce:active:scale-100",
                    )}
                    onClick={() => {
                      if (m.key === "media") {
                        router.push(mediaBase);
                        return;
                      }
                      if (m.key === "taxonomy") onOpenTaxonomy();
                      else if (m.key.startsWith("fields_")) onOpenFieldValues();
                      else onOpenProfile();
                    }}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-foreground/90 ring-1 ring-border/50 dark:bg-muted/30 lg:size-11">
                      <ItemIcon className="size-[18px] lg:size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-foreground">{m.label}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{m.description}</p>
                    </div>
                    <ChevronRight
                      className="mt-1 size-4 shrink-0 text-muted-foreground/45 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
            {missingItems.length > missingTop.length ? (
              <p className="px-1 text-xs text-muted-foreground">
                +{missingItems.length - missingTop.length} more in the sections below
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="space-y-2 lg:space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TalentSectionLabel icon={Layers}>Review sections</TalentSectionLabel>
          <div
            className="inline-flex w-fit shrink-0 rounded-2xl border border-border/50 bg-muted/30 p-1"
            role="tablist"
            aria-label="Section roadmap view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={roadmapMode === "full"}
              onClick={() => setRoadmapMode("full")}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
                roadmapMode === "full"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ListChecks className="size-4" aria-hidden />
              Full
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roadmapMode === "focus"}
              onClick={() => setRoadmapMode("focus")}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
                roadmapMode === "focus"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Focus className="size-4" aria-hidden />
              Next
            </button>
          </div>
        </div>

        {editSectionsAllCompleteInFocus ? (
          <div className="rounded-2xl border border-dashed border-emerald-500/35 bg-emerald-500/[0.06] px-4 py-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2 font-medium text-emerald-900 dark:text-emerald-100">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              All edit sections are done in this view
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              Switch to Full to revisit any group, or continue to Media and Publishing below.
            </p>
          </div>
        ) : (
          <>
            {(roadmapMode === "full" || !publicIdentityComplete) && (
              <ReviewSectionRow
                title="Public identity"
                subtitle={[
                  profile.display_name?.trim() || "No display name",
                  hasLocation ? "Lives in set" : "Residence missing",
                ].join(" · ")}
                complete={publicIdentityComplete}
                onClick={onOpenProfile}
              />
            )}

            {(roadmapMode === "full" || !taxonomyChecklistDone) && (
              <ReviewSectionRow
                title="Categories & tags"
                subtitle={
                  fieldCatalog.taxonomyCount > 0
                    ? `${fieldCatalog.taxonomyCount} tag${fieldCatalog.taxonomyCount === 1 ? "" : "s"} · ${fieldCatalog.hasPrimaryTalentType ? "Primary type set" : "Primary type missing"}`
                    : "No tags assigned yet"
                }
                complete={taxonomyChecklistDone}
                onClick={onOpenTaxonomy}
              />
            )}

            {groupsWithFields.map((g) => {
              const { complete: groupComplete, subtitle, defsCount } = groupChecklist(g.id);
              const show = roadmapMode === "full" || !groupComplete;
              if (!show) return null;
              return (
                <ReviewSectionRow
                  key={g.id}
                  title={pickLabel(g.name_en, g.name_es)}
                  subtitle={subtitle}
                  complete={groupComplete}
                  fieldCount={defsCount}
                  onClick={() => {
                    if (basicInfoGroup && g.id === basicInfoGroup.id) onOpenProfile();
                    else onOpenFieldValues();
                  }}
                />
              );
            })}
          </>
        )}
      </div>

      <div className="space-y-2 lg:space-y-3">
        <TalentSectionLabel icon={Camera}>Media</TalentSectionLabel>
        {mediaAllCompleteInFocus ? (
          <div className="rounded-2xl border border-dashed border-emerald-500/35 bg-emerald-500/[0.06] px-4 py-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2 font-medium text-emerald-900 dark:text-emerald-100">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              Media checklist is complete in this view
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              Full roadmap shows profile, cover, and portfolio cards — or open the media workspace.
            </p>
          </div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-3 lg:gap-3">
            {(roadmapMode === "full" || !hasProfilePhoto) && (
              <AdminMediaNavCard
                href={mediaBase}
                icon={UserCircle}
                title="Profile photo"
                subtitle={hasProfilePhoto ? "Uploaded" : "Not set"}
                complete={hasProfilePhoto}
              />
            )}
            {(roadmapMode === "full" || !hasCoverPhoto) && (
              <AdminMediaNavCard
                href={mediaBase}
                icon={ImageIcon}
                title="Cover photo"
                subtitle={hasCoverPhoto ? "Uploaded" : "Not set"}
                complete={hasCoverPhoto}
              />
            )}
            {(roadmapMode === "full" || galleryCount === 0) && (
              <AdminMediaNavCard
                href={mediaBase}
                icon={Camera}
                title="Portfolio"
                subtitle={`${galleryCount} image${galleryCount === 1 ? "" : "s"}`}
                complete={galleryCount > 0}
              />
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 lg:space-y-3">
        <TalentSectionLabel icon={Send}>Publishing</TalentSectionLabel>
        <button
          type="button"
          onClick={onOpenWorkflow}
          className={cn(
            "group flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all duration-200",
            "border-border/40 bg-card/80 shadow-sm",
            "lg:px-5 lg:py-5",
            "hover:border-[var(--impronta-gold)]/45 hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-md",
            "active:scale-[0.99] motion-reduce:active:scale-100",
          )}
        >
          {publishingComplete ? (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 ring-emerald-500/25 lg:size-11 dark:text-emerald-400">
              <CheckCircle2 className="size-5" aria-hidden />
            </span>
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 ring-amber-500/30 lg:size-11 dark:text-amber-400">
              <AlertCircle className="size-5" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-tight text-foreground">
              Workflow & visibility
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {profile.workflow_status.replace(/_/g, " ")} · {profile.visibility}
              {publishingComplete ? " · Live on the directory" : " — adjust when the profile is ready"}
            </p>
          </div>
          <Star className="size-4 shrink-0 text-[var(--impronta-gold)]/80" aria-hidden />
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--impronta-gold)]/80" />
        </button>
      </div>
    </div>
  );
}
