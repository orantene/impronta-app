"use client";

import { useState, useTransition } from "react";

import { updateSelfIdentity } from "@/lib/server-actions/talent-self-profile-sections";

type Props = {
  talentProfileId: string;
  initial: boolean;
  label: string;
  hint: string;
  savedText: string;
  errorText: string;
};

/** Profesional-facing switch for `talent_profiles.is_discoverable`. */
export function DirectorySwitch({ talentProfileId, initial, label, hint, savedText, errorText }: Props) {
  const [on, setOn] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    setStatus("idle");
    startTransition(async () => {
      const res = await updateSelfIdentity({ talent_profile_id: talentProfileId, is_discoverable: next });
      if (res.ok) {
        setStatus("saved");
      } else {
        setOn(!next);
        setStatus("error");
      }
    });
  }

  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={pending}
        onClick={toggle}
        className={`mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`h-5 w-5 rounded-full bg-background shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>
        <p className="mt-1 text-xs text-muted-foreground" role="status" aria-live="polite">
          {status === "saved" ? savedText : status === "error" ? errorText : ""}
        </p>
      </div>
    </div>
  );
}
