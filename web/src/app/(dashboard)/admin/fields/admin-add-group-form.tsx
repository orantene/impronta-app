"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTip } from "@/components/ui/help-tip";
import { createFieldGroup, type FieldAdminActionState } from "./actions";

export function AdminAddGroupForm() {
  const [state, action, pending] = useActionState<FieldAdminActionState, FormData>(
    createFieldGroup,
    undefined,
  );
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!state?.success) return;
    formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="name_en">Name (EN)</Label>
          <HelpTip content="Groups define sections in the talent profile builder." />
        </div>
        <Input id="name_en" name="name_en" placeholder="e.g. Measurements" required disabled={pending} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name_es">Name (ES)</Label>
        <Input id="name_es" name="name_es" placeholder="Optional" disabled={pending} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="slug">Slug</Label>
          <HelpTip content="Auto-generated from name if blank. Lowercase, no spaces." />
        </div>
        <Input id="slug" name="slug" placeholder="auto from name" disabled={pending} />
      </div>
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create group"}
        </Button>
        {state?.error ? (
          <span className="text-sm text-destructive">{state.error}</span>
        ) : state?.success ? (
          <span className="text-sm text-emerald-200">Group created and synced.</span>
        ) : (
          <span className="text-sm text-muted-foreground">Changes apply immediately across talent dashboards.</span>
        )}
      </div>
    </form>
  );
}

