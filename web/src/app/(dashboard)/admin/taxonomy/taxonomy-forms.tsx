"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createTaxonomyTerm,
  archiveTaxonomyTerm,
  restoreTaxonomyTerm,
  type TaxonomyActionState,
} from "./actions";

const TAXONOMY_KIND_OPTIONS = [
  { value: "talent_type", label: "Talent type" },
  { value: "tag", label: "Tag" },
  { value: "skill", label: "Skill" },
  { value: "industry", label: "Industry" },
  { value: "event_type", label: "Event type" },
  { value: "fit_label", label: "Fit label" },
  { value: "language", label: "Language" },
] as const;

/* ------------------------------------------------------------------ */
/* Create term form                                                     */
/* ------------------------------------------------------------------ */
export function CreateTermForm() {
  const [state, action, pending] = useActionState<TaxonomyActionState, FormData>(
    createTaxonomyTerm,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Kind</Label>
          <select
            id="kind"
            name="kind"
            defaultValue="talent_type"
            required
            className={ADMIN_FORM_CONTROL}
          >
            {TAXONOMY_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            name="slug"
            placeholder="e.g. fashion-model"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name_en">Name (EN)</Label>
          <Input
            id="name_en"
            name="name_en"
            placeholder="English label"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name_es">Name (ES)</Label>
          <Input
            id="name_es"
            name="name_es"
            placeholder="Spanish label (optional)"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sort_order">Sort order</Label>
          <Input
            id="sort_order"
            name="sort_order"
            type="number"
            defaultValue={0}
            min={0}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Profile location is not a taxonomy term: manage the location catalog in{" "}
        <Link href="/admin/locations" className="font-medium text-foreground underline underline-offset-4">
          Locations
        </Link>
        , then assign a talent’s location on their admin profile.{" "}
        <span className="font-medium text-foreground">Location Countries</span> and{" "}
        <span className="font-medium text-foreground">Location Cities</span> at the bottom of this page are auto-derived
        read-only mirrors for filters — do not add them here.
      </p>

      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Term created.</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create term"}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Archive / restore buttons                                            */
/* ------------------------------------------------------------------ */
export function ArchiveTermButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<TaxonomyActionState, FormData>(
    archiveTaxonomyTerm,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="term_id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={disabled || pending}
        className="text-muted-foreground hover:text-destructive"
        title={state?.error}
      >
        {pending ? "…" : "Archive"}
      </Button>
    </form>
  );
}

export function RestoreTermButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<TaxonomyActionState, FormData>(
    restoreTaxonomyTerm,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="term_id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={disabled || pending}
        className="text-muted-foreground hover:text-emerald-400"
        title={state?.error}
      >
        {pending ? "…" : "Restore"}
      </Button>
    </form>
  );
}
