"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { toast } from "sonner";
import { updateTalentWorkflowVisibilityInline } from "@/app/(dashboard)/admin/talent/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { Label } from "@/components/ui/label";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { ADMIN_DRAWER_CLASS_MEDIUM } from "@/lib/admin/admin-drawer-classes";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { AdminTalentIdentityForm, AdminTalentWorkflowForm, TaxonomyAssignmentForm } from "./talent-detail-forms";
import { AdminTalentRosterActions } from "@/app/(dashboard)/admin/talent/[id]/admin-talent-roster-actions";
import { AdminTalentBioTranslationPanel } from "@/app/(dashboard)/admin/talent/[id]/admin-talent-bio-translation-panel";
import { AdminTalentReviewSections } from "@/components/admin/admin-talent-review-sections";
import { BasicInfoExtraScalarFieldsAdmin } from "@/components/profile/basic-info-extra-scalar-fields";
import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/fields/types";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_OUTLINE_CONTROL_CLASS,
  ADMIN_SECTION_TITLE_CLASS,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { buildTalentChecklist, calculateTalentCompletion } from "@/lib/talent-dashboard";
import { formatSubmissionKind } from "@/lib/talent-submission-service";
import type { CitySuggestion, CountrySuggestion } from "@/lib/location-autocomplete";
import { cn } from "@/lib/utils";

const AdminTalentFieldValuesEditor = dynamic(
  () =>
    import("./admin-talent-field-values-editor").then((m) => ({
      default: m.AdminTalentFieldValuesEditor,
    })),
  {
    loading: () => <p className="text-sm text-muted-foreground">Loading field editor…</p>,
  },
);

type ProfileRow = {
  id: string;
  user_id: string | null;
  profile_code: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  bio_en: string | null;
  bio_es: string | null;
  bio_es_draft: string | null;
  bio_es_status: string | null;
  bio_en_draft: string | null;
  bio_en_status: string | null;
  bio_en_updated_at: string | null;
  bio_es_updated_at: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  origin_country_id: string | null;
  origin_city_id: string | null;
  location_id: string | null;
  residence_country_id: string | null;
  residence_city_id: string | null;
  workflow_status: string;
  visibility: string;
  is_featured: boolean | null;
  featured_level: number | null;
  featured_position: number | null;
  membership_tier: string | null;
  profile_completeness_score: number | null;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
  profiles?:
    | {
        display_name: string | null;
        account_status: string | null;
        app_role: string | null;
      }
    | {
        display_name: string | null;
        account_status: string | null;
        app_role: string | null;
      }[]
    | null;
};

type MediaRow = {
  id: string;
  variant_kind: string;
  approval_state: string;
  sort_order: number;
  created_at: string;
};

type SubmissionHistoryRow = {
  id: string;
  submitted_at: string;
  workflow_state_before: string | null;
  workflow_state_after: string | null;
  submission_kind: string;
  accepted_terms_version: string | null;
};

type ConsentRow = {
  id: string;
  accepted_at: string;
  terms_version: string;
  submission_context: string | null;
};

type WorkflowEventRow = {
  id: string;
  created_at: string;
  event_type: string;
  payload: Record<string, unknown> | null;
};

type FieldValueLite = {
  field_definition_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
};

function summarizeMissing(missing: ReturnType<typeof buildTalentChecklist>) {
  const items = missing.filter((i) => !i.complete);
  return items.slice(0, 4);
}

function EnumChip({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className="capitalize">
      {children}
    </Badge>
  );
}

const WORKFLOW_SIDEBAR_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "approved", label: "Approved" },
  { value: "hidden", label: "Hidden" },
  { value: "archived", label: "Archived" },
] as const;

const VISIBILITY_SIDEBAR_OPTIONS = [
  { value: "hidden", label: "Hidden" },
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
] as const;

function BoolIcon({ value, label }: { value: boolean; label: string }) {
  return value ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
      <Check className="size-4" aria-hidden />
      {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <X className="size-4" aria-hidden />
      {label}
    </span>
  );
}

