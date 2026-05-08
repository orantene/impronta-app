"use client";

// ============================================================================
// start-free-workspace-dialog.tsx — Phase 3 / Pure Talent state
//
// Dialog for a talent-only user to provision a free workspace.
// Shows name + slug + location fields; submits via provisionFreeWorkspaceFromTalent.
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
import { provisionFreeWorkspaceFromTalent } from "@/lib/server-actions/talent-workspace-provision";

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
  /** Pre-fill: talent's display name + " Studio" */
  defaultWorkspaceName?: string;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

export function StartFreeWorkspaceDialog({ open, onOpenChange, defaultWorkspaceName = "" }: Props) {
  const router = useRouter();

  const [workspaceName, setWorkspaceName] = React.useState(defaultWorkspaceName);
  const [slug, setSlug] = React.useState(() => slugify(defaultWorkspaceName));
  const [location, setLocation] = React.useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false);
  const [submitState, setSubmitState] = React.useState<SubmitState>({ status: "idle" });

  // Sync slug from name unless the user has manually edited it.
  React.useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(slugify(workspaceName));
    }
  }, [workspaceName, slugManuallyEdited]);

  // Reset state when dialog reopens.
  React.useEffect(() => {
    if (open) {
      setWorkspaceName(defaultWorkspaceName);
      setSlug(slugify(defaultWorkspaceName));
      setSlugManuallyEdited(false);
      setLocation("");
      setSubmitState({ status: "idle" });
    }
  }, [open, defaultWorkspaceName]);

  const isSubmitting = submitState.status === "submitting";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    setSubmitState({ status: "submitting" });

    try {
      const result = await provisionFreeWorkspaceFromTalent({
        workspaceName: workspaceName.trim(),
        slug: slug.trim(),
        location: location.trim(),
      });

      if (!result.ok) {
        setSubmitState({ status: "error", message: result.error });
        return;
      }

      // Success — navigate to new workspace admin.
      // Keep dialog open while navigating so there's no flash.
      router.push(`/${result.slug}/admin`);
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
                Start a free workspace
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                Set up your workspace in seconds. You can change these details later in Settings.
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
            {/* Workspace name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wsn-name">Workspace name</Label>
              <Input
                id="wsn-name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g. Nia Studio"
                disabled={isSubmitting}
                required
                autoComplete="organization"
              />
            </div>

            {/* Slug */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wsn-slug">
                URL slug{" "}
                <span className="font-normal text-muted-foreground text-xs">
                  (app.tulala.digital/<strong>{slug || "…"}</strong>/admin)
                </span>
              </Label>
              <Input
                id="wsn-slug"
                value={slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                placeholder="my-studio"
                disabled={isSubmitting}
                required
                pattern="[a-z0-9][a-z0-9\-]{0,30}[a-z0-9]?"
                title="2–32 lowercase letters, numbers, or hyphens. Cannot start or end with a hyphen."
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                2–32 characters, lowercase letters, numbers, and hyphens only.
              </p>
            </div>

            {/* Location */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wsn-location">
                Location{" "}
                <span className="font-normal text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="wsn-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Lagos, Nigeria"
                disabled={isSubmitting}
                autoComplete="address-level2"
              />
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
                  Creating workspace…
                </>
              ) : (
                "Create workspace"
              )}
            </Button>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
