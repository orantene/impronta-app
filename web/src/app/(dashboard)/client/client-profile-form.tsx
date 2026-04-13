"use client";

import { useActionState } from "react";
import {
  updateClientProfile,
  type ClientProfileActionState,
} from "@/app/(dashboard)/client/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export function ClientProfileForm({
  defaultValues,
  email,
}: {
  defaultValues: {
    company_name?: string | null;
    display_name?: string | null;
    notes?: string | null;
    phone?: string | null;
    whatsapp_phone?: string | null;
    website_url?: string | null;
  };
  email: string;
}) {
  const [state, formAction, pending] = useActionState<
    ClientProfileActionState,
    FormData
  >(updateClientProfile, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Client details saved.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="display_name">Primary contact</Label>
          <Input
            id="display_name"
            name="display_name"
            defaultValue={defaultValues.display_name ?? ""}
            autoComplete="name"
            className="rounded-xl border-border/55 bg-background/80"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company_name">Company / brand</Label>
          <Input
            id="company_name"
            name="company_name"
            defaultValue={defaultValues.company_name ?? ""}
            autoComplete="organization"
            className="rounded-xl border-border/55 bg-background/80"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="account_email">Account email</Label>
          <Input
            id="account_email"
            value={email}
            readOnly
            disabled
            className="rounded-xl border-border/55 bg-muted/30"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={defaultValues.phone ?? ""}
            autoComplete="tel"
            className="rounded-xl border-border/55 bg-background/80"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="whatsapp_phone">WhatsApp</Label>
          <Input
            id="whatsapp_phone"
            name="whatsapp_phone"
            defaultValue={defaultValues.whatsapp_phone ?? ""}
            autoComplete="tel"
            className="rounded-xl border-border/55 bg-background/80"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website_url">Website</Label>
          <Input
            id="website_url"
            name="website_url"
            defaultValue={defaultValues.website_url ?? ""}
            placeholder="https://"
            autoComplete="url"
            className="rounded-xl border-border/55 bg-background/80"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={defaultValues.notes ?? ""}
          placeholder="Billing notes, preferred contact hours, recurring needs…"
          className="rounded-xl border-border/55 bg-background/80"
        />
      </div>

      <Button type="submit" disabled={pending} className={cn(LUXURY_GOLD_BUTTON_CLASS)}>
        {pending ? "Saving…" : "Save client info"}
      </Button>
    </form>
  );
}
