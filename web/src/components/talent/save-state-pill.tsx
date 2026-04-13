"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  TALENT_MEDIA_SAVED,
  TALENT_PROFILE_SAVED,
  TALENT_WORKSPACE_STATE,
  type TalentWorkspaceStateDetail,
} from "@/lib/talent-workspace-events";

type SavePhase = "idle" | "unsaved" | "saving" | "saved";

export function SaveStatePill() {
  const [phase, setPhase] = useState<SavePhase>("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent<TalentWorkspaceStateDetail>).detail;
      if (!d) return;
      const saving = d.profileSaving || d.mediaSaving || d.workflowSaving;
      if (saving) {
        setPhase("saving");
        return;
      }
      if (d.profileDirty) {
        setPhase("unsaved");
        return;
      }
    };

    const onSaved = () => {
      setPhase("saved");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setPhase("idle"), 3000);
    };

    document.addEventListener(TALENT_WORKSPACE_STATE, onState);
    document.addEventListener(TALENT_PROFILE_SAVED, onSaved);
    document.addEventListener(TALENT_MEDIA_SAVED, onSaved);
    return () => {
      document.removeEventListener(TALENT_WORKSPACE_STATE, onState);
      document.removeEventListener(TALENT_PROFILE_SAVED, onSaved);
      document.removeEventListener(TALENT_MEDIA_SAVED, onSaved);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (phase === "idle") return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-300",
        phase === "unsaved" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        phase === "saving" && "bg-[var(--impronta-gold)]/15 text-[var(--impronta-gold)] animate-pulse",
        phase === "saved" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      )}
      aria-live="polite"
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          phase === "unsaved" && "bg-amber-500",
          phase === "saving" && "bg-[var(--impronta-gold)]",
          phase === "saved" && "bg-emerald-500",
        )}
      />
      {phase === "unsaved" && "Unsaved"}
      {phase === "saving" && "Saving…"}
      {phase === "saved" && "Saved"}
    </span>
  );
}
