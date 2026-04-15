"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  Globe2,
  Images,
  ListChecks,
  MapPin,
  Phone,
  Send,
  Star,
  Tags,
  UserCircle,
  Users,
  Camera,
  ImageIcon,
  AlertCircle,
  Layers,
  MessageSquareText,
  Sparkles,
  Focus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  TalentDashboardPage,
  TalentHeroCompletionRing,
  TalentSectionLabel,
} from "@/components/talent/talent-dashboard-primitives";
import { TalentEditPanel } from "@/components/talent/talent-edit-panel";
import { HelpTip } from "@/components/ui/help-tip";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  TalentProfileForm,
  TalentSubmitForReviewForm,
  TALENT_PUBLIC_PROFILE_FORM_ID,
  TALENT_SUBMIT_FOR_REVIEW_FORM_ID,
} from "@/app/(dashboard)/talent/talent-forms";
import { TalentTaxonomyEditor } from "@/app/(dashboard)/talent/talent-taxonomy-editor";
import {
  TalentFieldValuesEditor,
  TALENT_SCALAR_FIELD_FORM_ID,
} from "@/app/(dashboard)/talent/talent-field-values-editor";
import { BasicInfoExtraScalarFieldsTalent } from "@/components/profile/basic-info-extra-scalar-fields";
import type {
  TalentDashboardData,
  TalentEditableTaxonomyField,
  TalentTaxonomyTermOption,
} from "@/lib/talent-dashboard-data";
import { isScalarFieldFilled } from "@/lib/profile-completion";
import {
  isTalentOriginComplete,
  isTalentShortBioComplete,
  TALENT_SUBMISSION_THRESHOLD,
  workflowGuidance,
} from "@/lib/talent-dashboard";
import { cn } from "@/lib/utils";
import type { CitySuggestion, CountrySuggestion } from "@/lib/location-autocomplete";

type TaxonomyData = {
  talentProfileId: string;
  allTerms: TalentTaxonomyTermOption[];
  assignedIds: string[];
  primaryTalentTypeId: string | null;
  editableFields: TalentEditableTaxonomyField[];
};

type Props = {
  dashboard: TalentDashboardData;
  taxonomy: TaxonomyData | null;
  initialResidence: { country: CountrySuggestion | null; city: CitySuggestion | null };
  initialOrigin: { country: CountrySuggestion | null; city: CitySuggestion | null };
  talentProfileId: string;
  fieldCatalog: TalentDashboardData["fieldCatalog"];
  fieldValues: TalentDashboardData["fieldValues"];
};

function pickLabel(en: string, es?: string | null): string {
  return (es?.trim() || en).trim();
}

type PanelId = "publicProfile" | "categories" | "attributes" | "review" | null;

function checklistItemIcon(key: string): LucideIcon {
  switch (key) {
    case "display_name":
    case "first_name":
    case "last_name":
      return UserCircle;
    case "phone":
      return Phone;
    case "gender":
      return Users;
    case "date_of_birth":
      return Calendar;
    case "origin":
      return Globe2;
    case "location":
      return MapPin;
    case "short_bio":
      return FileText;
    case "taxonomy":
      return Tags;
    case "media":
      return Images;
    case "fields_required":
    case "fields_recommended":
      return ClipboardList;
    default:
      return CircleDot;
  }
}

/* ──────────────────── Section Card ──────────────────── */

