"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Focus,
  Images,
  ImageIcon,
  Info,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Send,
  Sparkles,
  Star,
  UserCircle,
  Camera,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TalentSectionLabel } from "@/components/talent/talent-dashboard-primitives";
import {
  checklistItemIconForKey,
  TalentRoadmapMediaCard,
  TalentRoadmapSectionButton,
} from "@/components/talent/talent-profile-roadmap-ui";
import {
  ADMIN_OUTLINE_CONTROL_CLASS,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/fields/types";
import { isScalarFieldFilled } from "@/lib/profile-completion";
import {
  buildTalentChecklist,
  calculateTalentCompletion,
  isTalentOriginComplete,
  isTalentShortBioComplete,
  TALENT_SUBMISSION_THRESHOLD,
  workflowGuidance,
} from "@/lib/talent-dashboard";
import { cn } from "@/lib/utils";

const ADMIN_ROADMAP_MODE_KEY = "impronta_admin_talent_roadmap_mode";

function pickLabel(en: string, es?: string | null): string {
  return (es?.trim() || en).trim();
}

function summarizeMissing(checklist: ReturnType<typeof buildTalentChecklist>) {
  return checklist.filter((i) => !i.complete).slice(0, 4);
}

function AdminRoadmapMotionRow({
  id,
  show,
  staggerIndex,
  children,
}: {
  id: string;
  show: boolean;
  staggerIndex: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const stagger = reduce ? 0 : staggerIndex * 0.042;
  const dur = reduce ? 0.12 : 0.2;

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key={id}
          layout
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: dur, delay: stagger },
          }}
          exit={{
            opacity: 0,
            y: reduce ? 0 : -6,
            transition: { duration: dur, delay: stagger },
          }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

type MediaRow = { variant_kind: string };

type AccountProfile = {
  display_name: string | null;
  account_status: string | null;
  app_role: string | null;
} | null;

export function AdminTalentProfileRoadmap({
  talentId,
  profile,
  accountProfile,
  assignedIds,
  allTerms,
  media,
  fieldCatalog,
  fieldValues,
  submissionSummaryBadge,
  onOpenSheet,
}: {
  talentId: string;
  profile: {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    short_bio: string | null;
    phone: string | null;
    gender: string | null;
    date_of_birth: string | null;
    origin_country_id: string | null;
    origin_city_id: string | null;
    residence_city_id: string | null;
    location_id: string | null;
    workflow_status: string;
    visibility: string;
    profile_code: string;
    user_id: string | null;
    updated_at: string | null;
  };
  accountProfile: AccountProfile;
  assignedIds: string[];
  allTerms: Array<{ id: string; kind: string; name_en: string; slug: string }>;
  media: MediaRow[];
  fieldCatalog: {
    groups: FieldGroupRow[];
    editableByGroup: Map<string, FieldDefinitionRow[]>;
    defs: FieldDefinitionRow[];
    requiredScalarTotal: number;
    requiredScalarComplete: number;
    recommendedScalarTotal: number;
    recommendedScalarComplete: number;
    hasPrimaryTalentType: boolean;
    taxonomyCount: number;
    mediaCount: number;
  };
  fieldValues: Array<{
    field_definition_id: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_date: string | null;
  }>;
  submissionSummaryBadge: ReactNode;
  onOpenSheet: (sheet: "publicProfile" | "workflow" | "taxonomy" | "fieldValues") => void;
}) {
  const router = useRouter();
  const [roadmapMode, setRoadmapMode] = useState<"full" | "focus">("full");

  useEffect(() => {
    try {
      const v = sessionStorage.getItem(ADMIN_ROADMAP_MODE_KEY);
      if (v === "focus" || v === "full") setRoadmapMode(v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(ADMIN_ROADMAP_MODE_KEY, roadmapMode);
    } catch {
      /* ignore */
    }
  }, [roadmapMode]);

  const completionInput = useMemo(
    () => ({
      display_name: profile.display_name,
      first_name: profile.first_name,
      last_name: profile.last_name,
      short_bio: profile.short_bio,
      phone: profile.phone,
      gender: profile.gender,
      date_of_birth: profile.date_of_birth,
      origin_country_id: profile.origin_country_id,
      origin_city_id: profile.origin_city_id,
      residence_city_id: profile.residence_city_id,
      location_id: profile.location_id,
      mediaCount: fieldCatalog.mediaCount,
      taxonomyCount: fieldCatalog.taxonomyCount,
      hasPrimaryTalentType: fieldCatalog.hasPrimaryTalentType,
      requiredScalarFieldsTotal: fieldCatalog.requiredScalarTotal,
      requiredScalarFieldsComplete: fieldCatalog.requiredScalarComplete,
      recommendedScalarFieldsTotal: fieldCatalog.recommendedScalarTotal,
      recommendedScalarFieldsComplete: fieldCatalog.recommendedScalarComplete,
    }),
    [profile, fieldCatalog],
  );

  const completionScore = useMemo(
    () => calculateTalentCompletion(completionInput),
    [completionInput],
  );
  const checklist = useMemo(() => buildTalentChecklist(completionInput), [completionInput]);
  const missingItems = useMemo(() => checklist.filter((i) => !i.complete), [checklist]);
  const missingTop = useMemo(() => summarizeMissing(checklist), [checklist]);

  const previewHref = `/t/${profile.profile_code}${
    profile.workflow_status === "approved" && profile.visibility === "public" ? "" : "?preview=1"
  }`;

  const draftWorkflowOptimistic = useMemo(
    () =>
      profile.workflow_status === "draft" &&
      completionScore >= TALENT_SUBMISSION_THRESHOLD &&
      missingItems.length === 0,
    [profile.workflow_status, completionScore, missingItems.length],
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
    isTalentShortBioComplete(profile.short_bio) &&
    isTalentOriginComplete(profile);

  const hasTaxonomy = assignedIds.length > 0;

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

  const hasProfilePhoto = media.some((m) => m.variant_kind === "card");
  const hasCoverPhoto = media.some((m) => m.variant_kind === "banner");
  const galleryCount = media.filter((m) => m.variant_kind === "gallery").length;

  const groupsWithFields = useMemo(
    () =>
      fieldCatalog.groups.filter((g) => {
        const defs = fieldCatalog.editableByGroup.get(g.id) ?? [];
        return defs.length > 0;
      }),
    [fieldCatalog.groups, fieldCatalog.editableByGroup],
  );

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

      const taxonomyKinds = defs
        .filter((d) => d.value_type === "taxonomy_single" || d.value_type === "taxonomy_multi")
        .map((d) => d.taxonomy_kind)
        .filter((k): k is string => !!k);
      const requiredTaxonomyKinds = new Set(taxonomyKinds);
      const taxonomyComplete =
        requiredTaxonomyKinds.size === 0
          ? null
          : [...requiredTaxonomyKinds].every((k) => assignedKinds.has(k));

      const complete =
        (scalarComplete ?? true) && (taxonomyComplete ?? true) && defs.length > 0;

      const kindsSet = new Set(taxonomyKinds);
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
          : taxonomyKinds.length > 0
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
    if (!publicIdentityComplete || !hasTaxonomy) return false;
    for (const g of groupsWithFields) {
      const { complete } = groupChecklist(g.id);
      if (!complete) return false;
    }
    return true;
  }, [roadmapMode, publicIdentityComplete, hasTaxonomy, groupsWithFields, groupChecklist]);

  const mediaAllCompleteInFocus = useMemo(
    () => roadmapMode === "focus" && hasProfilePhoto && hasCoverPhoto && galleryCount > 0,
    [roadmapMode, hasProfilePhoto, hasCoverPhoto, galleryCount],
  );

  const openFromChecklistKey = useCallback(
    (key: string) => {
      if (key === "media") {
        router.push(`/admin/talent/${talentId}/media`, { scroll: false });
        return;
      }
      if (key === "taxonomy") {
        onOpenSheet("taxonomy");
        return;
      }
      if (key.startsWith("fields_")) {
        onOpenSheet("fieldValues");
        return;
      }
      onOpenSheet("publicProfile");
    },
    [onOpenSheet, router, talentId],
  );

  const openGroupSection = useCallback(
    (groupSlug: string) => {
      if (groupSlug === "basic_info") onOpenSheet("publicProfile");
      else onOpenSheet("fieldValues");
    },
    [onOpenSheet],
  );

  return (
    <section className="space-y-4 lg:space-y-5">
      <div
        className={cn(
          "overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-[var(--impronta-gold)]/[0.07] via-card to-card",
          "shadow-[0_12px_40px_-18px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.5)]",
          "sm:rounded-2xl lg:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.28)]",
        )}
      >
        <div className="p-4 sm:p-5 lg:p-8">
          <div className="lg:flex lg:items-start lg:justify-between lg:gap-10 xl:gap-14">
            <div className="flex min-w-0 flex-1 gap-3 lg:gap-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--impronta-gold)]/15 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/20 lg:h-14 lg:w-14 lg:rounded-3xl">
                <LayoutDashboard className="size-5 lg:size-6" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <h2 className="font-display text-base font-semibold tracking-tight text-foreground lg:text-xl">
                  {missingItems.length > 0 ? "Gaps to close" : "Profile checklist clear"}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground lg:text-base lg:leading-relaxed">
                  {missingItems.length > 0 ? (
                    <>
                      <span className="font-medium text-foreground">{missingItems.length}</span>
                      {missingItems.length === 1 ? " item" : " items"} still incomplete on the same
                      checklist talent sees. Open sections below or use Next view to focus what&apos;s left.
                    </>
                  ) : (
                    <>
                      Everything in the talent checklist is satisfied. Review workflow &amp; visibility on
                      the right when you&apos;re ready to publish or request changes.
                    </>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <Badge variant="outline" className="border-border/55 capitalize">
                    {accountProfile?.account_status ?? "—"}
                  </Badge>
                  <Badge variant="secondary" className="capitalize">
                    {accountProfile?.app_role ?? "—"}
                  </Badge>
                  <span className="text-muted-foreground/70">·</span>
                  <span className="font-mono text-[11px]">
                    Updated {profile.updated_at ? new Date(profile.updated_at).toLocaleString() : "—"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">{submissionSummaryBadge}</div>
              </div>
            </div>

            <div
              className={cn(
                "mt-4 space-y-3 lg:mt-0 lg:flex lg:min-w-[min(100%,20rem)] lg:max-w-md lg:flex-shrink-0 lg:flex-col lg:gap-3 xl:min-w-[22rem]",
                "lg:border-l lg:border-border/40 lg:pl-8 xl:pl-10",
              )}
            >
              <div className="flex flex-col gap-2.5 sm:grid sm:grid-cols-2 sm:gap-2.5 lg:flex lg:flex-col">
                <Button
                  variant="outline"
                  asChild
                  className={cn(
                    "h-12 w-full gap-2 rounded-2xl border-border/70 bg-background/70 px-4 text-[15px] font-medium backdrop-blur-sm sm:h-11 lg:h-12",
                    ADMIN_OUTLINE_CONTROL_CLASS,
                  )}
                >
                  <Link href={previewHref} target="_blank" rel="noreferrer" scroll={false}>
                    <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    Preview as public
                  </Link>
                </Button>
                <Button
                  type="button"
                  className={cn("h-12 w-full rounded-2xl sm:h-11 lg:h-12", LUXURY_GOLD_BUTTON_CLASS)}
                  onClick={() => onOpenSheet("workflow")}
                >
                  Workflow &amp; visibility
                </Button>
                {profile.user_id ? (
                  <Button variant="secondary" className="h-10 w-full rounded-xl shadow-sm sm:col-span-2" asChild>
                    <Link href={`/admin/talent/${talentId}/account`} scroll={false}>
                      Account &amp; login
                    </Link>
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 border-t border-border/40 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:border-t-0 lg:pt-0">
                {missingItems.length > 0 ? (
                  <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/[0.09] px-3.5 py-1.5 text-xs font-semibold text-amber-950 dark:text-amber-100">
                    <ListChecks className="size-3.5 shrink-0" aria-hidden />
                    {missingItems.length} to fix
                  </span>
                ) : (
                  <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                    Checklist done
                  </span>
                )}
                <span className="text-[13px] text-muted-foreground lg:text-sm">
                  {completionScore}% complete
                  <span className="text-muted-foreground/60"> · </span>
                  {TALENT_SUBMISSION_THRESHOLD}% is the usual submit bar for talent
                </span>
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
                  Next steps (staff)
                </p>
                <p className="mt-0.5 text-sm font-medium text-foreground lg:text-base">
                  Open the right editor for each gap
                </p>
              </div>
            </div>
            <p className="hidden text-xs text-muted-foreground lg:block lg:max-w-sm lg:text-right lg:text-[13px]">
              Same items as the talent checklist. Media opens the hub media workspace.
            </p>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            {missingTop.map((m) => {
              const ItemIcon = checklistItemIconForKey(m.key);
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
                  onClick={() => openFromChecklistKey(m.key)}
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
              +{missingItems.length - missingTop.length} more in Edit sections below
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2 lg:space-y-3">
        <div className="flex items-center justify-between gap-3">
          <TalentSectionLabel icon={Layers}>Edit sections</TalentSectionLabel>
          <div
            className="inline-flex w-fit shrink-0 rounded-2xl border border-border/50 bg-muted/30 p-1 sm:self-auto"
            role="tablist"
            aria-label="Roadmap view"
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
              Switch to Full to revisit any group, or jump to Media below for approvals and ordering.
            </p>
          </div>
        ) : (
          <>
            <AdminRoadmapMotionRow
              id="admin-section-public"
              show={roadmapMode === "full" || !publicIdentityComplete}
              staggerIndex={0}
            >
              <TalentRoadmapSectionButton
                title="Public Identity"
                subtitle={[
                  profile.display_name?.trim() || "No name",
                  hasLocation ? "Lives in set" : "No city selected",
                ].join(" · ")}
                complete={publicIdentityComplete}
                onClick={() => onOpenSheet("publicProfile")}
              />
            </AdminRoadmapMotionRow>

            <AdminRoadmapMotionRow
              id="admin-section-categories"
              show={roadmapMode === "full" || !hasTaxonomy}
              staggerIndex={1}
            >
              <TalentRoadmapSectionButton
                title="Categories & Tags"
                subtitle={
                  hasTaxonomy
                    ? `${assignedIds.length} tag${assignedIds.length === 1 ? "" : "s"} assigned`
                    : "No tags assigned yet"
                }
                complete={hasTaxonomy}
                onClick={() => onOpenSheet("taxonomy")}
              />
            </AdminRoadmapMotionRow>

            {groupsWithFields.map((g, gi) => {
              const { complete: groupComplete, subtitle, defsCount } = groupChecklist(g.id);
              const staggerIndex = 2 + gi;
              return (
                <AdminRoadmapMotionRow
                  key={g.id}
                  id={`admin-section-group-${g.id}`}
                  show={roadmapMode === "full" || !groupComplete}
                  staggerIndex={staggerIndex}
                >
                  <TalentRoadmapSectionButton
                    title={pickLabel(g.name_en, g.name_es)}
                    subtitle={subtitle}
                    complete={groupComplete}
                    fieldCount={defsCount}
                    onClick={() => openGroupSection(g.slug)}
                  />
                </AdminRoadmapMotionRow>
              );
            })}
          </>
        )}
      </div>

      <div className="space-y-2 lg:space-y-3">
        <TalentSectionLabel icon={Images}>Media</TalentSectionLabel>
        {mediaAllCompleteInFocus ? (
          <div className="rounded-2xl border border-dashed border-emerald-500/35 bg-emerald-500/[0.06] px-4 py-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2 font-medium text-emerald-900 dark:text-emerald-100">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              Media checklist is complete in this view
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              Full roadmap still lists each slot — open the workspace for approvals, primary star, and order.
            </p>
          </div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-3 lg:gap-3">
            <AdminRoadmapMotionRow
              id="admin-media-profile"
              show={roadmapMode === "full" || !hasProfilePhoto}
              staggerIndex={2 + groupsWithFields.length}
            >
              <TalentRoadmapMediaCard
                href={`/admin/talent/${talentId}/media`}
                icon={UserCircle}
                title="Profile photo"
                subtitle={hasProfilePhoto ? "Asset present" : "Not set"}
                complete={hasProfilePhoto}
              />
            </AdminRoadmapMotionRow>
            <AdminRoadmapMotionRow
              id="admin-media-cover"
              show={roadmapMode === "full" || !hasCoverPhoto}
              staggerIndex={3 + groupsWithFields.length}
            >
              <TalentRoadmapMediaCard
                href={`/admin/talent/${talentId}/media`}
                icon={ImageIcon}
                title="Cover / banner"
                subtitle={hasCoverPhoto ? "Asset present" : "Not set"}
                complete={hasCoverPhoto}
              />
            </AdminRoadmapMotionRow>
            <AdminRoadmapMotionRow
              id="admin-media-portfolio"
              show={roadmapMode === "full" || galleryCount === 0}
              staggerIndex={4 + groupsWithFields.length}
            >
              <TalentRoadmapMediaCard
                href={`/admin/talent/${talentId}/media`}
                icon={Camera}
                title="Portfolio"
                subtitle={`${galleryCount} image${galleryCount === 1 ? "" : "s"}`}
                complete={galleryCount > 0}
              />
            </AdminRoadmapMotionRow>
          </div>
        )}
      </div>

      <div className="space-y-2 lg:space-y-3">
        <TalentSectionLabel icon={Send}>Agency review</TalentSectionLabel>
        <button
          type="button"
          onClick={() => onOpenSheet("workflow")}
          className={cn(
            "group flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all duration-200",
            "border-border/40 bg-card/80 shadow-sm",
            "lg:px-5 lg:py-5",
            "hover:border-[var(--impronta-gold)]/45 hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-md",
            "active:scale-[0.99] motion-reduce:active:scale-100",
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--impronta-gold)]/12 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/25 lg:size-11">
            <Star className="size-5 fill-[var(--impronta-gold)]/25" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-tight text-foreground">Workflow &amp; visibility</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Approve, hide, feature, and archive — mirrors what talent sees after submission.
            </p>
          </div>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--impronta-gold)]/80"
            aria-hidden
          />
        </button>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-border/40 bg-muted/10 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>Public preview may hide internal-only fields. Use Edit sections and Field values for the full record.</span>
      </p>
    </section>
  );
}
