"use client";

import { useActionState } from "react";
import {
  createTalentProfile,
  type CreateTalentFormState,
} from "@/app/(dashboard)/admin/talent/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";

type TalentTypeOption = {
  id: string;
  name_en: string;
};

type NewTalentFormProps = {
  talentTypes: TalentTypeOption[];
};

export function NewTalentForm({ talentTypes }: NewTalentFormProps) {
  const [state, formAction] = useActionState<CreateTalentFormState, FormData>(
    createTalentProfile,
    undefined,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      {state?.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="display_name">Display name *</Label>
        <Input
          id="display_name"
          name="display_name"
          required
          placeholder="e.g. Sofía Herrera"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" name="first_name" autoComplete="off" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" name="last_name" autoComplete="off" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="talent_type_term_id">Primary talent type</Label>
        <select
          id="talent_type_term_id"
          name="talent_type_term_id"
          defaultValue=""
          className={ADMIN_FORM_CONTROL}
        >
          <option value="">— none —</option>
          {talentTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name_en}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="short_bio">Short bio</Label>
        <Textarea
          id="short_bio"
          name="short_bio"
          rows={4}
          placeholder="One or two lines the agency can show to clients. Full bio can be written later."
          className={ADMIN_FORM_CONTROL}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="+1 555 123 4567"
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agency_visibility">Roster visibility</Label>
        <select
          id="agency_visibility"
          name="agency_visibility"
          defaultValue="roster_only"
          className={ADMIN_FORM_CONTROL}
        >
          <option value="roster_only">Roster only (hidden from storefront)</option>
          <option value="site_visible">Site visible</option>
          <option value="featured">Featured</option>
        </select>
        <p className="text-xs text-muted-foreground">
          The profile is created in draft workflow state. Storefront visibility
          also requires workflow approval.
        </p>
      </div>

      <Button type="submit" className="rounded-full">
        Create talent profile
      </Button>
    </form>
  );
}
