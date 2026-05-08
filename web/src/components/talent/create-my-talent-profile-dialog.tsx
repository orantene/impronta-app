"use client";

// ============================================================================
// create-my-talent-profile-dialog.tsx — Phase 4 / Pure Workspace state
//
// Dialog for a workspace admin who has no talent profile to provision one
// for themselves. Shows display-name + auto-derived slug; submits via
// provisionTalentProfileSelf.
//
// All async states are visible (in-flight, persistent error) per
// feedback_admin_edit_ux.md — no toast-only confirmations.
// ============================================================================

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { provisionTalentProfileSelf } from "@/lib/server-actions/talent-self-provision";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the display name field (from auth user metadata or email). */
  defaultDisplayName?: string;
  /** The workspace slug — used to construct the success redirect URL. */
  tenantSlug: string;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

export function CreateMyTalentProfileDialog({
  open,
  onOpenChange,
  defaultDisplayName = "",
  tenantSlug,
}: Props) {
  const router = useRouter();

  const [displayName, setDisplayName] = React.useState(defaultDisplayName);
  const [slug, setSlug] = React.useState(() => slugify(defaultDisplayName));
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false);
  const [submitState, setSubmitState] = React.useState<SubmitState>({ status: "idle" });

  // Auto-derive slug from name unless the user has manually edited it.
  React.useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(slugify(displayName));
    }
  }, [displayName, slugManuallyEdited]);

  // Reset state when dialog reopens.
  React.useEffect(() => {
    if (open) {
      setDisplayName(defaultDisplayName);
      setSlug(slugify(defaultDisplayName));
      setSlugManuallyEdited(false);
      setSubmitState({ status: "idle" });
    }
  }, [open, defaultDisplayName]);

  const isSubmitting = submitState.status === "submitting";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    setSubmitState({ status: "submitting" });

    try {
      const result = await provisionTalentProfileSelf({
        tenantSlug,
        displayName: displayName.trim(),
      });

      if (!result.ok) {
        setSubmitState({ status: "error", message: result.error });
        return;
      }

      // Success — navigate to talent dashboard for this workspace.
      // Keep dialog open while navigating to avoid a layout flash.
      router.push(`/${tenantSlug}/talent`);
    } catch (err) {
      setSubmitState({
        status: "error",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={isSubmitting ? undefined : onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]",
            "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
            "opacity-0 transition-opacity duration-200",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-md rounded-2xl border border-border/60 bg-card shadow-xl",
            "p-6 focus:outline-none",
            "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
            "opacity-0 transition-opacity duration-200",
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-foreground">
                Create your talent page
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                Set up a Basic talent profile so you can take bookings. You can edit your details and add photos after.
              </DialogPrimitive.Description>
            </div>
            {!isSubmitting && (
              <DialogPrimitive.Close asChild>
                <button
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </DialogPrimitive.Close>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            {/* Display name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ctp-name">Your name</Label>
              <Input
                id="ctp-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Nia Adeyemi"
                disabled={isSubmitting}
                required
                autoComplete="name"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This is how you appear on the roster and on your public talent page.
              </p>
            </div>

            {/* Slug preview (read-only — auto-derived, no separate slug column on talent_profiles) */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ctp-slug" className="flex items-center gap-1">
                Public URL preview
              </Label>
              <div className="flex items-center rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground gap-1 select-none">
                <span className="shrink-0">tulala.digital/t/</span>
                <span className="font-medium text-foreground truncate">{slug || "…"}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Your profile code is assigned automatically. You can set a custom URL after creating your profile.
              </p>
            </div>

            {/* Persistent error */}
            {submitState.status === "error" && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{submitState.message}</span>
              </div>
            )}

            {/* Submit */}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Creating talent page…
                </>
              ) : (
                "Create talent page"
              )}
            </Button>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
