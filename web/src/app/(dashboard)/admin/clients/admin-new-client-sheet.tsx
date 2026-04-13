"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { createAdminClient } from "@/app/(dashboard)/admin/clients/actions";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_OUTLINE_CONTROL_CLASS,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export function AdminNewClientSheet({
  triggerLabel = "New Client",
  triggerVariant,
  triggerSize = "sm",
  className,
  onCreatedClient,
}: {
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
  triggerSize?: "default" | "sm" | "lg";
  className?: string;
  onCreatedClient?: (client: {
    id: string;
    displayName: string | null;
    subtitle: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createAdminClient, undefined);

  useEffect(() => {
    if (state?.success) {
      // Keep sheet open to show password and open action.
    }
  }, [state?.success]);

  useEffect(() => {
    if (!state?.success || !state.createdUserId) return;
    onCreatedClient?.({
      id: state.createdUserId,
      displayName: state.createdDisplayName ?? null,
      subtitle: state.createdCompanyName ?? null,
      email: state.createdEmail ?? null,
      phone: state.createdPhone ?? null,
      company: state.createdCompanyName ?? null,
    });
  }, [onCreatedClient, state?.createdCompanyName, state?.createdDisplayName, state?.createdEmail, state?.createdPhone, state?.createdUserId, state?.success]);

  return (
    <>
      <Button
        type="button"
        size={triggerSize}
        variant={triggerVariant}
        className={cn("rounded-full", !triggerVariant && LUXURY_GOLD_BUTTON_CLASS, className)}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>
      <DashboardEditPanel
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
        title="New Client"
        description="Create a portal login for a Client person. This is not a Client Location or billing record."
      >
        {state?.success ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">{state.message}</p>
            <div className="rounded-lg border border-border/45 bg-muted/15 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Temporary password</p>
              <code className="mt-2 block break-all rounded border border-border/50 bg-background/70 px-2 py-2 text-xs">
                {state.temporaryPassword}
              </code>
              <p className="mt-2 text-xs text-muted-foreground">
                Share this securely with the client and ask them to change it after first login.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {state.createdUserId ? (
                <Button size="sm" asChild>
                  <Link href={`/admin/clients/${state.createdUserId}`} scroll={false}>
                    Open client
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(ADMIN_OUTLINE_CONTROL_CLASS)}
                onClick={() => setOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form action={action} className="max-w-lg space-y-4">
            {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            <div className="rounded-md border border-border/45 bg-muted/15 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Client</span> here means the portal login person. Create
              their Client Location separately under Admin → Client Locations when you need the business or venue record.
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_client_display_name">Client name</Label>
              <Input id="new_client_display_name" name="display_name" required autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_client_email">Email</Label>
              <Input id="new_client_email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_client_password">Temporary password</Label>
              <Input id="new_client_password" name="password" type="text" required minLength={8} autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">Use at least 8 characters. This will be shown once after create.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_client_company_name">Company (optional)</Label>
              <Input id="new_client_company_name" name="company_name" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new_client_phone">Phone (optional)</Label>
                <Input id="new_client_phone" name="phone" type="tel" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_client_whatsapp_phone">WhatsApp (optional)</Label>
                <Input id="new_client_whatsapp_phone" name="whatsapp_phone" type="tel" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_client_website_url">Website (optional)</Label>
              <Input id="new_client_website_url" name="website_url" className={ADMIN_FORM_CONTROL} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_client_notes">Notes (optional)</Label>
              <Textarea id="new_client_notes" name="notes" rows={3} className={ADMIN_FORM_CONTROL} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Creating…" : "Create client"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(ADMIN_OUTLINE_CONTROL_CLASS)}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </DashboardEditPanel>
    </>
  );
}
