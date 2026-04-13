"use client";

import { useActionState } from "react";
import {
  deleteClientAccount,
  type ClientDeleteAccountState,
} from "@/app/(dashboard)/client/account-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const inputClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-m shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ClientDeleteAccountForm() {
  const [state, formAction, pending] = useActionState<
    ClientDeleteAccountState,
    FormData
  >(deleteClientAccount, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="confirm_delete">Confirmation</Label>
        <Input
          id="confirm_delete"
          name="confirm_delete"
          type="text"
          autoComplete="off"
          placeholder="DELETE"
          aria-describedby="delete-account-hint"
          className={cn(inputClass, "font-mono uppercase tracking-wide")}
        />
        <p id="delete-account-hint" className="text-xs leading-relaxed text-muted-foreground">
          Type <span className="font-mono font-semibold text-foreground">DELETE</span> exactly, then
          press the button. This cannot be undone.
        </p>
      </div>
      <Button type="submit" variant="destructive" disabled={pending} className="rounded-xl">
        {pending ? "Deleting…" : "Delete my account permanently"}
      </Button>
    </form>
  );
}