function SectionCard({
  title,
  subtitle,
  complete,
  fieldCount,
  onClick,
}: {
  title: string;
  subtitle?: string;
  complete?: boolean;
  fieldCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-3xl border px-4 py-4 text-left transition-all duration-200",
        "border-border/45 bg-card/85 shadow-[0_10px_36px_-22px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_-24px_rgba(0,0,0,0.45)]",
        "lg:px-5 lg:py-[1.125rem]",
        "hover:border-[var(--impronta-gold)]/40 hover:bg-[var(--impronta-gold)]/[0.05] hover:shadow-[0_16px_44px_-26px_rgba(201,162,39,0.18)]",
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
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
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

/* ──────────────────── Media Nav Card ──────────────────── */

function MediaNavCard({
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
      className={cn(
        "group flex items-center gap-3 rounded-3xl border px-4 py-4 transition-all duration-200",
        "border-border/45 bg-card/85 shadow-[0_10px_36px_-22px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_-24px_rgba(0,0,0,0.45)]",
        "lg:px-5 lg:py-[1.125rem]",
        "hover:border-[var(--impronta-gold)]/40 hover:bg-[var(--impronta-gold)]/[0.05] hover:shadow-[0_16px_44px_-26px_rgba(201,162,39,0.18)]",
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

const ROADMAP_MODE_KEY = "impronta_talent_roadmap_mode";

const luxuryGoldButton =
  "relative overflow-hidden bg-[var(--impronta-gold)] text-white shadow-md shadow-black/10 " +
  "hover:bg-[var(--impronta-gold)]/92 hover:shadow-[0_14px_32px_-18px_rgba(201,162,39,0.55)] " +
  "focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/35 " +
  "after:pointer-events-none after:absolute after:inset-0 after:opacity-0 after:transition-opacity after:duration-200 " +
  "after:bg-[linear-gradient(115deg,transparent,rgba(255,255,255,0.18),transparent)] " +
  "after:bg-[length:220%_100%] after:bg-[position:110%_0] hover:after:opacity-100 hover:after:bg-[position:-10%_0] " +
  "after:transition-[background-position,opacity] after:duration-700 after:ease-out " +
  "motion-reduce:after:transition-none disabled:opacity-60";

function SheetHeading({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "-mx-5 -mt-5 border-b border-border/40 bg-card/55 px-5 pt-5 pb-3 backdrop-blur-md dark:bg-zinc-900/70",
        "lg:-mx-6 lg:px-6 lg:pt-6",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-foreground/70">{description}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0 pt-0.5">{right}</div> : null}
      </div>
    </div>
  );
}

function RoadmapMotionRow({
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

/* ──────────────────── Main Component ──────────────────── */

export function TalentMyProfileClient({
  dashboard,
  taxonomy,
  initialResidence,
  initialOrigin,
  talentProfileId,
  fieldCatalog,
  fieldValues,
}: Props) {
  const {
    profile,
    completionScore,
    missingItems,
    livePageAvailable,
    previewHref,
    canSubmit,
    latestTermsConsent,
    talentTermsVersion,
  } = dashboard;

  const submitUnlocked = completionScore >= TALENT_SUBMISSION_THRESHOLD;

  const router = useRouter();
  const searchParams = useSearchParams();
  const groupFromUrl = searchParams.get("group");

  const [openPanel, setOpenPanel] = useState<PanelId>(null);
  const [dirtySheets, setDirtySheets] = useState<Record<string, boolean>>({});
  const [attributesGroupSlug, setAttributesGroupSlug] = useState<string | null>(null);

  const [roadmapMode, setRoadmapMode] = useState<"full" | "focus">("full");

  useEffect(() => {
    try {
      const v = sessionStorage.getItem(ROADMAP_MODE_KEY);
      if (v === "focus" || v === "full") setRoadmapMode(v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(ROADMAP_MODE_KEY, roadmapMode);
    } catch {
      /* ignore */
    }
  }, [roadmapMode]);

  // Deep-link: basic_info → public identity (canonical + extra basic fields); other groups → attributes
  useEffect(() => {
    if (!groupFromUrl) return;
    if (groupFromUrl === "basic_info") {
      router.replace("/talent/my-profile", { scroll: false });
      setOpenPanel("publicProfile");
      return;
    }
    setAttributesGroupSlug(groupFromUrl);
    setOpenPanel("attributes");
  }, [groupFromUrl, router]);

  useEffect(() => {
    const next = groupFromUrl?.trim() || null;
    setAttributesGroupSlug((prev) => (prev === next ? prev : next));
  }, [groupFromUrl]);

  const clearGroupQuery = useCallback(() => {
    router.replace("/talent/my-profile", { scroll: false });
  }, [router]);

  const openAttributesForGroup = useCallback(
    (slug: string) => {
      setAttributesGroupSlug(slug);
      router.replace(`/talent/my-profile?group=${encodeURIComponent(slug)}`, { scroll: false });
      setOpenPanel("attributes");
    },
    [router],
  );

  const openPanelSafe = useCallback(
    (p: NonNullable<PanelId>) => {
      if (p !== "attributes" && groupFromUrl) clearGroupQuery();
      setOpenPanel(p);
    },
    [clearGroupQuery, groupFromUrl],
  );

  const handlePanelClose = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) return;
      const key = openPanel ?? "";
      if (key && dirtySheets[key]) {
        if (!window.confirm("You have unsaved changes. Close anyway?")) return;
      }
      if (openPanel === "attributes" && groupFromUrl) clearGroupQuery();
      setOpenPanel(null);
    },
    [openPanel, dirtySheets, groupFromUrl, clearGroupQuery],
  );

  const setPublicProfileDirty = useCallback((dirty: boolean) => {
    setDirtySheets((s) => (s.publicProfile === dirty ? s : { ...s, publicProfile: dirty }));
  }, []);

  const [publicProfileSavePending, setPublicProfileSavePending] = useState(false);
  const setAttributesDirty = useCallback((dirty: boolean) => {
    setDirtySheets((s) => (s.attributes === dirty ? s : { ...s, attributes: dirty }));
  }, []);

  const [attributesSavePending, setAttributesSavePending] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);

  useEffect(() => {
    if (openPanel !== "review") {
      setReviewPending(false);
      setReviewReady(false);
    }
  }, [openPanel]);

  const missingTop = useMemo(() => missingItems.slice(0, 4), [missingItems]);

  /** Matches optimistic draft copy in `workflowGuidance` (score ≥ threshold, no checklist gaps). */
  const draftWorkflowOptimistic = useMemo(
    () =>
      profile.workflow_status === "draft" &&
      completionScore >= TALENT_SUBMISSION_THRESHOLD &&
      missingItems.length === 0,
    [profile.workflow_status, completionScore, missingItems.length],
  );

  const focusedGroupLabel = useMemo(() => {
    const s = attributesGroupSlug?.trim();
    if (!s) return null;
    const g = fieldCatalog.groups.find((x) => x.slug === s);
    return g ? pickLabel(g.name_en, g.name_es) : null;
  }, [attributesGroupSlug, fieldCatalog.groups]);

  const basicInfoGroup = useMemo(
    () => fieldCatalog.groups.find((g) => g.slug === "basic_info"),
    [fieldCatalog.groups],
  );
  const basicInfoExtraDefinitions = useMemo(() => {
    if (!basicInfoGroup) return [];
    return fieldCatalog.editableByGroup.get(basicInfoGroup.id) ?? [];
  }, [basicInfoGroup, fieldCatalog.editableByGroup]);

  const groupsWithFields = useMemo(
    () =>
      fieldCatalog.groups.filter((g) => {
        const defs = fieldCatalog.editableByGroup.get(g.id) ?? [];
        return defs.length > 0;
      }),
    [fieldCatalog.groups, fieldCatalog.editableByGroup],
  );

  // Determine completeness per section (keep in sync with talent-dashboard checklist)
  const hasDisplayName = !!profile.display_name?.trim();
  const hasLocation = !!(profile.residence_city_id ?? profile.location_id);
  const hasPhone = !!(profile as { phone?: string | null }).phone?.trim();
  const hasFirstName = !!profile.first_name?.trim();
  const hasLastName = !!profile.last_name?.trim();
  const hasGender = !!(profile as { gender?: string | null }).gender?.trim();
  const hasDob = !!(profile as { date_of_birth?: string | null }).date_of_birth?.trim();
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
  const hasTaxonomy = (taxonomy?.assignedIds.length ?? 0) > 0;

  const termKindById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of taxonomy?.allTerms ?? []) map.set(t.id, t.kind);
    return map;
  }, [taxonomy?.allTerms]);

  const assignedKinds = useMemo(() => {
    const out = new Set<string>();
    for (const id of taxonomy?.assignedIds ?? []) {
      const k = termKindById.get(id);
      if (k) out.add(k);
    }
    return out;
  }, [taxonomy?.assignedIds, termKindById]);

  // Media completeness from the media array
  const cardMedia = dashboard.media.find((m) => m.variant_kind === "card");
  const hasProfilePhoto = Boolean(cardMedia);
  const profilePhotoUrl = cardMedia?.publicUrl ?? null;
  const hasCoverPhoto = dashboard.media.some((m) => m.variant_kind === "banner");
  const galleryCount = dashboard.media.filter((m) => m.variant_kind === "gallery").length;

  const talentFirstName = (profile.first_name?.trim() ?? profile.display_name?.trim() ?? "").split(/\s+/)[0] ?? "";

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

      const taxonomyKeys = defs
        .filter((d) => d.value_type === "taxonomy_single" || d.value_type === "taxonomy_multi")
        .map((d) => d.key);
      const taxonomyKinds = taxonomyKeys
        .map((k) => taxonomy?.editableFields.find((f) => f.key === k)?.taxonomy_kind ?? null)
        .filter((k): k is string => !!k);
      const requiredTaxonomyKinds = new Set(taxonomyKinds);
      const taxonomyComplete =
        requiredTaxonomyKinds.size === 0
          ? null
          : [...requiredTaxonomyKinds].every((k) => assignedKinds.has(k));

      const complete =
        (scalarComplete ?? true) &&
        (taxonomyComplete ?? true) &&
        defs.length > 0;

      const kindsSet = new Set(taxonomyKinds);
      const selectedInGroup =
        kindsSet.size === 0
          ? 0
          : (taxonomy?.assignedIds ?? []).filter((id) => {
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
    [
      fieldCatalog.editableByGroup,
      fieldValues,
      taxonomy?.assignedIds,
      taxonomy?.editableFields,
      assignedKinds,
      termKindById,
    ],
  );

  const editSectionsAllCompleteInFocus = useMemo(() => {
    if (roadmapMode !== "focus") return false;
    if (!publicIdentityComplete || !hasTaxonomy) return false;
    for (const g of groupsWithFields) {
      const { complete } = groupChecklist(g.id);
      if (!complete) return false;
    }
    return true;
  }, [
    roadmapMode,
    publicIdentityComplete,
    hasTaxonomy,
    groupsWithFields,
    groupChecklist,
  ]);

  const mediaAllCompleteInFocus = useMemo(
    () =>
      roadmapMode === "focus" &&
      hasProfilePhoto &&
      hasCoverPhoto &&
      galleryCount > 0,
    [roadmapMode, hasProfilePhoto, hasCoverPhoto, galleryCount],
  );

  return (
    <TalentDashboardPage>
      {/* Post-onboarding status banners — shown only for terminal / action-needed states */}
      {profile.workflow_status === "approved" && livePageAvailable ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3.5 dark:bg-emerald-500/[0.05]">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Your profile is live</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Visible in the public directory — share your link with clients or collaborators.
            </p>
          </div>
          <Link
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300"
          >
            View live profile →
          </Link>
        </div>
      ) : profile.workflow_status === "submitted" || profile.workflow_status === "under_review" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.04] px-4 py-3.5">
          <Clock className="size-5 shrink-0 text-primary/60" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {profile.workflow_status === "submitted" ? "Submitted — awaiting review" : "Under agency review"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nothing to do right now. The agency will reach out if they need anything.
            </p>
          </div>
        </div>
      ) : null}

      {/* Action hub: stacked on mobile; narrative + CTA column on large screens */}
      <section className="space-y-4 lg:space-y-5">
        <div
          className={cn(
            "overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-[var(--impronta-gold)]/[0.09] via-card to-card",
            "shadow-[0_20px_56px_-28px_rgba(0,0,0,0.2)] ring-1 ring-[var(--impronta-gold)]/[0.08]",
            "dark:shadow-[0_24px_60px_-28px_rgba(0,0,0,0.55)] dark:from-[var(--impronta-gold)]/[0.12]",
          )}
        >
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_min(100%,20rem)] lg:items-start xl:gap-10">
              <div className="grid min-w-0 grid-cols-1 items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-6 lg:gap-8">
                <div className="flex flex-col items-center gap-3 sm:items-start">
                  {profilePhotoUrl ? (
                    <UserAvatar
                      src={profilePhotoUrl}
                      name={profile.display_name}
                      size="lg"
                      rounded="xl"
                      className="size-20 sm:size-[4.5rem]"
                    />
                  ) : null}
                  <TalentHeroCompletionRing value={completionScore} />
                </div>
                <div className="min-w-0 space-y-2 text-center sm:text-left">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Profile status
                  </p>
                  <h2
                    className={cn(
                      "font-display font-semibold tracking-tight text-foreground",
                      missingItems.length === 0
                        ? "text-xl uppercase tracking-[0.06em] sm:text-2xl lg:text-[1.65rem] lg:leading-tight"
                        : "text-lg sm:text-xl",
                    )}
                  >
                    {talentFirstName ? `${talentFirstName} — ` : ""}
                    {missingItems.length > 0 ? "finish your profile" : "you’re in good shape"}
                  </h2>
                  <p className="text-pretty text-sm leading-relaxed text-muted-foreground lg:text-base lg:leading-relaxed">
                    {missingItems.length > 0 ? (
                      <>
                        <span className="font-medium text-foreground">{missingItems.length}</span>
                        {missingItems.length === 1 ? " task left" : " tasks left"} before submission.
                        {" "}
                        Preview anytime to see how you&apos;ll look live.
                      </>
                    ) : (
                      <>Checklist is complete — submit when you&apos;re ready for the agency to review.</>
                    )}
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "flex min-w-0 flex-col gap-3 border-t border-border/40 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 xl:pl-10",
                )}
              >
                <div
                  className={cn(
                    "flex flex-col gap-2.5",
                    canSubmit && "sm:grid sm:grid-cols-2 sm:gap-2.5 lg:flex lg:flex-col",
                    !canSubmit && "sm:max-w-md lg:max-w-none",
                  )}
                >
                  {canSubmit ? (
                    <Button
                      type="button"
                      className={cn(
                        "h-12 w-full gap-2 rounded-2xl px-4 text-[15px] font-semibold text-white sm:h-11 lg:h-12 lg:text-[15px]",
                        luxuryGoldButton,
                      )}
                      onClick={() => openPanelSafe("review")}
                    >
                      <Send className="size-4 shrink-0" aria-hidden />
                      Submit for review
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    asChild
                    className="h-12 w-full gap-2 rounded-2xl border-border/60 bg-background/80 px-4 text-[15px] font-medium shadow-sm backdrop-blur-sm transition hover:border-[var(--impronta-gold)]/35 hover:bg-background sm:h-11 lg:h-12"
                  >
                    <Link href={previewHref} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      {livePageAvailable ? "View live profile" : "Preview how it looks"}
                    </Link>
                  </Button>
                </div>

                <div className="flex flex-col gap-2.5 border-t border-border/40 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:border-t-0 lg:pt-0">
                  {missingItems.length > 0 ? (
                    <span className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-500/35 bg-amber-500/[0.1] px-3.5 py-1.5 text-xs font-semibold text-amber-950 shadow-sm sm:w-fit sm:justify-start dark:text-amber-50">
                      <ListChecks className="size-3.5 shrink-0" aria-hidden />
                      {missingItems.length} to complete
                    </span>
                  ) : (
                    <span className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-500/[0.12] px-3.5 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm sm:w-fit sm:justify-start dark:text-emerald-50">
                      <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                      Checklist done
                    </span>
                  )}
                  <p className="text-center text-[13px] text-muted-foreground sm:text-left lg:text-sm">
                    <span className="tabular-nums font-medium text-foreground/90">{completionScore}%</span>{" "}
                    complete
                    {!submitUnlocked ? (
                      <>
                        <span className="text-muted-foreground/60"> · </span>
                        <span className="tabular-nums">{TALENT_SUBMISSION_THRESHOLD}%</span> unlocks submit
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3.5 rounded-3xl border border-border/50 bg-gradient-to-br from-muted/45 via-muted/25 to-[var(--impronta-gold)]/[0.04] px-4 py-3.5 shadow-[0_12px_36px_-28px_rgba(0,0,0,0.12)] lg:gap-4 lg:px-6 lg:py-4 dark:shadow-[0_12px_36px_-28px_rgba(0,0,0,0.4)]">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-2xl ring-1 lg:size-11",
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
          <p className="min-w-0 flex-1 text-pretty text-sm leading-relaxed text-muted-foreground lg:text-base lg:leading-relaxed">
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
                    <span className="lg:hidden">Tap a card to fix it</span>
                    <span className="hidden lg:inline">Click a card to open the right editor</span>
                  </p>
                </div>
              </div>
              <p className="hidden text-xs text-muted-foreground lg:block lg:max-w-sm lg:text-right lg:text-[13px]">
                Opens the panel for that checklist item — your work saves with the rest of your profile.
              </p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              {missingTop.map((m) => {
                const ItemIcon = checklistItemIcon(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-3xl border border-border/55 bg-card/90 px-3.5 py-3.5 text-left shadow-[0_8px_28px_-20px_rgba(0,0,0,0.12)]",
                      "lg:min-h-[5.25rem] lg:px-4 lg:py-4",
                      "transition-all duration-150 hover:border-[var(--impronta-gold)]/35 hover:bg-[var(--impronta-gold)]/[0.04] lg:hover:shadow-[0_14px_40px_-24px_rgba(201,162,39,0.2)]",
                      "active:scale-[0.99] motion-reduce:active:scale-100",
                    )}
                    onClick={() => {
                      if (m.key === "media") {
                        router.push("/talent/portfolio", { scroll: false });
                        return;
                      }
                      if (m.key === "taxonomy") openPanelSafe("categories");
                      else if (m.key.startsWith("fields_")) {
                        clearGroupQuery();
                        openPanelSafe("attributes");
                      } else openPanelSafe("publicProfile");
                    }}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-foreground/90 ring-1 ring-border/50 dark:bg-muted/30 lg:size-11">
                      <ItemIcon className="size-[18px] lg:size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-foreground">{m.label}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{m.description}</p>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/45 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </button>
                );
              })}
            </div>
            {missingItems.length > missingTop.length ? (
              <p className="px-1 text-xs text-muted-foreground">
                +{missingItems.length - missingTop.length} more in your checklist below
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Roadmap toggle + section cards */}
      <div className="space-y-2 lg:space-y-3">
        <div className="flex items-center justify-between gap-3">
          <TalentSectionLabel icon={Layers}>Edit sections</TalentSectionLabel>
          <div
            className="inline-flex w-fit shrink-0 rounded-2xl border border-border/50 bg-muted/35 p-1 shadow-sm ring-1 ring-[var(--impronta-gold)]/[0.06] sm:self-auto"
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
                  ? "bg-background text-foreground shadow-md ring-1 ring-[var(--impronta-gold)]/15"
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
                  ? "bg-background text-foreground shadow-md ring-1 ring-[var(--impronta-gold)]/15"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Focus className="size-4" aria-hidden />
              Next
            </button>
          </div>
        </div>

        {editSectionsAllCompleteInFocus ? (
          <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-dashed border-emerald-500/35 bg-emerald-500/[0.06] px-4 py-4 text-sm text-muted-foreground"
          >
            <span className="inline-flex items-center gap-2 font-medium text-emerald-900 dark:text-emerald-100">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              All edit sections are done in this view
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              Switch to Full roadmap to revisit any section, or continue to Media and Submission below.
            </p>
          </motion.div>
        ) : (
          <>
            <RoadmapMotionRow
              id="section-public"
              show={roadmapMode === "full" || !publicIdentityComplete}
              staggerIndex={0}
            >
              <SectionCard
                title="Public Identity"
                subtitle={[
                  profile.display_name?.trim() || "No name",
                  hasLocation ? "Lives in set" : "No city selected",
                ].join(" · ")}
                complete={publicIdentityComplete}
                onClick={() => openPanelSafe("publicProfile")}
              />
            </RoadmapMotionRow>

            <RoadmapMotionRow
              id="section-categories"
              show={roadmapMode === "full" || !hasTaxonomy}
              staggerIndex={1}
            >
              <SectionCard
                title="Categories & Tags"
                subtitle={
                  hasTaxonomy
                    ? `${taxonomy!.assignedIds.length} tag${taxonomy!.assignedIds.length === 1 ? "" : "s"} assigned`
                    : "No tags assigned yet"
                }
                complete={hasTaxonomy}
                onClick={() => openPanelSafe("categories")}
              />
            </RoadmapMotionRow>

            {groupsWithFields.map((g, gi) => {
              const { complete: groupComplete, subtitle, defsCount } = groupChecklist(g.id);
              const staggerIndex = 2 + gi;
              return (
                <RoadmapMotionRow
                  key={g.id}
                  id={`section-group-${g.id}`}
                  show={roadmapMode === "full" || !groupComplete}
                  staggerIndex={staggerIndex}
                >
                  <SectionCard
                    title={pickLabel(g.name_en, g.name_es)}
                    subtitle={subtitle}
                    complete={groupComplete}
                    fieldCount={defsCount}
                    onClick={() => {
                      if (g.slug === "basic_info") openPanelSafe("publicProfile");
                      else openAttributesForGroup(g.slug);
                    }}
                  />
                </RoadmapMotionRow>
              );
            })}
          </>
        )}
      </div>

      {/* Media cards — individual items for each media type */}
      <div className="space-y-2 lg:space-y-3">
        <TalentSectionLabel icon={Images}>Media</TalentSectionLabel>
        {mediaAllCompleteInFocus ? (
          <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-dashed border-emerald-500/35 bg-emerald-500/[0.06] px-4 py-4 text-sm text-muted-foreground"
          >
            <span className="inline-flex items-center gap-2 font-medium text-emerald-900 dark:text-emerald-100">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              Media checklist is complete in this view
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              Full roadmap shows profile, cover, and portfolio cards — or open Submission when you&apos;re ready.
            </p>
          </motion.div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-3 lg:gap-3">
            <RoadmapMotionRow
              id="media-profile"
              show={roadmapMode === "full" || !hasProfilePhoto}
              staggerIndex={2 + groupsWithFields.length}
            >
              <MediaNavCard
                href="/talent/portfolio?tab=profile-photo"
                icon={UserCircle}
                title="Profile Photo"
                subtitle={hasProfilePhoto ? "Uploaded" : "Not set"}
                complete={hasProfilePhoto}
              />
            </RoadmapMotionRow>
            <RoadmapMotionRow
              id="media-cover"
              show={roadmapMode === "full" || !hasCoverPhoto}
              staggerIndex={3 + groupsWithFields.length}
            >
              <MediaNavCard
                href="/talent/portfolio?tab=cover"
                icon={ImageIcon}
                title="Cover Photo"
                subtitle={hasCoverPhoto ? "Uploaded" : "Not set"}
                complete={hasCoverPhoto}
              />
            </RoadmapMotionRow>
            <RoadmapMotionRow
              id="media-portfolio"
              show={roadmapMode === "full" || galleryCount === 0}
              staggerIndex={4 + groupsWithFields.length}
            >
              <MediaNavCard
                href="/talent/portfolio?tab=portfolio"
                icon={Camera}
                title="Portfolio"
                subtitle={`${galleryCount} image${galleryCount === 1 ? "" : "s"}`}
                complete={galleryCount > 0}
              />
            </RoadmapMotionRow>
          </div>
        )}
      </div>

      {/* Review & submission card */}
      <div className="space-y-2 lg:space-y-3">
        <TalentSectionLabel icon={Send}>Submission</TalentSectionLabel>
        <button
          type="button"
          onClick={() => openPanelSafe("review")}
          className={cn(
            "group flex w-full items-center gap-3 rounded-3xl border px-4 py-4 text-left transition-all duration-200",
            "border-[var(--impronta-gold)]/25 bg-gradient-to-br from-[var(--impronta-gold)]/[0.08] via-card to-card shadow-[0_14px_44px_-28px_rgba(201,162,39,0.35)]",
            "lg:px-5 lg:py-5",
            "hover:border-[var(--impronta-gold)]/40 hover:from-[var(--impronta-gold)]/[0.11] hover:shadow-[0_18px_48px_-26px_rgba(201,162,39,0.42)]",
            "active:scale-[0.99] motion-reduce:active:scale-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/35",
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--impronta-gold)]/15 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/30 lg:size-11">
            <Star className="size-5 fill-[var(--impronta-gold)]/30" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-tight text-foreground">Review & Submit</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {canSubmit ? "Ready to submit for agency review" : "Complete your profile to unlock submission"}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--impronta-gold)]/80" />
        </button>
      </div>

      {/* ─── Edit Panels ─── */}
      <TalentEditPanel
        open={openPanel === "publicProfile"}
        onOpenChange={handlePanelClose}
        title="Public Identity"
        description="Canonical profile fields first; additional Basic Information fields from your agency appear below."
        bottomBar={
          <div className="flex w-full gap-3">
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-11 rounded-2xl border-border/60 bg-muted/30 text-[15px] font-semibold text-foreground shadow-sm hover:bg-muted/40",
                  dirtySheets.publicProfile ? "min-w-0 flex-1" : "w-full",
                )}
              >
                Done
              </Button>
            </DialogPrimitive.Close>
            {dirtySheets.publicProfile ? (
              <Button
                type="submit"
                form={TALENT_PUBLIC_PROFILE_FORM_ID}
                disabled={publicProfileSavePending}
                className={cn(
                  "h-11 min-w-0 flex-1 rounded-2xl text-[15px] font-semibold",
                  luxuryGoldButton,
                )}
              >
                {publicProfileSavePending ? "Saving…" : "Save for later"}
              </Button>
            ) : null}
          </div>
        }
      >
        <SheetHeading
          title="Public Identity"
          description="Canonical profile fields first; additional Basic Information fields from your agency appear below."
        />
        <div className="space-y-2">
          <TalentProfileForm
            profileCode={profile.profile_code}
            initial={{
              display_name: profile.display_name,
              first_name: profile.first_name,
              last_name: profile.last_name,
              short_bio: profile.short_bio,
              phone: (profile as { phone?: string | null }).phone ?? null,
              gender: (profile as { gender?: string | null }).gender ?? null,
              date_of_birth: (profile as { date_of_birth?: string | null }).date_of_birth ?? null,
              residence_city_id: profile.residence_city_id ?? profile.location_id,
              origin_city_id: profile.origin_city_id,
            }}
            initialResidence={initialResidence}
            initialOrigin={initialOrigin}
            onDirtyChange={setPublicProfileDirty}
            onPendingChange={setPublicProfileSavePending}
          />
          <BasicInfoExtraScalarFieldsTalent
            talentProfileId={talentProfileId}
            definitions={basicInfoExtraDefinitions}
            fieldValues={fieldValues}
            onDirtyChange={(dirty) => {
              if (dirty) setPublicProfileDirty(true);
            }}
          />
        </div>
      </TalentEditPanel>

      <TalentEditPanel
        open={openPanel === "categories"}
        onOpenChange={handlePanelClose}
        title="Categories & Tags"
        description="Open a group, tap tags to add or remove. Updates save right away."
        titleExtra={
          <HelpTip content="Tags control how you appear in search and on your public profile. Choosing a talent type sets your primary category for listings." />
        }
        bottomBar={
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-2xl border-border/60 bg-muted/30 text-[15px] font-semibold text-foreground shadow-sm hover:bg-muted/40"
            >
              Done
            </Button>
          </DialogPrimitive.Close>
        }
      >
        <SheetHeading
          title="Categories & Tags"
          description="Open a group, tap tags to add or remove. Updates save right away."
          right={
            <HelpTip content="Tags control how you appear in search and on your public profile. Choosing a talent type sets your primary category for listings." />
          }
        />
        {taxonomy ? (
          <TalentTaxonomyEditor
            variant="sheet"
            sheetOpen={openPanel === "categories"}
            allTerms={taxonomy.allTerms}
            assignedIds={taxonomy.assignedIds}
            primaryTalentTypeId={taxonomy.primaryTalentTypeId}
            editableFields={taxonomy.editableFields}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Tags could not be loaded. Refresh and try again.
          </p>
        )}
      </TalentEditPanel>

      <TalentEditPanel
        open={openPanel === "attributes"}
        onOpenChange={handlePanelClose}
        title={focusedGroupLabel ?? "Profile Fields"}
        description={
          focusedGroupLabel
            ? "Editing this section only. Changes still save with the rest of your profile data."
            : "Fields are governed by the agency. Labels show what's required."
        }
        bottomBar={
          <div className="flex w-full gap-3">
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-11 rounded-2xl border-border/60 bg-muted/30 text-[15px] font-semibold text-foreground shadow-sm hover:bg-muted/40",
                  dirtySheets.attributes ? "min-w-0 flex-1" : "w-full",
                )}
              >
                Done
              </Button>
            </DialogPrimitive.Close>
            {dirtySheets.attributes ? (
              <Button
                type="submit"
                form={TALENT_SCALAR_FIELD_FORM_ID}
                disabled={attributesSavePending}
                className={cn(
                  "h-11 min-w-0 flex-1 rounded-2xl text-[15px] font-semibold",
                  luxuryGoldButton,
                )}
              >
                {attributesSavePending ? "Saving…" : "Save fields"}
              </Button>
            ) : null}
          </div>
        }
      >
        <SheetHeading
          title={focusedGroupLabel ?? "Profile Fields"}
          description={
            focusedGroupLabel
              ? "Editing this section only. Changes still save with the rest of your profile data."
              : "Fields are governed by the agency. Labels show what's required."
          }
        />
        {taxonomy ? (
          groupFromUrl && !focusedGroupLabel ? (
            <p className="text-sm text-destructive">
              This section is not available. It may have been renamed or archived.
            </p>
          ) : (
            <TalentFieldValuesEditor
              talentProfileId={talentProfileId}
              groups={fieldCatalog.groups}
              editableByGroup={fieldCatalog.editableByGroup}
              scalarEditableIds={fieldCatalog.scalarEditableIds}
              fieldValues={fieldValues}
              taxonomy={{
                allTerms: taxonomy.allTerms,
                assignedIds: taxonomy.assignedIds,
                primaryTalentTypeId: taxonomy.primaryTalentTypeId,
                editableFields: taxonomy.editableFields,
              }}
              onDirtyChange={setAttributesDirty}
              onPendingChange={setAttributesSavePending}
              focusGroupSlug={attributesGroupSlug}
            />
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Fields could not be loaded. Refresh and try again.
          </p>
        )}
      </TalentEditPanel>

      <TalentEditPanel
        open={openPanel === "review"}
        onOpenChange={handlePanelClose}
        title="Submit for Review"
        description="We'll validate completion and workflow state on the server before submitting."
        bottomBar={
          <div className="flex w-full gap-3">
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-11 rounded-2xl border-border/60 bg-muted/30 text-[15px] font-semibold text-foreground shadow-sm hover:bg-muted/40",
                  reviewReady ? "min-w-0 flex-1" : "w-full",
                )}
              >
                Done
              </Button>
            </DialogPrimitive.Close>
            {reviewReady ? (
              <Button
                type="submit"
                form={TALENT_SUBMIT_FOR_REVIEW_FORM_ID}
                disabled={reviewPending}
                className={cn(
                  "h-11 min-w-0 flex-1 rounded-2xl text-[15px] font-semibold",
                  luxuryGoldButton,
                )}
              >
                {reviewPending ? "Submitting…" : "Submit"}
              </Button>
            ) : null}
          </div>
        }
      >
        <SheetHeading
          title="Submit for Review"
          description="We'll validate completion and workflow state on the server before submitting."
        />
        <TalentSubmitForReviewForm
          canSubmit={canSubmit}
          threshold={TALENT_SUBMISSION_THRESHOLD}
          completionScore={completionScore}
          termsVersion={talentTermsVersion}
          latestAcceptedTermsVersion={latestTermsConsent?.terms_version ?? null}
          statusAllowsSubmit={["draft", "hidden"].includes(profile.workflow_status)}
          onPendingChange={setReviewPending}
          onReadyToSubmitChange={setReviewReady}
          onSuccess={() => setOpenPanel(null)}
        />
      </TalentEditPanel>
    </TalentDashboardPage>
  );
}
