"use client";

import { useActionState, useRef } from "react";

import { SetupKitCard } from "@/components/admin/setup/setup-kit-card";
import {
  applyThemePresetAction,
  type DesignActionState,
} from "@/app/(dashboard)/admin/site-settings/design/actions";

/**
 * ThemeKitsGrid — client wrapper that renders the SetupKitCard gallery and
 * threads each card to the same `applyThemePresetAction`. Each kit gets its
 * own `<form>`; clicking a non-active card calls `formRef.requestSubmit()`,
 * letting the server action take over from there.
 *
 * Why one shared `useActionState` and per-card forms:
 *   - All cards hit the same server action, so we want one shared `pending`
 *     flag and one toast/error region.
 *   - Each card has its own `presetSlug` hidden input, so the submission
 *     payload is unambiguous.
 */
export interface ThemeKitView {
  slug: string;
  label: string;
  summary: string;
  /** Tag list used as the eyebrow + meta line. */
  idealFor: string[];
  /** Background CSS for the kit visual. */
  visual: string;
}

export function ThemeKitsGrid({
  kits,
  activeSlug,
  version,
  canEdit,
}: {
  kits: ReadonlyArray<ThemeKitView>;
  activeSlug: string | null;
  version: number;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<DesignActionState, FormData>(
    applyThemePresetAction,
    undefined,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kits.map((kit) => (
          <ThemeKitForm
            key={kit.slug}
            kit={kit}
            inUse={kit.slug === activeSlug}
            version={version}
            canEdit={canEdit}
            action={action}
            pending={pending}
          />
        ))}
      </div>
      {state ? (
        state.ok ? (
          <p
            role="status"
            className="rounded-lg border border-[rgba(20,107,58,0.18)] bg-[rgba(20,107,58,0.06)] px-3 py-2 text-[12.5px] text-[#0e4a26]"
          >
            {state.message}
          </p>
        ) : (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/[0.06] px-3 py-2 text-[12.5px] text-destructive"
          >
            {state.error}
          </p>
        )
      ) : null}
    </div>
  );
}

function ThemeKitForm({
  kit,
  inUse,
  version,
  canEdit,
  action,
  pending,
}: {
  kit: ThemeKitView;
  inUse: boolean;
  version: number;
  canEdit: boolean;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const disabled = !canEdit || pending || inUse;

  return (
    <form ref={formRef} action={action} className="contents">
      <input type="hidden" name="presetSlug" value={kit.slug} />
      <input type="hidden" name="expectedVersion" value={version} />
      <SetupKitCard
        eyebrow={kit.idealFor[0] ?? "PRESET"}
        title={kit.label}
        meta={kit.summary}
        visual={kit.visual}
        inUse={inUse}
        onClick={
          disabled
            ? undefined
            : () => formRef.current?.requestSubmit()
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {kit.idealFor.slice(0, 3).map((tag) => (
              <span
                key={`${kit.slug}-${tag}`}
                className="rounded-full bg-foreground/[0.05] px-2 py-[2px] text-[10px] font-medium uppercase tracking-[0.12em] text-foreground/70"
              >
                {tag}
              </span>
            ))}
          </div>
          <span className="text-[11px] font-medium text-muted-foreground">
            {pending && !inUse ? "Applying…" : inUse ? "Active" : "Click to apply"}
          </span>
        </div>
      </SetupKitCard>
    </form>
  );
}