export function AdminTalentCockpitClient({
  id,
  profile,
  openAiBioAvailable,
  initialResidence,
  initialOrigin,
  allTerms,
  assignedIds,
  media,
  submissionHistory,
  consentHistory,
  workflowEvents,
  fieldCatalog,
  fieldValues,
}: {
  id: string;
  profile: ProfileRow;
  openAiBioAvailable: boolean;
  initialResidence: { country: CountrySuggestion | null; city: CitySuggestion | null };
  initialOrigin: { country: CountrySuggestion | null; city: CitySuggestion | null };
  allTerms: Array<{ id: string; kind: string; name_en: string; slug: string }>;
  assignedIds: string[];
  media: MediaRow[];
  submissionHistory: SubmissionHistoryRow[];
  consentHistory: ConsentRow[];
  workflowEvents: WorkflowEventRow[];
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
  fieldValues: FieldValueLite[];
}) {
  const accountProfile = Array.isArray(profile.profiles)
    ? profile.profiles[0] ?? null
    : profile.profiles ?? null;

  const [openSheet, setOpenSheet] = useState<
    null | "publicProfile" | "workflow" | "taxonomy" | "fieldValues"
  >(null);

  const router = useRouter();
  const [wfVisPending, startWfVisTransition] = useTransition();
  const [workflowStatus, setWorkflowStatus] = useState(profile.workflow_status);
  const [visibility, setVisibility] = useState(profile.visibility);

  useEffect(() => {
    setWorkflowStatus(profile.workflow_status);
    setVisibility(profile.visibility);
  }, [profile.id, profile.workflow_status, profile.visibility]);

  const latestSubmission = submissionHistory[0] ?? null;
  const latestConsent = consentHistory[0] ?? null;

  const basicInfoGroup = useMemo(
    () => fieldCatalog.groups.find((g) => g.slug === "basic_info"),
    [fieldCatalog.groups],
  );
  const basicInfoExtraDefinitions = useMemo(() => {
    if (!basicInfoGroup) return [];
    return fieldCatalog.editableByGroup.get(basicInfoGroup.id) ?? [];
  }, [basicInfoGroup, fieldCatalog.editableByGroup]);

  const completion = useMemo(() => {
    const base = {
      display_name: profile.display_name,
      first_name: profile.first_name,
      last_name: profile.last_name,
      short_bio: profile.short_bio,
      bio_en: profile.bio_en,
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
    };
    const score = calculateTalentCompletion(base);
    const checklist = buildTalentChecklist(base);
    return { score, checklist, missingTop: summarizeMissing(checklist) };
  }, [profile, fieldCatalog]);

  const previewHref = useMemo(
    () =>
      `/t/${profile.profile_code}${workflowStatus === "approved" && visibility === "public" ? "" : "?preview=1"}`,
    [profile.profile_code, workflowStatus, visibility],
  );

  const persistWorkflowVisibility = (next: { workflow?: string; visibility?: string }) => {
    const wf = next.workflow ?? workflowStatus;
    const vis = next.visibility ?? visibility;
    const prevWf = workflowStatus;
    const prevVis = visibility;
    if (next.workflow !== undefined) setWorkflowStatus(next.workflow);
    if (next.visibility !== undefined) setVisibility(next.visibility);
    startWfVisTransition(async () => {
      const res = await updateTalentWorkflowVisibilityInline({
        talent_id: id,
        workflow_status: wf,
        visibility: vis,
      });
      if (res.error) {
        toast.error(res.error);
        setWorkflowStatus(prevWf);
        setVisibility(prevVis);
        return;
      }
      toast.success("Saved");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Overview strip (hub header + tabs live in layout) */}
      <section className="rounded-3xl border border-border/50 bg-gradient-to-br from-[var(--impronta-gold)]/[0.05] via-card/80 to-muted/20 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <EnumChip>{accountProfile?.account_status ?? "—"}</EnumChip>
              <Badge variant="outline" className="capitalize border-border/60">
                {accountProfile?.app_role ?? "—"}
              </Badge>
              <span className="font-mono text-xs">{completion.score}% complete</span>
              <span className="text-muted-foreground/70">·</span>
              <span className="font-mono text-xs">
                Updated {profile.updated_at ? new Date(profile.updated_at).toLocaleString() : "—"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {latestSubmission ? (
                <Badge variant="secondary" className="gap-1">
                  <Info className="size-3.5" aria-hidden />
                  {formatSubmissionKind(latestSubmission.submission_kind)}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-border/60">
                  No submissions
                </Badge>
              )}
              <BoolIcon value={fieldCatalog.hasPrimaryTalentType} label="Primary type" />
              <BoolIcon value={fieldCatalog.mediaCount > 0} label="Media" />
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                className={cn("h-9 rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS)}
                asChild
              >
                <Link href={previewHref} target="_blank" rel="noreferrer" scroll={false}>
                  Preview public contract ↗
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn("h-9 rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS)}
                onClick={() => setOpenSheet("workflow")}
              >
                Workflow controls
              </Button>
              {profile.user_id ? (
                <Button variant="secondary" size="sm" className="h-9 rounded-xl shadow-sm" asChild>
                  <Link href={`/admin/talent/${profile.id}/account`} scroll={false}>
                    Account
                  </Link>
                </Button>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
              <CircleAlert className="size-3.5" aria-hidden />
              <span>Preview excludes internal-only fields.</span>
            </div>
          </div>
        </div>

      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <AdminTalentReviewSections
            talentProfileId={id}
            profile={{
              display_name: profile.display_name,
              first_name: profile.first_name,
              last_name: profile.last_name,
              short_bio: profile.short_bio,
              bio_en: profile.bio_en,
              phone: profile.phone,
              gender: profile.gender,
              date_of_birth: profile.date_of_birth,
              origin_country_id: profile.origin_country_id,
              origin_city_id: profile.origin_city_id,
              residence_city_id: profile.residence_city_id,
              location_id: profile.location_id,
              workflow_status: workflowStatus,
              visibility,
            }}
            completionScore={completion.score}
            checklist={completion.checklist}
            missingTopIncomplete={completion.missingTop}
            fieldCatalog={fieldCatalog}
            fieldValues={fieldValues}
            allTerms={allTerms}
            assignedIds={assignedIds}
            media={media}
            previewHref={previewHref}
            onOpenProfile={() => setOpenSheet("publicProfile")}
            onOpenTaxonomy={() => setOpenSheet("taxonomy")}
            onOpenFieldValues={() => setOpenSheet("fieldValues")}
            onOpenWorkflow={() => setOpenSheet("workflow")}
          />

          <AdminTalentBioTranslationPanel
            talentProfileId={id}
            bio_en={profile.bio_en}
            bio_es={profile.bio_es}
            bio_en_updated_at={profile.bio_en_updated_at}
            bio_es_updated_at={profile.bio_es_updated_at}
            short_bio={profile.short_bio}
            openAiAvailable={openAiBioAvailable}
          />
        </div>

        {/* Right panel: operations */}
        <aside className="space-y-4">
          <DashboardSectionCard
            title="Workflow"
            description={null}
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <Label htmlFor="cockpit-workflow-status" className="shrink-0 text-muted-foreground">
                  Workflow
                </Label>
                <select
                  id="cockpit-workflow-status"
                  className={cn(ADMIN_FORM_CONTROL, "h-9 max-w-full py-1 text-sm sm:max-w-[200px]")}
                  value={workflowStatus}
                  disabled={wfVisPending}
                  onChange={(e) => persistWorkflowVisibility({ workflow: e.target.value })}
                >
                  {WORKFLOW_SIDEBAR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <Label htmlFor="cockpit-visibility" className="shrink-0 text-muted-foreground">
                  Visibility
                </Label>
                <select
                  id="cockpit-visibility"
                  className={cn(ADMIN_FORM_CONTROL, "h-9 max-w-full py-1 text-sm sm:max-w-[200px]")}
                  value={visibility}
                  disabled={wfVisPending}
                  onChange={(e) => persistWorkflowVisibility({ visibility: e.target.value })}
                >
                  {VISIBILITY_SIDEBAR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span>Latest submission</span>
                <span className="font-mono text-xs text-foreground">
                  {latestSubmission ? new Date(latestSubmission.submitted_at).toLocaleDateString() : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1">
                  Terms
                  <HelpTip content="Shows the most recent terms version accepted during submission (if present)." />
                </span>
                <span className="font-mono text-xs text-foreground">
                  {latestSubmission?.accepted_terms_version ?? latestConsent?.terms_version ?? "—"}
                </span>
              </div>
              <div className="pt-2">
                <Button
                  size="sm"
                  className={cn("h-10 w-full rounded-xl", LUXURY_GOLD_BUTTON_CLASS)}
                  onClick={() => setOpenSheet("workflow")}
                >
                  Open workflow controls
                </Button>
              </div>
            </div>
          </DashboardSectionCard>

          <DashboardSectionCard
            title="Workflow timeline"
            description={null}
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            {workflowEvents.length > 0 ? (
              <ul className="space-y-3">
                {workflowEvents.map((event) => {
                  const note =
                    typeof event.payload?.decision_note === "string"
                      ? event.payload.decision_note
                      : typeof event.payload?.note === "string"
                        ? event.payload.note
                        : null;

                  return (
                    <li key={event.id} className="rounded-2xl border border-border/45 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                        {event.event_type.replace(/_/g, " ")}
                      </p>
                      <p className="mt-1 text-xs">
                        {new Date(event.created_at).toLocaleString()}
                      </p>
                      {note?.trim() ? (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No workflow events recorded yet.</p>
            )}
          </DashboardSectionCard>
        </aside>
      </div>

      {/* Sheets */}
      <DashboardEditPanel
        open={openSheet !== null}
        onOpenChange={(o) => setOpenSheet(o ? openSheet ?? "publicProfile" : null)}
        title={
          openSheet === "workflow"
            ? "Workflow controls"
            : openSheet === "taxonomy"
              ? "Taxonomy"
              : openSheet === "fieldValues"
                ? "Field values"
                : "Profile"
        }
        description={
          openSheet === "workflow"
            ? "State transitions are audited server-side. Use an agency note for visible decision history."
            : openSheet === "taxonomy"
              ? "Assign terms by kind."
              : openSheet === "fieldValues"
                ? "Scalar field_values by group. Basic Information extras are edited in the Profile sheet with canonical fields."
                : "Public + agency-private identity fields. Workflow/visibility live in a separate operational panel."
        }
        className={ADMIN_DRAWER_CLASS_MEDIUM}
      >
          {openSheet === "publicProfile" ? (
              <div className="space-y-2">
                <AdminTalentIdentityForm
                  id={id}
                  initial={{
                    display_name: profile.display_name,
                    first_name: profile.first_name,
                    last_name: profile.last_name,
                    short_bio: profile.short_bio,
                    phone: profile.phone,
                    gender: profile.gender,
                    date_of_birth: profile.date_of_birth,
                    location_id: profile.location_id,
                    residence_city_id: profile.residence_city_id,
                  }}
                  initialResidence={initialResidence}
                  initialOrigin={initialOrigin}
                />
                <BasicInfoExtraScalarFieldsAdmin
                  talentProfileId={id}
                  definitions={basicInfoExtraDefinitions}
                  fieldValues={fieldValues}
                />
              </div>
          ) : openSheet === "workflow" ? (
              <div>
                <AdminTalentWorkflowForm
                  key={`${workflowStatus}-${visibility}`}
                  id={id}
                  initial={{
                    workflow_status: workflowStatus,
                    visibility,
                    membership_tier: profile.membership_tier ?? null,
                    is_featured: profile.is_featured ?? false,
                    featured_level: profile.featured_level ?? null,
                    featured_position: profile.featured_position ?? null,
                  }}
                />
              </div>
          ) : openSheet === "taxonomy" ? (
              <div>
                <TaxonomyAssignmentForm talentId={id} allTerms={allTerms} assignedIds={assignedIds} />
              </div>
          ) : openSheet === "fieldValues" ? (
              <div>
                <AdminTalentFieldValuesEditor
                  talentProfileId={id}
                  groups={fieldCatalog.groups}
                  editableByGroup={fieldCatalog.editableByGroup}
                  fieldValues={fieldValues}
                />
              </div>
          ) : null}
      </DashboardEditPanel>

      <AdminTalentRosterActions talentId={id} deletedAt={profile.deleted_at ?? null} />

      <div className="text-sm text-muted-foreground">
        Created {new Date(profile.created_at).toLocaleString()} · Last updated{" "}
        {profile.updated_at ? new Date(profile.updated_at).toLocaleString() : "—"}
      </div>
    </div>
  );
}
