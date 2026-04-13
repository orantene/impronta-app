"use client";

import { useActionState } from "react";
import {
  updateAdminClientProfile,
  type AdminClientProfileActionState,
} from "@/app/(dashboard)/admin/clients/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AdminClientProfileForm({
  userId,
  defaultValues,
}: {
  userId: string;
  defaultValues: {
    company_name: string | null;
    phone: string | null;
    whatsapp_phone: string | null;
    website_url: string | null;
    notes: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<
    AdminClientProfileActionState,
    FormData
  >(updateAdminClientProfile, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="user_id" value={userId} />

      {state?.error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          {state.message ?? "Client details saved."}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="company_name">Company</Label>
          <Input id="company_name" name="company_name" defaultValue={defaultValues.company_name ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website_url">Website</Label>
          <Input id="website_url" name="website_url" defaultValue={defaultValues.website_url ?? ""} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={defaultValues.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp_phone">WhatsApp</Label>
          <Input
            id="whatsapp_phone"
            name="whatsapp_phone"
            defaultValue={defaultValues.whatsapp_phone ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={5} defaultValue={defaultValues.notes ?? ""} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save client profile"}
      </Button>
    </form>
  );
}

