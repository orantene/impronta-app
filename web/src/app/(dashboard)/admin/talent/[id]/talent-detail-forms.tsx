"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CanonicalLocationFieldset } from "@/components/location/canonical-location-fieldset";
import { updateTalentProfile, assignTaxonomyTerm, removeTaxonomyTerm, type TalentActionState } from "@/app/(dashboard)/admin/talent/actions";
import type { CitySuggestion, CountrySuggestion } from "@/lib/location-autocomplete";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Profile edit form                                                    */
/* ------------------------------------------------------------------ */
const GENDER_OPTIONS = [
  { value: "", label: "—" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

interface ProfileFormProps {
  id: string;
  initial: {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    short_bio: string | null;
    phone: string | null;
    gender: string | null;
    date_of_birth: string | null;
    location_id: string | null;
    residence_city_id: string | null;
    workflow_status: string;
    visibility: string;
    is_featured: boolean;
    featured_level: number | null;
    featured_position: number | null;
    membership_tier: string | null;
  };
  initialResidence: { country: CountrySuggestion | null; city: CitySuggestion | null };
  initialOrigin: { country: CountrySuggestion | null; city: CitySuggestion | null };
}

export function TalentDetailForm({ id, initial, initialResidence, initialOrigin }: ProfileFormProps) {
  const [state, action, pending] = useActionState<TalentActionState, FormData>(
    updateTalentProfile,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="talent_id" value={id} />
      <input type="hidden" name="edited_locale" value="en" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="display_name">Display name (public)</Label>
          <Input
            id="display_name"
            name="display_name"
            defaultValue={initial.display_name ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="first_name">First name</Label>
          <Input
            id="first_name"
            name="first_name"
            defaultValue={initial.first_name ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">Last name</Label>
          <Input
            id="last_name"
            name="last_name"
            defaultValue={initial.last_name ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initial.phone ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <select
            id="gender"
            name="gender"
            defaultValue={initial.gender ?? ""}
            className={ADMIN_FORM_CONTROL}
          >
            {GENDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date_of_birth">Date of birth</Label>
          <Input
            id="date_of_birth"
            name="date_of_birth"
            type="date"
            defaultValue={initial.date_of_birth ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="membership_tier">Membership tier</Label>
          <select
            id="membership_tier"
            name="membership_tier"
            defaultValue={initial.membership_tier ?? ""}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="">—</option>
            <option value="free">Free</option>
            <option value="free_trial">Free trial</option>
            <option value="premium">Premium</option>
            <option value="featured">Featured</option>
          </select>
        </div>
      </div>

      <CanonicalLocationFieldset
        prefix="residence"
        title="Lives in"
        countryLabel="Residence country"
        cityLabel="Residence city"
        required
        noCard
        helperText="Canonical base location used for directory placement and public display."
        initial={initialResidence}
      />

      <CanonicalLocationFieldset
        prefix="origin"
        title="Originally from"
        countryLabel="Origin country"
        cityLabel="Origin city"
        required={false}
        noCard
        helperText="Optional. Shown on the public profile when set."
        initial={initialOrigin}
      />

      <div className="space-y-1.5">
        <Label htmlFor="short_bio">Short bio</Label>
        <textarea
          id="short_bio"
          name="short_bio"
          defaultValue={initial.short_bio ?? ""}
          rows={4}
          className={cn(
            ADMIN_FORM_CONTROL,
            "h-auto min-h-[88px] py-3 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="workflow_status">Workflow status</Label>
          <select
            id="workflow_status"
            name="workflow_status"
            defaultValue={initial.workflow_status}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="approved">Approved</option>
            <option value="hidden">Hidden</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visibility">Visibility</Label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={initial.visibility}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="hidden">Hidden</option>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </div>

        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="decision_note">Agency note (optional)</Label>
          <textarea
            id="decision_note"
            name="decision_note"
            rows={2}
            placeholder="Optional note shown in the talent's decision timeline (e.g., why approved, what to change)."
            className={cn(
            ADMIN_FORM_CONTROL,
            "h-auto min-h-[88px] py-3 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          )}
          />
          <p className="text-xs text-muted-foreground">
            Saved only when workflow status or visibility changes.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Featured</Label>
          <div className="flex h-9 items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="is_featured"
                value="true"
                defaultChecked={initial.is_featured}
              />
              Yes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="is_featured"
                value="false"
                defaultChecked={!initial.is_featured}
              />
              No
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="featured_level">Featured level</Label>
          <Input
            id="featured_level"
            name="featured_level"
            type="number"
            min={0}
            max={10}
            defaultValue={initial.featured_level ?? ""}
            placeholder="0–10"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="featured_position">Featured position</Label>
          <Input
            id="featured_position"
            name="featured_position"
            type="number"
            min={0}
            defaultValue={initial.featured_position ?? ""}
            placeholder="Sort order"
          />
        </div>
      </div>

      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Changes saved.</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Focused admin forms (sheet-friendly)                                 */
/* ------------------------------------------------------------------ */

export function AdminTalentIdentityForm({
  id,
  initial,
  initialResidence,
  initialOrigin,
}: {
  id: string;
  initial: Pick<
    ProfileFormProps["initial"],
    | "display_name" | "first_name" | "last_name" | "short_bio"
    | "phone" | "gender" | "date_of_birth"
    | "location_id" | "residence_city_id"
  >;
  initialResidence: { country: CountrySuggestion | null; city: CitySuggestion | null };
  initialOrigin: { country: CountrySuggestion | null; city: CitySuggestion | null };
}) {
  const [state, action, pending] = useActionState<TalentActionState, FormData>(
    updateTalentProfile,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="talent_id" value={id} />
      <input type="hidden" name="edited_locale" value="en" />

      {/* Identity */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="display_name">Display name (public)</Label>
          <Input id="display_name" name="display_name" defaultValue={initial.display_name ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" name="first_name" defaultValue={initial.first_name ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" name="last_name" defaultValue={initial.last_name ?? ""} />
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={initial.phone ?? ""} />
      </div>

      {/* Demographics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <select
            id="gender"
            name="gender"
            defaultValue={initial.gender ?? ""}
            className={ADMIN_FORM_CONTROL}
          >
            {GENDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date_of_birth">Date of birth</Label>
          <Input id="date_of_birth" name="date_of_birth" type="date" defaultValue={initial.date_of_birth ?? ""} />
        </div>
      </div>

      {/* Location */}
      <CanonicalLocationFieldset
        prefix="residence"
        title="Lives in"
        countryLabel="Residence country"
        cityLabel="Residence city"
        required
        noCard
        helperText="Canonical base location used for profile display and directory filtering."
        initial={initialResidence}
      />

      <CanonicalLocationFieldset
        prefix="origin"
        title="Originally from"
        countryLabel="Origin country"
        cityLabel="Origin city"
        required={false}
        noCard
        helperText="Optional. Public “Originally from” when set."
        initial={initialOrigin}
      />

      {/* Bio */}
      <div className="space-y-1.5">
        <Label htmlFor="short_bio">Short bio (public)</Label>
        <textarea
          id="short_bio"
          name="short_bio"
          defaultValue={initial.short_bio ?? ""}
          rows={4}
          className={cn(
            ADMIN_FORM_CONTROL,
            "h-auto min-h-[88px] py-3 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      </div>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.success ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export function AdminTalentWorkflowForm({
  id,
  initial,
}: {
  id: string;
  initial: Pick<
    ProfileFormProps["initial"],
    | "workflow_status"
    | "visibility"
    | "membership_tier"
    | "is_featured"
    | "featured_level"
    | "featured_position"
  >;
}) {
  const [state, action, pending] = useActionState<TalentActionState, FormData>(
    updateTalentProfile,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="talent_id" value={id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="workflow_status">Workflow status</Label>
          <select
            id="workflow_status"
            name="workflow_status"
            defaultValue={initial.workflow_status}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="approved">Approved</option>
            <option value="hidden">Hidden</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visibility">Visibility</Label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={initial.visibility}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="hidden">Hidden</option>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="decision_note">Agency note (optional)</Label>
        <textarea
          id="decision_note"
          name="decision_note"
          rows={2}
          placeholder="Optional note stored in workflow events when status/visibility changes."
          className={cn(
            ADMIN_FORM_CONTROL,
            "h-auto min-h-[88px] py-3 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="membership_tier">Membership tier</Label>
          <select
            id="membership_tier"
            name="membership_tier"
            defaultValue={initial.membership_tier ?? ""}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="">—</option>
            <option value="free">Free</option>
            <option value="free_trial">Free trial</option>
            <option value="premium">Premium</option>
            <option value="featured">Featured</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Featured</Label>
          <div className="flex h-9 items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="is_featured"
                value="true"
                defaultChecked={initial.is_featured}
              />
              Yes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="is_featured"
                value="false"
                defaultChecked={!initial.is_featured}
              />
              No
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="featured_level">Featured level</Label>
          <Input
            id="featured_level"
            name="featured_level"
            type="number"
            min={0}
            max={10}
            defaultValue={initial.featured_level ?? ""}
            placeholder="0–10"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="featured_position">Featured position</Label>
          <Input
            id="featured_position"
            name="featured_position"
            type="number"
            min={0}
            defaultValue={initial.featured_position ?? ""}
            placeholder="Sort order"
          />
        </div>
      </div>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.success ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save workflow changes"}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Taxonomy assignment form                                             */
/* ------------------------------------------------------------------ */
interface TaxonomyFormProps {
  talentId: string;
  allTerms: Array<{ id: string; kind: string; name_en: string; slug: string }>;
  assignedIds: string[];
}

export function TaxonomyAssignmentForm({
  talentId,
  allTerms,
  assignedIds,
}: TaxonomyFormProps) {
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return allTerms;
    return allTerms.filter((t) => t.name_en.toLowerCase().includes(query));
  }, [allTerms, q]);

  const kinds = useMemo(() => {
    return Array.from(new Set(visible.map((t) => t.kind)));
  }, [visible]);

  return (
    <div className="space-y-3">
      {allTerms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No taxonomy terms found.</p>
      ) : null}
      <div className="flex items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms…"
          className="h-9 max-w-sm"
        />
        <Badge variant="secondary">{assignedIds.length} assigned</Badge>
      </div>
      {/* Group by kind */}
      {kinds.map((kind) => (
        <div key={kind}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--impronta-muted)]">
            {kind}
          </p>
          <div className="flex flex-wrap gap-2">
            {visible
              .filter((t) => t.kind === kind)
              .map((term) => {
                const assigned = assignedIds.includes(term.id);
                return (
                  <TermToggle
                    key={term.id}
                    talentId={talentId}
                    term={term}
                    assigned={assigned}
                  />
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TermToggle({
  talentId,
  term,
  assigned,
}: {
  talentId: string;
  term: { id: string; name_en: string };
  assigned: boolean;
}) {
  const [addState, addAction, addPending] = useActionState<TalentActionState, FormData>(
    assignTaxonomyTerm,
    undefined,
  );
  const [removeState, removeAction, removePending] = useActionState<TalentActionState, FormData>(
    removeTaxonomyTerm,
    undefined,
  );

  const pending = addPending || removePending;
  const error = addState?.error ?? removeState?.error;

  if (assigned) {
    return (
      <form action={removeAction}>
        <input type="hidden" name="talent_profile_id" value={talentId} />
        <input type="hidden" name="taxonomy_term_id" value={term.id} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-md border border-[var(--impronta-gold-border)] bg-[rgba(201,162,39,0.12)] px-2.5 py-0.5 text-sm font-medium text-[var(--impronta-gold)] transition-colors hover:bg-[rgba(201,162,39,0.2)] disabled:opacity-50"
          title={error ?? undefined}
        >
          {term.name_en} ✕
        </button>
      </form>
    );
  }

  return (
    <form action={addAction}>
      <input type="hidden" name="talent_profile_id" value={talentId} />
      <input type="hidden" name="taxonomy_term_id" value={term.id} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center rounded-md border border-border/40 px-2.5 py-0.5 text-sm font-medium text-muted-foreground transition-colors hover:border-[var(--impronta-gold-border)] hover:text-[var(--impronta-foreground)] disabled:opacity-50"
        title={error ?? undefined}
      >
        {term.name_en} +
      </button>
    </form>
  );
}
